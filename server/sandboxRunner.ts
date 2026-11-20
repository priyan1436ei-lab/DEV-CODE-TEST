import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import type {
  PermissionPolicyRule,
  RepoFile,
  TestCaseResult,
  TestCoverageSummary,
  TestFileCoverage,
  TestRun,
} from '../src/types/devmind.ts';

const execFileAsync = promisify(execFile);

export const DEFAULT_PERMISSION_POLICIES: PermissionPolicyRule[] = [
  {
    actionType: 'read_files',
    label: 'Read workspace files',
    category: 'filesystem',
    level: 'allowed',
    description: 'Read source files inside the selected project boundary.',
  },
  {
    actionType: 'search_code',
    label: 'Search repository brain',
    category: 'filesystem',
    level: 'allowed',
    description: 'Run hybrid lexical, symbol, and dependency graph queries.',
  },
  {
    actionType: 'edit_workspace_files',
    label: 'Apply multi-file code patches',
    category: 'filesystem',
    level: 'approval_required',
    description: 'Modify source files in workspace (creates rollback snapshot first).',
  },
  {
    actionType: 'run_approved_tests',
    label: 'Run sandboxed test suite',
    category: 'execution',
    level: 'allowed',
    description: 'Execute allowlisted test commands in an isolated disposable sandbox.',
  },
  {
    actionType: 'install_dependencies',
    label: 'Install packages / dependencies',
    category: 'execution',
    level: 'approval_required',
    description: 'Modify dependency manifests or fetch registry packages.',
  },
  {
    actionType: 'arbitrary_shell',
    label: 'Execute arbitrary shell commands',
    category: 'execution',
    level: 'approval_required',
    description: 'Run commands outside the verified test/build allowlist.',
  },
  {
    actionType: 'delete_files',
    label: 'Delete repository files',
    category: 'filesystem',
    level: 'approval_required',
    description: 'Remove files from the workspace tree.',
  },
  {
    actionType: 'push_remote',
    label: 'Push commits to remote Git',
    category: 'git',
    level: 'approval_required',
    description: 'Push local commits or branches to remote repositories.',
  },
  {
    actionType: 'deploy_production',
    label: 'Deploy to production',
    category: 'git',
    level: 'explicit_approval',
    description: 'Trigger production deployment pipelines.',
  },
  {
    actionType: 'access_secrets',
    label: 'Access host secrets & credentials',
    category: 'secrets',
    level: 'restricted',
    description: 'Hard-blocked. Secrets are never exposed to models or sandbox env.',
  },
];

export interface PolicyEvaluation {
  allowed: boolean;
  requiresApproval: boolean;
  blocked: boolean;
  reason: string;
}

export function evaluatePolicy(
  actionType: string,
  policies: PermissionPolicyRule[],
  targetPaths: string[] = []
): PolicyEvaluation {
  // Enforce strict workspace path boundary (block directory traversal & absolute paths)
  for (const p of targetPaths) {
    const normalized = path.posix.normalize(p.replace(/\\/g, '/'));
    if (normalized.startsWith('..') || normalized.startsWith('/') || normalized.includes('/../')) {
      return {
        allowed: false,
        requiresApproval: false,
        blocked: true,
        reason: `Blocked workspace escape attempt on path "${p}".`,
      };
    }
  }

  const rule = policies.find((r) => r.actionType === actionType);
  if (!rule) {
    return {
      allowed: false,
      requiresApproval: true,
      blocked: false,
      reason: `Unregistered action "${actionType}" requires explicit developer approval.`,
    };
  }

  if (rule.level === 'restricted') {
    return {
      allowed: false,
      requiresApproval: false,
      blocked: true,
      reason: `Policy violation: "${rule.label}" is strictly restricted.`,
    };
  }

  if (rule.level === 'approval_required' || rule.level === 'explicit_approval') {
    return {
      allowed: false,
      requiresApproval: true,
      blocked: false,
      reason: `Policy checkpoint: "${rule.label}" requires developer approval before execution.`,
    };
  }

  return {
    allowed: true,
    requiresApproval: false,
    blocked: false,
    reason: `Allowed within workspace policy (${rule.label}).`,
  };
}

/**
 * Parses TAP output produced by `node --test` / `tsx --test` into structured test cases.
 */
