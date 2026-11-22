import crypto from 'node:crypto';
import type {
  GitHubAccountStatus,
  GitHubCommitInfo,
  GitHubRemoteConfig,
  GitHubSyncResult,
  Project,
} from '../src/types/devmind.ts';

const GITHUB_SEGMENT_RE = /^[A-Za-z0-9_.-]{1,100}$/;
const GITHUB_BRANCH_RE = /^[A-Za-z0-9._/-]{1,120}$/;

const TEXT_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.json',
  '.md',
  '.txt',
  '.css',
  '.scss',
  '.html',
  '.yml',
  '.yaml',
  '.toml',
  '.xml',
  '.sql',
  '.py',
  '.go',
  '.rs',
  '.java',
  '.kt',
  '.rb',
  '.php',
  '.sh',
  '.bat',
  '.ps1',
  '.env.example',
  '.gitignore',
  '.rules',
]);

const SKIP_PREFIXES = [
  'node_modules/',
  'dist/',
  'dist-electron/',
  'dist-server/',
  '.git/',
  'build/',
  'coverage/',
];

export interface ParsedGitHubRepo {
  owner: string;
  repo: string;
  remoteUrl: string;
}

export function parseGitHubRepoInput(rawInput: string): ParsedGitHubRepo {
  const trimmed = rawInput.trim().replace(/\.git$/i, '').replace(/\/+$/, '');
  if (!trimmed) {
    throw new Error('Enter a GitHub repository (e.g. owner/repo or https://github.com/owner/repo).');
  }

  let owner = '';
  let repo = '';

  if (/^https?:\/\//i.test(trimmed)) {
    let parsed: URL;
    try {
      parsed = new URL(trimmed);
    } catch {
      throw new Error('Invalid GitHub repository URL.');
    }
    if (parsed.protocol !== 'https:' || parsed.hostname.toLowerCase() !== 'github.com') {
      throw new Error('Only https://github.com/<owner>/<repo> URLs are permitted.');
    }
    const parts = parsed.pathname.split('/').filter(Boolean);
    if (parts.length < 2) {
      throw new Error('GitHub URL must include both owner and repository name.');
    }
    [owner, repo] = parts;
  } else {
    const parts = trimmed.split('/').filter(Boolean);
    if (parts.length !== 2) {
      throw new Error('Use "owner/repo" or "https://github.com/owner/repo" format.');
    }
    [owner, repo] = parts;
  }

  if (
    !GITHUB_SEGMENT_RE.test(owner) ||
    !GITHUB_SEGMENT_RE.test(repo) ||
    owner === '.' ||
    owner === '..' ||
    repo === '.' ||
    repo === '..'
  ) {
    throw new Error('Invalid GitHub owner or repository name.');
  }

  return {
    owner,
    repo,
    remoteUrl: `https://github.com/${owner}/${repo}`,
  };
}

export function validateGitHubBranch(rawBranch: string): string {
  const branch = rawBranch.trim();
  if (!branch || !GITHUB_BRANCH_RE.test(branch) || branch.includes('..') || branch.startsWith('/')) {
    throw new Error('Invalid Git branch name.');
  }
  return branch;
}

function isSafeRelativeFilePath(filePath: string): boolean {
  if (!filePath || filePath.length > 260) return false;
  if (filePath.includes('\0') || filePath.startsWith('/') || /^[a-zA-Z]:/.test(filePath)) return false;
  const segs = filePath.split('/');
  if (segs.some((s) => !s || s === '.' || s === '..')) return false;
  if (SKIP_PREFIXES.some((prefix) => filePath.startsWith(prefix))) return false;
  return true;
}

function isPullableTextFile(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  const base = lower.split('/').pop() || '';
  if (
    base === 'dockerfile' ||
    base === 'makefile' ||
    base === 'license' ||
    base === 'readme' ||
    base === '.gitignore' ||
    base === '.env.example'
  ) {
    return true;
  }
  const dotIdx = base.lastIndexOf('.');
  if (dotIdx === -1) return false;
  return TEXT_EXTENSIONS.has(base.slice(dotIdx));
}

