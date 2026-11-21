import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const rootDir = process.cwd();
const distDir = path.join(rootDir, 'dist');
const serverBundlePath = path.join(rootDir, 'dist-server', 'server.cjs');

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  [PASS] ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  [FAIL] ${name}`);
    console.error(`         ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function apiRequest(baseUrl, method, route, { token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${baseUrl}${route}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: res.status, headers: res.headers, text, json };
}

function checkSseConnect(baseUrl, token) {
  return new Promise((resolve, reject) => {
    const req = http.get(`${baseUrl}/api/v1/events?token=${encodeURIComponent(token)}`, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`Expected SSE 200, got ${res.statusCode}`));
      }
      let buf = '';
      res.on('data', (chunk) => {
        buf += chunk.toString('utf8');
        if (buf.includes('"type":"connected"')) {
          req.destroy();
          resolve(buf);
        }
      });
    });
    req.setTimeout(4000, () => {
      req.destroy();
      reject(new Error('SSE stream timed out before connected event'));
    });
    req.on('error', (err) => {
      if (err && err.code === 'ECONNRESET') return;
      reject(err);
    });
  });
}

async function runSuite() {
  console.log('\n=== DevMind Studio Full End-to-End & Windows EXE Packaging Verification ===\n');

  // 1. Verify build artifacts & Electron scripts before launching server
  await test('Production dist/ and dist-server/server.cjs artifacts exist', async () => {
    assert.ok(fs.existsSync(path.join(distDir, 'index.html')), 'dist/index.html missing');
    assert.ok(fs.existsSync(path.join(distDir, 'icon.png')), 'dist/icon.png missing');
    assert.ok(fs.existsSync(serverBundlePath), 'dist-server/server.cjs missing');
  });

  await test('Windows multi-resolution icon.ico header is valid', async () => {
    const icoPath = path.join(rootDir, 'electron', 'assets', 'icon.ico');
    assert.ok(fs.existsSync(icoPath), 'electron/assets/icon.ico missing');
    const buf = fs.readFileSync(icoPath);
    assert.ok(buf.length > 10000, 'icon.ico unexpectedly small');
    assert.equal(buf.readUInt16LE(0), 0, 'Invalid ICO reserved header');
    assert.equal(buf.readUInt16LE(2), 1, 'Invalid ICO type header');
    assert.ok(buf.readUInt16LE(4) >= 1, 'ICO contains zero images');
  });

  await test('Electron main.cjs and preload.cjs pass Node syntax validation', async () => {
    execFileSync(process.execPath, ['--check', path.join(rootDir, 'electron', 'main.cjs')]);
    execFileSync(process.execPath, ['--check', path.join(rootDir, 'electron', 'preload.cjs')]);
  });

  await test('electron-builder.yml references valid artifact templates and unpacked bundles', async () => {
    const yml = fs.readFileSync(path.join(rootDir, 'electron-builder.yml'), 'utf8');
    assert.ok(yml.includes('dist-server/**/*'), 'dist-server/**/* missing from electron-builder.yml');
    assert.ok(yml.includes('dist/**/*'), 'dist/**/* missing from electron-builder.yml');
    assert.ok(yml.includes('electron/assets/icon.ico'), 'Windows icon missing from electron-builder.yml');
    assert.ok(!yml.includes('${target}'), 'Invalid ${target} macro found in electron-builder.yml');
  });

  // Boot the EXACT standalone CommonJS server bundle that Electron runs on Windows
  const tmpDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'devmind-e2e-'));
  process.env.DEVMIND_EMBEDDED = '1';
  process.env.NODE_ENV = 'production';
  process.env.DEVMIND_DATA_DIR = tmpDataDir;
  process.env.DEVMIND_DIST_DIR = distDir;

  const serverModule = require(serverBundlePath);
  assert.equal(typeof serverModule.startServer, 'function', 'startServer export missing');

  const { server, port } = await serverModule.startServer({
    port: 0,
    host: '127.0.0.1',
    distDir,
    dataDir: tmpDataDir,
  });
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    let token = '';
    let createdProjectId = '';
    let createdTaskId = '';

    await test('GET /api/v1/health returns 200 OK', async () => {
      const res = await apiRequest(baseUrl, 'GET', '/api/v1/health');
      assert.equal(res.status, 200);
      assert.equal(res.json?.ok, true);
      assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    });

    await test('GET / serves production SPA HTML and static PWA assets', async () => {
      const html = await apiRequest(baseUrl, 'GET', '/');
      assert.equal(html.status, 200);
      assert.ok(html.text.includes('DevMind Studio'), 'SPA HTML missing title');

      const icon = await fetch(`${baseUrl}/icon.png`);
      assert.equal(icon.status, 200);
    });

    await test('Unauthenticated requests to protected routes & SSE are rejected with 401', async () => {
      const proj = await apiRequest(baseUrl, 'GET', '/api/v1/projects');
      assert.equal(proj.status, 401);
      const sse = await apiRequest(baseUrl, 'GET', '/api/v1/events');
      assert.equal(sse.status, 401);
    });

    await test('Malformed JSON payload returns clean 400 JSON error', async () => {
      const res = await fetch(`${baseUrl}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{bad json',
      });
      assert.equal(res.status, 400);
      const body = await res.json();
      assert.ok(body.error);
    });

    await test('Auth login creates session and GET /api/v1/auth/session validates it', async () => {
      const login = await apiRequest(baseUrl, 'POST', '/api/v1/auth/login', {
        body: {
          displayName: 'E2E Engineer',
          email: 'qa@devmind.studio',
          provider: 'openai',
          localWorkspaceOnly: true,
        },
      });
      assert.equal(login.status, 201);
      assert.ok(login.json?.token);
      token = login.json.token;

      const sess = await apiRequest(baseUrl, 'GET', '/api/v1/auth/session', { token });
      assert.equal(sess.status, 200);
      assert.equal(sess.json?.session?.email, 'qa@devmind.studio');
    });

    await test('Real-time SSE event stream connects with authenticated session token', async () => {
      const payload = await checkSseConnect(baseUrl, token);
      assert.ok(payload.includes('"type":"connected"'));
    });

    await test('Projects CRUD, file save/delete, path-traversal guard, AST reindex & hybrid search', async () => {
      const list = await apiRequest(baseUrl, 'GET', '/api/v1/projects', { token });
      assert.equal(list.status, 200);
      assert.ok(Array.isArray(list.json?.projects) && list.json.projects.length >= 1);

      const created = await apiRequest(baseUrl, 'POST', '/api/v1/projects', {
        token,
        body: {
          name: 'E2E Verification Repo',
          description: 'Automated test project',
          localPath: 'C:\\Workspaces\\e2e-repo',
          files: [
            {
              path: 'src/auth.ts',
              content:
                'export function verifyToken(input: string) {\n  const apiKey = "sk-test-123456789012345678901234567890";\n  return eval(input);\n}\n',
            },
            {
              path: 'src/index.ts',
              content: 'import { verifyToken } from "./auth";\nexport const run = () => verifyToken("1+1");\n',
            },
          ],
        },
      });
      assert.equal(created.status, 201);
      createdProjectId = created.json.project.id;

      // Path traversal must be rejected
      const traversal = await apiRequest(baseUrl, 'PUT', `/api/v1/projects/${createdProjectId}/files`, {
        token,
        body: { path: '../../evil.ts', content: 'export {};' },
      });
      assert.equal(traversal.status, 400);

      // Valid file upsert
      const saved = await apiRequest(baseUrl, 'PUT', `/api/v1/projects/${createdProjectId}/files`, {
        token,
        body: { path: 'src/utils.ts', content: 'export const add = (a: number, b: number) => a + b;\n' },
      });
      assert.equal(saved.status, 200);
      assert.ok(saved.json.project.files.some((f) => f.path === 'src/utils.ts'));

      // Reindex + architecture + hybrid search
      const reindexed = await apiRequest(baseUrl, 'POST', `/api/v1/projects/${createdProjectId}/index`, { token });
      assert.equal(reindexed.status, 200);
      const arch = await apiRequest(baseUrl, 'GET', `/api/v1/projects/${createdProjectId}/architecture`, { token });
      assert.equal(arch.status, 200);
      assert.ok(arch.json.architecture.totalFiles >= 3);

      const search = await apiRequest(baseUrl, 'POST', `/api/v1/projects/${createdProjectId}/search`, {
        token,
        body: { query: 'verifyToken' },
      });
      assert.equal(search.status, 200);
      assert.ok(Array.isArray(search.json.hits) && search.json.hits.length >= 1);

      // Delete added file
      const del = await apiRequest(baseUrl, 'DELETE', `/api/v1/projects/${createdProjectId}/files`, {
        token,
        body: { path: 'src/utils.ts' },
      });
      assert.equal(del.status, 200);
      assert.ok(!del.json.project.files.some((f) => f.path === 'src/utils.ts'));
    });

    await test('Security Center detects CWE issues in repository files', async () => {
      const sec = await apiRequest(baseUrl, 'GET', `/api/v1/projects/${createdProjectId}/security`, { token });
      assert.equal(sec.status, 200);
      assert.ok(Array.isArray(sec.json.findings) && sec.json.findings.length >= 1);
    });

    await test('Extension Host lifecycle (list, toggle, activate, execute command)', async () => {
      const list = await apiRequest(baseUrl, 'GET', `/api/v1/extensions?projectId=${createdProjectId}`, { token });
      assert.equal(list.status, 200);
      const extensions = list.json?.host?.extensions || [];
      assert.ok(extensions.length >= 1);

      const firstInstalled = extensions.find((e) => e.installed) || extensions[0];
      const extId = firstInstalled.manifest.id;
      if (!firstInstalled.installed) {
        const inst = await apiRequest(baseUrl, 'POST', `/api/v1/extensions/${extId}/install`, {
          token,
          body: { projectId: createdProjectId },
        });
        assert.equal(inst.status, 200);
      }

      const toggledOff = await apiRequest(baseUrl, 'POST', `/api/v1/extensions/${extId}/toggle`, {
        token,
        body: { enabled: false, projectId: createdProjectId },
      });
      assert.equal(toggledOff.status, 200);

      const toggledOn = await apiRequest(baseUrl, 'POST', `/api/v1/extensions/${extId}/toggle`, {
        token,
        body: { enabled: true, projectId: createdProjectId },
      });
      assert.equal(toggledOn.status, 200);

      const act = await apiRequest(baseUrl, 'POST', `/api/v1/extensions/${extId}/activate`, {
        token,
        body: { projectId: createdProjectId },
      });
      assert.equal(act.status, 200);

      const cmd = act.json?.host?.activeCommands?.[0];
      if (cmd) {
        const exec = await apiRequest(baseUrl, 'POST', '/api/v1/extensions/commands/execute', {
          token,
          body: {
            commandId: cmd.id,
            projectId: createdProjectId,
            filePath: 'src/auth.ts',
          },
        });
        assert.equal(exec.status, 200);
        assert.equal(exec.json.ok, true);
      }
    });

    await test('Engineering Task workflow: create, priority filter, priority update, approval/rollback', async () => {
      const created = await apiRequest(baseUrl, 'POST', '/api/v1/agent/tasks', {
        token,
        body: {
          projectId: createdProjectId,
          title: 'Remove unsafe eval call',
          description: 'Replace eval() in src/auth.ts with safe string check',
          executionMode: 'approval',
          priority: 'high',
        },
      });
      assert.equal(created.status, 201);
      createdTaskId = created.json.task.id;
      assert.equal(created.json.task.priority, 'high');

      const filtered = await apiRequest(
        baseUrl,
        'GET',
        `/api/v1/agent/tasks?projectId=${createdProjectId}&priority=high`,
        { token }
      );
      assert.equal(filtered.status, 200);
      assert.ok(filtered.json.tasks.some((t) => t.id === createdTaskId));

      const patched = await apiRequest(baseUrl, 'PATCH', `/api/v1/agent/tasks/${createdTaskId}/priority`, {
        token,
        body: { priority: 'medium' },
      });
      assert.equal(patched.status, 200);
      assert.equal(patched.json.task.priority, 'medium');

      const pendingApproval = created.json.task.approvals?.find((a) => a.status === 'pending');
      if (pendingApproval) {
        const approved = await apiRequest(baseUrl, 'POST', `/api/v1/approvals/${pendingApproval.id}/decision`, {
          token,
          body: { decision: 'approve' },
        });
        assert.equal(approved.status, 200);

        const rolledBack = await apiRequest(baseUrl, 'POST', `/api/v1/agent/tasks/${createdTaskId}/rollback`, {
          token,
        });
        assert.equal(rolledBack.status, 200);
      }
    });

    await test('Repository Chat and Debugging Center analyze real repository context', async () => {
      const chat = await apiRequest(baseUrl, 'POST', `/api/v1/projects/${createdProjectId}/chat`, {
        token,
        body: { message: 'Where is verifyToken defined?' },
      });
      assert.equal(chat.status, 200);
      assert.ok(chat.json?.reply?.content);

      const debug = await apiRequest(baseUrl, 'POST', `/api/v1/projects/${createdProjectId}/debug`, {
        token,
        body: { errorLog: 'TypeError: Cannot read properties of undefined at verifyToken (src/auth.ts:2:5)' },
      });
      assert.equal(debug.status, 200);
      assert.ok(debug.json?.analysis?.rootCause);
    });

    await test('Policy Engine enforces immutable access_secrets guard, Budget & Audit endpoints work', async () => {
      const forbidden = await apiRequest(baseUrl, 'PUT', '/api/v1/policies/access_secrets', {
        token,
        body: { level: 'allowed' },
      });
      assert.equal(forbidden.status, 403);

      const budget = await apiRequest(baseUrl, 'PUT', '/api/v1/billing/budget', {
        token,
        body: { monthlyBudgetUsd: 50, monthlyTokenLimit: 4000000 },
      });
      assert.equal(budget.status, 200);
      assert.equal(budget.json.usage.monthlyBudgetUsd, 50);

      const audit = await apiRequest(baseUrl, 'GET', '/api/v1/audit', { token });
      assert.equal(audit.status, 200);
      assert.ok(Array.isArray(audit.json.auditLogs) && audit.json.auditLogs.length >= 1);
    });

    await test('State persists cleanly to writable %APPDATA%-equivalent directory & Logout revokes session', async () => {
      const stateFile = path.join(tmpDataDir, 'devmind-state.json');
      assert.ok(fs.existsSync(stateFile), 'devmind-state.json not written to DEVMIND_DATA_DIR');
      const parsed = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
      assert.ok(Array.isArray(parsed.projects) && parsed.projects.some((p) => p.id === createdProjectId));

      const logout = await apiRequest(baseUrl, 'POST', '/api/v1/auth/logout', { token });
      assert.equal(logout.status, 200);

      const afterLogout = await apiRequest(baseUrl, 'GET', '/api/v1/projects', { token });
      assert.equal(afterLogout.status, 401);
    });
  } finally {
    if (typeof server.closeAllConnections === 'function') {
      server.closeAllConnections();
    }
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(tmpDataDir, { recursive: true, force: true });
  }

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) {
    process.exit(1);
  }
}

runSuite().catch((err) => {
  console.error('[E2E Suite Fatal Error]', err);
  process.exit(1);
});