function parseTapOutput(stdout: string): {
  cases: TestCaseResult[];
  passed: number;
  failed: number;
} {
  const lines = stdout.split('\n');
  const cases: TestCaseResult[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const okMatch = line.match(/^ok \d+ - (.+)$/);
    if (okMatch) {
      let durationMs = 1;
      for (let j = i + 1; j < Math.min(lines.length, i + 6); j++) {
        const dur = lines[j].match(/duration_ms:\s*([\d.]+)/);
        if (dur) {
          durationMs = Math.max(1, Math.round(Number(dur[1])));
          break;
        }
        if (/^(?:ok|not ok) \d+/.test(lines[j])) break;
      }
      cases.push({ name: okMatch[1].trim(), status: 'pass', durationMs });
      continue;
    }

    const failMatch = line.match(/^not ok \d+ - (.+)$/);
    if (failMatch) {
      let durationMs = 1;
      const errLines: string[] = [];
      for (let j = i + 1; j < Math.min(lines.length, i + 25); j++) {
        const l = lines[j];
        if (/^(?:ok|not ok) \d+/.test(l) || /^1\.\.\d+/.test(l)) break;
        const dur = l.match(/duration_ms:\s*([\d.]+)/);
        if (dur) durationMs = Math.max(1, Math.round(Number(dur[1])));
        if (l.includes('error:') || l.includes('AssertionError') || l.includes('actual:') || l.includes('expected:')) {
          errLines.push(l.trim());
        }
      }
      cases.push({
        name: failMatch[1].trim(),
        status: 'fail',
        durationMs,
        errorMessage: errLines.join(' | ') || 'Assertion failed',
      });
    }
  }

  const passed = cases.filter((c) => c.status === 'pass').length;
  const failed = cases.filter((c) => c.status === 'fail').length;
  return { cases, passed, failed };
}

/**
 * Parses Node 22 `--experimental-test-coverage` TAP report into structured source coverage metrics.
 */
