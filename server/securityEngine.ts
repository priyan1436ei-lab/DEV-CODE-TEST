import crypto from 'node:crypto';
import type { RepoFile, SecurityFinding, Severity } from '../src/types/devmind.ts';

interface SecretPattern {
  name: string;
  regex: RegExp;
}

const SECRET_PATTERNS: SecretPattern[] = [
  { name: 'GEMINI_OR_GOOGLE_KEY', regex: /AIza[0-9A-Za-z\-_]{20,}/g },
  { name: 'OPENAI_KEY', regex: /sk-[A-Za-z0-9]{20,}/g },
  { name: 'GITHUB_TOKEN', regex: /gh[pousr]_[A-Za-z0-9]{20,}/g },
  { name: 'AWS_ACCESS_KEY', regex: /AKIA[0-9A-Z]{16}/g },
  { name: 'PRIVATE_KEY_BLOCK', regex: /-----BEGIN [A-Z ]+PRIVATE KEY-----[\s\S]*?-----END [A-Z ]+PRIVATE KEY-----/g },
  { name: 'HARDCODED_JWT_SECRET', regex: /(['"`])(?:dev_jwt_secret_[a-z0-9]+|supersecret[a-z0-9_]*)\1/gi },
];

export interface RedactionResult {
  redactedText: string;
  redactedCount: number;
  matchedTypes: string[];
}

/**
 * Section 13: Secret scanning and redaction BEFORE any text reaches an AI model.
 */
export function redactSecrets(input: string): RedactionResult {
  let redactedText = input;
  let redactedCount = 0;
  const matchedTypes = new Set<string>();

  for (const pattern of SECRET_PATTERNS) {
    redactedText = redactedText.replace(pattern.regex, (match) => {
      redactedCount += 1;
      matchedTypes.add(pattern.name);
      if (match.startsWith("'") || match.startsWith('"') || match.startsWith('`')) {
        const q = match[0];
        return `${q}[REDACTED_${pattern.name}]${q}`;
      }
      return `[REDACTED_${pattern.name}]`;
    });
  }

  return {
    redactedText,
    redactedCount,
    matchedTypes: Array.from(matchedTypes),
  };
}

/**
 * Section 13: Repository content is UNTRUSTED DATA.
 * Always wrap retrieved repository content in clearly delimited data blocks.
 */
export function wrapUntrustedRepoData(filePath: string, rawContent: string): {
  wrapped: string;
  redactedCount: number;
} {
  const { redactedText, redactedCount } = redactSecrets(rawContent);
  const safePath = filePath.replace(/["<>]/g, '');
  const wrapped = [
    `<UNTRUSTED_REPOSITORY_DATA file="${safePath}">`,
    redactedText,
    `</UNTRUSTED_REPOSITORY_DATA>`,
  ].join('\n');
  return { wrapped, redactedCount };
}

interface SecurityRule {
  ruleId: string;
  cwe: string;
  title: string;
  severity: Severity;
  regex: RegExp;
  fileFilter?: (path: string) => boolean;
  description: string;
  remediation: string;
}

const STATIC_SECURITY_RULES: SecurityRule[] = [
  {
    ruleId: 'DEVMIND-AUTH-001',
    cwe: 'CWE-347',
    title: 'JWT "alg: none" signature bypass accepted',
    severity: 'critical',
    regex: /header\.alg\s*===?\s*['"]none['"]/,
    fileFilter: (p) => !p.includes('tests/'),
    description:
      'Token verification short-circuits and returns the payload when the JWT header declares alg: "none", allowing any attacker to forge admin tokens without the signing secret.',
    remediation:
      'Reject any token whose header.alg is not strictly pinned to "HS256" before checking the signature.',
  },
  {
    ruleId: 'DEVMIND-AUTH-002',
    cwe: 'CWE-208',
    title: 'Non-constant-time cryptographic signature comparison',
    severity: 'high',
    regex: /\bsig\s*!==?\s*expectedSig\b/,
    fileFilter: (p) => !p.includes('tests/'),
    description:
      'Comparing HMAC signatures with JavaScript string inequality (!==) leaks byte-by-byte timing differences that can be exploited in timing attacks.',
    remediation:
      'Compare equal-length Buffer representations using crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig)).',
  },
  {
    ruleId: 'DEVMIND-CRYPTO-003',
    cwe: 'CWE-328',
    title: 'Weak unsalted SHA-1 / MD5 password hashing',
    severity: 'critical',
    regex: /createHash\(\s*['"](sha1|md5)['"]\s*\)/i,
    fileFilter: (p) => !p.includes('tests/'),
    description:
      'Using unsalted SHA-1 or MD5 for password storage enables instant rainbow-table and GPU brute-force recovery.',
    remediation:
      'Use crypto.scryptSync with a random 16-byte per-user salt (crypto.randomBytes(16)) and verify with crypto.timingSafeEqual.',
  },
  {
    ruleId: 'DEVMIND-SQL-004',
    cwe: 'CWE-89',
    title: 'Raw SQL string interpolation with untrusted input',
    severity: 'critical',
    regex: /SELECT\s+.+\s+FROM\s+.+\$\{[^}]+\}/i,
    fileFilter: (p) => !p.includes('tests/'),
    description:
      'Interpolating variables directly into a SQL template literal allows SQL injection attacks to bypass authentication or exfiltrate rows.',
    remediation:
      'Replace string interpolation with parameterized placeholders ($1 / ?) and pass user input strictly via the params array.',
  },
  {
    ruleId: 'DEVMIND-SECRET-005',
    cwe: 'CWE-798',
    title: 'Hardcoded fallback secret embedded in source code',
    severity: 'high',
    regex: /(?:jwtSecret|apiKey|secret)\s*=\s*.*\|\|\s*['"][^'"]{8,}['"]/i,
    fileFilter: (p) => !p.includes('tests/'),
    description:
      'A hardcoded fallback signing secret is committed to source control, allowing attackers with repository read access to forge production tokens.',
    remediation:
      'Require the secret strictly from environment configuration or an OS credential vault; fail fast in production if unset.',
  },
  {
    ruleId: 'DEVMIND-LOG-006',
    cwe: 'CWE-532',
    title: 'Sensitive authentication token written to stdout logs',
    severity: 'medium',
    regex: /console\.log\([^)]*\btoken\b[^)]*\)/i,
    fileFilter: (p) => !p.includes('tests/'),
    description:
      'Logging raw bearer/JWT session tokens exposes active user sessions in log aggregators and terminal output.',
    remediation:
      'Remove the raw token argument from log statements and log only non-sensitive metadata such as user ID or event type.',
  },
  {
    ruleId: 'DEVMIND-INJECT-007',
    cwe: 'CWE-74',
    title: 'Prompt-injection pattern detected in repository comments/docs',
    severity: 'low',
    regex: /ignore\s+(?:previous|system)\s+instructions/i,
    description:
      'Untrusted repository content contains an instruction-override phrase. DevMind isolates all repo text inside untrusted data delimiters.',
    remediation:
      'Audit untrusted comments and ensure repository content is never concatenated directly into system prompts.',
  },
  {
    ruleId: 'DEVMIND-EXEC-008',
    cwe: 'CWE-78',
    title: 'Dangerous dynamic code execution (eval / new Function)',
    severity: 'high',
    regex: /\b(?:eval\s*\(|new\s+Function\s*\()/,
    fileFilter: (p) => !p.includes('tests/'),
    description:
      'Dynamic evaluation of strings can lead to arbitrary code execution if reachable from user-controlled data.',
    remediation: 'Replace dynamic evaluation with explicit parsers or safe allowlisted dispatch tables.',
  },
];

export function scanRepositorySecurity(projectId: string, files: RepoFile[]): SecurityFinding[] {
  const findings: SecurityFinding[] = [];

  for (const file of files) {
    const lines = file.content.split('\n');
    for (const rule of STATIC_SECURITY_RULES) {
      if (rule.fileFilter && !rule.fileFilter(file.path)) continue;

      lines.forEach((lineText, idx) => {
        if (rule.regex.test(lineText)) {
          const idHash = crypto
            .createHash('sha1')
            .update(`${projectId}:${rule.ruleId}:${file.path}:${idx + 1}`)
            .digest('hex')
            .slice(0, 10);
          findings.push({
            id: `sec_${idHash}`,
            projectId,
            ruleId: rule.ruleId,
            cwe: rule.cwe,
            title: rule.title,
            severity: rule.severity,
            filePath: file.path,
            line: idx + 1,
            snippet: lineText.trim(),
            description: rule.description,
            remediation: rule.remediation,
            status: 'open',
          });
        }
      });
    }
  }

  const order: Record<Severity, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
    info: 4,
  };
  return findings.sort((a, b) => order[a.severity] - order[b.severity]);
}