export interface SessionGitHubAuth {
  accessToken: string;
  username: string;
  avatarUrl?: string;
  scopes: string[];
}

export class GitHubIntegrationService {
  private readonly sessionTokens = new Map<string, SessionGitHubAuth>();
  private readonly pendingOAuthStates = new Map<
    string,
    { sessionToken: string; createdAt: number }
  >();

  private getApiBaseUrl(): string {
    // Allow explicit loopback override ONLY when running local automated tests
    const override = String(process.env.DEVMIND_GITHUB_API_BASE || '').trim();
    if (override) {
      const parsed = new URL(override);
      if (
        (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost') &&
        parsed.protocol === 'http:'
      ) {
        return override.replace(/\/+$/, '');
      }
    }
    return 'https://api.github.com';
  }

  private async githubRequest<T>(
    endpoint: string,
    accessToken?: string,
    init: RequestInit = {}
  ): Promise<T> {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'DevMind-Studio/2.1',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init.headers as Record<string, string> | undefined),
    };
    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    }
    if (init.body && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }

    const res = await fetch(`${this.getApiBaseUrl()}${endpoint}`, {
      ...init,
      headers,
      signal: AbortSignal.timeout(20_000),
    });

    const text = await res.text();
    const json = text
      ? (() => {
          try {
            return JSON.parse(text) as Record<string, unknown>;
          } catch {
            return { message: text };
          }
        })()
      : {};

    if (!res.ok) {
      const msg =
        typeof json.message === 'string' && json.message
          ? json.message
          : `GitHub API returned HTTP ${res.status}`;
      if (res.status === 401) {
        throw new Error(`GitHub authentication failed (401): ${msg}. Check or reconnect your GitHub token.`);
      }
      if (res.status === 403) {
        throw new Error(`GitHub access denied or rate-limited (403): ${msg}`);
      }
      if (res.status === 404) {
        throw new Error(`GitHub repository or branch not found (404): ${msg}`);
      }
      throw new Error(`GitHub API error (${res.status}): ${msg}`);
    }

    return json as T;
  }

  public isOAuthConfigured(): boolean {
    return Boolean(
      String(process.env.GITHUB_CLIENT_ID || '').trim() &&
        String(process.env.GITHUB_CLIENT_SECRET || '').trim()
    );
  }

  public getAccountStatus(sessionToken: string): GitHubAccountStatus {
    const auth = this.sessionTokens.get(sessionToken);
    if (!auth) {
      return {
        connected: false,
        oauthConfigured: this.isOAuthConfigured(),
      };
    }
    return {
      connected: true,
      username: auth.username,
      avatarUrl: auth.avatarUrl,
      oauthConfigured: this.isOAuthConfigured(),
      scopes: auth.scopes,
    };
  }

  public getSessionAccessToken(sessionToken: string): string | undefined {
    return this.sessionTokens.get(sessionToken)?.accessToken;
  }

  public clearSessionAuth(sessionToken: string): void {
    this.sessionTokens.delete(sessionToken);
  }

  public async connectWithToken(
    sessionToken: string,
    rawToken: string
  ): Promise<GitHubAccountStatus> {
    const accessToken = rawToken.trim();
    if (accessToken.length < 10) {
      throw new Error('Provide a valid GitHub Personal Access Token.');
    }

    const user = await this.githubRequest<{
      login?: string;
      avatar_url?: string;
    }>('/user', accessToken);

    if (!user.login) {
      throw new Error('Could not verify GitHub user profile for this token.');
    }

    const record: SessionGitHubAuth = {
      accessToken,
      username: user.login,
      avatarUrl: user.avatar_url,
      scopes: ['repo'],
    };
    this.sessionTokens.set(sessionToken, record);
    return this.getAccountStatus(sessionToken);
  }

  public createOAuthAuthorizeUrl(sessionToken: string, originFallback?: string): string {
    const clientId = String(process.env.GITHUB_CLIENT_ID || '').trim();
    if (!clientId || !String(process.env.GITHUB_CLIENT_SECRET || '').trim()) {
      throw new Error(
        'GitHub OAuth App is not configured (set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET), or connect directly with a GitHub Personal Access Token.'
      );
    }

    // Prune stale pending states older than 10 minutes
    const cutoff = Date.now() - 10 * 60_000;
    for (const [key, val] of this.pendingOAuthStates.entries()) {
      if (val.createdAt < cutoff) this.pendingOAuthStates.delete(key);
    }

    const state = crypto.randomBytes(24).toString('hex');
    this.pendingOAuthStates.set(state, { sessionToken, createdAt: Date.now() });

    const appBase = String(process.env.APP_URL || originFallback || 'http://localhost:3000')
      .trim()
      .replace(/\/+$/, '');
    const redirectUri = `${appBase}/auth/github/callback`;

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: 'repo read:user',
      state,
    });

    return `https://github.com/login/oauth/authorize?${params.toString()}`;
  }

  public async completeOAuthCallback(code: string, state: string): Promise<GitHubAccountStatus> {
    const pending = this.pendingOAuthStates.get(state);
    if (!pending) {
      throw new Error('Invalid or expired GitHub OAuth state parameter.');
    }
    this.pendingOAuthStates.delete(state);

    const clientId = String(process.env.GITHUB_CLIENT_ID || '').trim();
    const clientSecret = String(process.env.GITHUB_CLIENT_SECRET || '').trim();
    if (!clientId || !clientSecret) {
      throw new Error('GitHub OAuth server credentials are not configured.');
    }

    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
      }),
      signal: AbortSignal.timeout(15_000),
    });

    const tokenJson = (await tokenRes.json().catch(() => ({}))) as {
      access_token?: string;
      error_description?: string;
      error?: string;
    };

    if (!tokenRes.ok || !tokenJson.access_token) {
      throw new Error(
        tokenJson.error_description || tokenJson.error || 'GitHub OAuth code exchange failed.'
      );
    }

    return this.connectWithToken(pending.sessionToken, tokenJson.access_token);
  }

  public async linkRepository(
    repoInput: string,
    requestedBranch?: string,
    accessToken?: string
  ): Promise<{ remote: GitHubRemoteConfig; commits: GitHubCommitInfo[] }> {
    const parsed = parseGitHubRepoInput(repoInput);
    const repoInfo = await this.githubRequest<{
      default_branch?: string;
      html_url?: string;
    }>(`/repos/${parsed.owner}/${parsed.repo}`, accessToken);

    const branch = validateGitHubBranch(
      requestedBranch?.trim() || repoInfo.default_branch || 'main'
    );

    // Confirm target branch exists on remote
    const branchInfo = await this.githubRequest<{
      commit?: { sha?: string; commit?: { message?: string } };
    }>(`/repos/${parsed.owner}/${parsed.repo}/branches/${encodeURIComponent(branch)}`, accessToken);

    const commits = await this.listCommits(parsed.owner, parsed.repo, branch, accessToken).catch(
      () => []
    );

    const remote: GitHubRemoteConfig = {
      owner: parsed.owner,
      repo: parsed.repo,
      branch,
      remoteUrl: repoInfo.html_url || parsed.remoteUrl,
      connected: true,
      lastSyncedAt: new Date().toISOString(),
      lastCommitSha: branchInfo.commit?.sha || commits[0]?.sha,
      lastCommitMessage:
        branchInfo.commit?.commit?.message?.split('\n')[0] || commits[0]?.message,
      lastSyncDirection: 'linked',
    };

    return { remote, commits };
  }

  public async listCommits(
    owner: string,
    repo: string,
    branch: string,
    accessToken?: string
  ): Promise<GitHubCommitInfo[]> {
    const items = await this.githubRequest<
      Array<{
        sha?: string;
        html_url?: string;
        commit?: {
          message?: string;
          author?: { name?: string; date?: string };
        };
      }>
    >(
      `/repos/${owner}/${repo}/commits?sha=${encodeURIComponent(branch)}&per_page=10`,
      accessToken
    );

    if (!Array.isArray(items)) return [];
    return items
      .filter((item) => Boolean(item.sha))
      .map((item) => ({
        sha: String(item.sha),
        shortSha: String(item.sha).slice(0, 7),
        message: String(item.commit?.message || '').split('\n')[0] || '(no commit message)',
        author: String(item.commit?.author?.name || 'GitHub'),
        date: String(item.commit?.author?.date || new Date().toISOString()),
        url: String(item.html_url || `https://github.com/${owner}/${repo}/commit/${item.sha}`),
      }));
  }

  public async pullFromRemote(
    remote: GitHubRemoteConfig,
    accessToken?: string
  ): Promise<{
    files: Array<{ path: string; content: string }>;
    commitSha: string;
    commitMessage: string;
    result: GitHubSyncResult;
  }> {
    const branchInfo = await this.githubRequest<{
      commit?: { sha?: string; commit?: { message?: string } };
    }>(
      `/repos/${remote.owner}/${remote.repo}/branches/${encodeURIComponent(remote.branch)}`,
      accessToken
    );

    const commitSha = String(branchInfo.commit?.sha || '');
    const commitMessage =
      String(branchInfo.commit?.commit?.message || '').split('\n')[0] || 'Remote commit';

    if (!commitSha) {
      throw new Error(`Could not resolve HEAD commit on branch "${remote.branch}".`);
    }

    const treeRes = await this.githubRequest<{
      tree?: Array<{ path?: string; type?: string; sha?: string; size?: number }>;
    }>(
      `/repos/${remote.owner}/${remote.repo}/git/trees/${encodeURIComponent(commitSha)}?recursive=1`,
      accessToken
    );

    const blobs = (treeRes.tree || [])
      .filter(
        (entry) =>
          entry.type === 'blob' &&
          typeof entry.path === 'string' &&
          typeof entry.sha === 'string' &&
          (entry.size ?? 0) <= 250_000 &&
          isSafeRelativeFilePath(entry.path) &&
          isPullableTextFile(entry.path)
      )
      .slice(0, 50);

    const files: Array<{ path: string; content: string }> = [];

    for (const entry of blobs) {
      const blob = await this.githubRequest<{ content?: string; encoding?: string }>(
        `/repos/${remote.owner}/${remote.repo}/git/blobs/${encodeURIComponent(entry.sha!)}`,
        accessToken
      );
      let content = '';
      if (blob.encoding === 'base64' && typeof blob.content === 'string') {
        content = Buffer.from(blob.content.replace(/\n/g, ''), 'base64').toString('utf8');
      } else if (typeof blob.content === 'string') {
        content = blob.content;
      }
      if (!content.includes('\0')) {
        files.push({ path: entry.path!, content });
      }
    }

    return {
      files,
      commitSha,
      commitMessage,
      result: {
        ok: true,
        commitSha,
        commitUrl: `https://github.com/${remote.owner}/${remote.repo}/commit/${commitSha}`,
        branch: remote.branch,
        pulledFiles: files.map((f) => f.path),
        message: `Pulled ${files.length} file${files.length === 1 ? '' : 's'} from ${remote.owner}/${remote.repo}@${remote.branch} (${commitSha.slice(0, 7)}).`,
      },
    };
  }

  public async pushStagedFiles(
    project: Project,
    options: {
      stagedPaths: string[];
      commitMessage: string;
      accessToken: string;
    }
  ): Promise<GitHubSyncResult> {
    const remote = project.githubRemote;
    if (!remote || !remote.connected) {
      throw new Error('Link a GitHub repository to this project before pushing commits.');
    }
    if (!options.accessToken.trim()) {
      throw new Error('Connect your GitHub account or Personal Access Token with repo write permission before pushing.');
    }

    const message = options.commitMessage.trim();
    if (!message || message.length > 500) {
      throw new Error('Commit message must be between 1 and 500 characters.');
    }

    const uniquePaths = Array.from(
      new Set(options.stagedPaths.map((p) => p.trim()).filter(Boolean))
    );
    if (uniquePaths.length === 0) {
      throw new Error('Stage at least one file before committing and pushing.');
    }

    const filesToPush = uniquePaths.map((filePath) => {
      if (!isSafeRelativeFilePath(filePath)) {
        throw new Error(`Invalid staged file path: ${filePath}`);
      }
      const match = project.files.find((f) => f.path === filePath);
      if (!match) {
        throw new Error(`Staged file "${filePath}" does not exist in the current project.`);
      }
      return match;
    });

    const base = `/repos/${remote.owner}/${remote.repo}`;

    // 1. Resolve current branch HEAD commit SHA
    const refData = await this.githubRequest<{ object?: { sha?: string } }>(
      `${base}/git/ref/heads/${encodeURIComponent(remote.branch)}`,
      options.accessToken
    );
    const parentSha = refData.object?.sha;
    if (!parentSha) {
      throw new Error(`Unable to read HEAD ref for branch "${remote.branch}".`);
    }

    // 2. Resolve base tree SHA from parent commit
    const parentCommit = await this.githubRequest<{ tree?: { sha?: string } }>(
      `${base}/git/commits/${encodeURIComponent(parentSha)}`,
      options.accessToken
    );
    const baseTreeSha = parentCommit.tree?.sha;
    if (!baseTreeSha) {
      throw new Error('Unable to resolve base Git tree SHA from parent commit.');
    }

    // 3. Create Git blobs strictly for the user's staged files
    const treeEntries: Array<{
      path: string;
      mode: '100644';
      type: 'blob';
      sha: string;
    }> = [];

    for (const file of filesToPush) {
      const blob = await this.githubRequest<{ sha?: string }>(
        `${base}/git/blobs`,
        options.accessToken,
        {
          method: 'POST',
          body: JSON.stringify({
            content: Buffer.from(file.content, 'utf8').toString('base64'),
            encoding: 'base64',
          }),
        }
      );
      if (!blob.sha) {
        throw new Error(`Failed to upload Git blob for ${file.path}.`);
      }
      treeEntries.push({
        path: file.path,
        mode: '100644',
        type: 'blob',
        sha: blob.sha,
      });
    }

    // 4. Create new tree built on top of base_tree
    const newTree = await this.githubRequest<{ sha?: string }>(
      `${base}/git/trees`,
      options.accessToken,
      {
        method: 'POST',
        body: JSON.stringify({
          base_tree: baseTreeSha,
          tree: treeEntries,
        }),
      }
    );
    if (!newTree.sha) {
      throw new Error('GitHub did not return a new tree SHA.');
    }

    // 5. Create commit pointing to parentSha + newTree.sha
    const newCommit = await this.githubRequest<{ sha?: string; html_url?: string }>(
      `${base}/git/commits`,
      options.accessToken,
      {
        method: 'POST',
        body: JSON.stringify({
          message,
          tree: newTree.sha,
          parents: [parentSha],
        }),
      }
    );
    if (!newCommit.sha) {
      throw new Error('GitHub did not return a new commit SHA.');
    }

    // 6. Fast-forward branch reference (force: false prevents overwriting divergent remote commits)
    await this.githubRequest(
      `${base}/git/refs/heads/${encodeURIComponent(remote.branch)}`,
      options.accessToken,
      {
        method: 'PATCH',
        body: JSON.stringify({
          sha: newCommit.sha,
          force: false,
        }),
      }
    );

    const pushedPaths = filesToPush.map((f) => f.path);
    return {
      ok: true,
      commitSha: newCommit.sha,
      commitUrl:
        newCommit.html_url ||
        `https://github.com/${remote.owner}/${remote.repo}/commit/${newCommit.sha}`,
      branch: remote.branch,
      pushedFiles: pushedPaths,
      message: `Committed & pushed ${pushedPaths.length} staged file${
        pushedPaths.length === 1 ? '' : 's'
      } to ${remote.owner}/${remote.repo}@${remote.branch} (${newCommit.sha.slice(0, 7)}).`,
    };
  }
}

export const githubService = new GitHubIntegrationService();