function parseTapCoverage(stdout: string): TestCoverageSummary | undefined {
  const lines = stdout.split('\n');
  const startIdx = lines.findIndex((l) => l.includes('start of coverage report'));
  const endIdx = lines.findIndex((l) => l.includes('end of coverage report'));
  if (startIdx < 0 || endIdx <= startIdx) return undefined;

  const files: TestFileCoverage[] = [];
  let allFilesRow: { linePercent: number; branchPercent: number; funcsPercent: number } | null = null;
  let currentDir = '';

  for (let i = startIdx + 1; i < endIdx; i++) {
    const raw = lines[i].replace(/^#\s?/, '');
    if (!raw.includes('|') || raw.trim().startsWith('file') || /^[-+\s]+$/.test(raw)) {
      continue;
    }

    const cols = raw.split('|').map((c) => c.trim());
    if (cols.length < 4) continue;

    const rawFileCol = raw.split('|')[0];
    const name = cols[0];
    const linePct = Number.parseFloat(cols[1]);
    const branchPct = Number.parseFloat(cols[2]);
    const funcsPct = Number.parseFloat(cols[3]);
    const uncoveredLines = cols[4] ?? '';

    if (name === 'all files' && Number.isFinite(linePct)) {
      allFilesRow = {
        linePercent: Number(linePct.toFixed(1)),
        branchPercent: Number((Number.isFinite(branchPct) ? branchPct : 0).toFixed(1)),
        funcsPercent: Number((Number.isFinite(funcsPct) ? funcsPct : 0).toFixed(1)),
      };
      continue;
    }

    // Directory header row has no numeric percentages
    if (!Number.isFinite(linePct)) {
      const cleanedDir = name.replace(/\/$/, '').trim();
      if (cleanedDir) currentDir = cleanedDir;
      continue;
    }

    const isIndented = /^\s{2,}/.test(rawFileCol);
    const fullPath = isIndented && currentDir ? `${currentDir}/${name}` : name;

    files.push({
      file: fullPath,
      linePercent: Number(linePct.toFixed(1)),
      branchPercent: Number((Number.isFinite(branchPct) ? branchPct : 0).toFixed(1)),
      funcsPercent: Number((Number.isFinite(funcsPct) ? funcsPct : 0).toFixed(1)),
      uncoveredLines,
    });
  }

  // Prefer source files (excluding tests/) for accurate production code coverage
  const sourceFiles = files.filter((f) => !f.file.includes('tests/') && !f.file.includes('.test.'));
  const targetFiles = sourceFiles.length > 0 ? sourceFiles : files;

  if (targetFiles.length === 0 && !allFilesRow) return undefined;

  if (sourceFiles.length > 0) {
    const avg = (arr: number[]) =>
      Number((arr.reduce((sum, n) => sum + n, 0) / arr.length).toFixed(1));
    return {
      linePercent: avg(sourceFiles.map((f) => f.linePercent)),
      branchPercent: avg(sourceFiles.map((f) => f.branchPercent)),
      funcsPercent: avg(sourceFiles.map((f) => f.funcsPercent)),
      files: sourceFiles,
    };
  }

  return {
    linePercent: allFilesRow?.linePercent ?? targetFiles[0]?.linePercent ?? 0,
    branchPercent: allFilesRow?.branchPercent ?? targetFiles[0]?.branchPercent ?? 0,
    funcsPercent: allFilesRow?.funcsPercent ?? targetFiles[0]?.funcsPercent ?? 0,
    files: targetFiles,
  };
}

/**
 * Section 13: Isolated Disposable Sandbox Execution.
 * Writes project files to an ephemeral temp directory, strips host secrets from env,
 * executes allowlisted test runner with strict timeout, captures real output, and cleans up.
 */
export async function runSandboxedTests(
  projectId: string,
  files: RepoFile[],
  taskId?: string
): Promise<TestRun> {
  const sandboxId = `sbx_${crypto.randomBytes(4).toString('hex')}`;
  const sandboxDir = await fs.mkdtemp(path.join(os.tmpdir(), `devmind-${sandboxId}-`));
  const startedAt = Date.now();

  const testFiles = files
    .map((f) => f.path)
    .filter((p) => /(?:^|\/)tests\/.+\.(?:ts|js|mjs)$/.test(p) || /\.test\.(?:ts|js|mjs)$/.test(p));

  const commandDisplay =
    testFiles.length > 0 ? `node --test ${testFiles.join(' ')}` : 'node --test';

  try {
    // Materialize workspace files inside isolated temp directory with traversal guard
    for (const file of files) {
      const safeRel = path.posix.normalize(file.path.replace(/\\/g, '/'));
      if (safeRel.startsWith('..') || safeRel.startsWith('/')) {
        throw new Error(`Blocked unsafe file path in sandbox: ${file.path}`);
      }
      const target = path.join(sandboxDir, safeRel);
      if (!target.startsWith(sandboxDir)) {
        throw new Error(`Sandbox escape prevented for: ${file.path}`);
      }
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, file.content, 'utf8');
    }

    if (testFiles.length === 0) {
      return {
        id: `tr_${crypto.randomBytes(5).toString('hex')}`,
        projectId,
        taskId,
        command: commandDisplay,
        sandboxId,
        status: 'error',
        exitCode: 1,
        passedCount: 0,
        failedCount: 0,
        totalCount: 0,
        durationMs: Date.now() - startedAt,
        stdout: '',
        stderr: 'No test files matching tests/*.test.ts or *.test.ts found in workspace.',
        cases: [],
        createdAt: new Date().toISOString(),
      };
    }

    // Resolve local tsx binary so sandbox runs with stripped host secrets (no GEMINI_API_KEY!)
    const tsxBin = path.resolve(process.cwd(), 'node_modules', '.bin', 'tsx');
    const cleanEnv: NodeJS.ProcessEnv = {
      PATH: process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin',
      NODE_ENV: 'test',
      HOME: sandboxDir,
      TMPDIR: sandboxDir,
      DEVMIND_SANDBOX: '1',
    };

    let stdout = '';
    let stderr = '';
    let exitCode = 0;

    try {
      const res = await execFileAsync(
        tsxBin,
        ['--test', '--experimental-test-coverage', '--test-reporter=tap', ...testFiles],
        {
          cwd: sandboxDir,
          env: cleanEnv,
          timeout: 12000,
          maxBuffer: 1024 * 1024,
        }
      );
      stdout = res.stdout;
      stderr = res.stderr;
      exitCode = 0;
    } catch (err: unknown) {
      const execErr = err as {
        code?: number | string;
        stdout?: string;
        stderr?: string;
        message?: string;
      };
      stdout = execErr.stdout ?? '';
      stderr = execErr.stderr ?? execErr.message ?? 'Test execution failed';
      exitCode = typeof execErr.code === 'number' ? execErr.code : 1;
    }

    const parsed = parseTapOutput(stdout);
    const coverage = parseTapCoverage(stdout);
    const totalCount = parsed.cases.length;
    const status: TestRun['status'] =
      exitCode === 0 && parsed.failed === 0 && totalCount > 0 ? 'passed' : 'failed';

    return {
      id: `tr_${crypto.randomBytes(5).toString('hex')}`,
      projectId,
      taskId,
      command: commandDisplay,
      sandboxId,
      status,
      exitCode,
      passedCount: parsed.passed,
      failedCount: parsed.failed,
      totalCount,
      durationMs: Math.max(1, Date.now() - startedAt),
      stdout: stdout.trim(),
      stderr: stderr.trim(),
      cases: parsed.cases,
      coverage,
      createdAt: new Date().toISOString(),
    };
  } finally {
    // Always dispose ephemeral sandbox container directory
    await fs.rm(sandboxDir, { recursive: true, force: true }).catch(() => {});
  }
}
