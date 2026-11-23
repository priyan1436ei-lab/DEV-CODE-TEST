import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  CloudOff,
  Download,
  ExternalLink,
  FileCode2,
  GitBranch,
  GitCommitHorizontal,
  KeyRound,
  Link2,
  Loader2,
  Minus,
  Plus,
  RefreshCw,
  Unlink,
  Upload,
} from 'lucide-react';
import { devmindApi } from '../services/api';
import type {
  GitHubAccountStatus,
  GitHubCommitInfo,
  Project,
} from '../types/devmind';

interface GitHubSyncViewProps {
  project: Project | null;
  isOnline: boolean;
  pendingSyncFiles: Set<string>;
  onProjectUpdated: (project: Project) => void;
  onOpenFile: (filePath: string) => void;
  onNotify: (text: string, tone?: 'info' | 'error') => void;
}

export const GitHubSyncView: React.FC<GitHubSyncViewProps> = ({
  project,
  isOnline,
  pendingSyncFiles,
  onProjectUpdated,
  onOpenFile,
  onNotify,
}) => {
  const [account, setAccount] = useState<GitHubAccountStatus>({
    connected: false,
    oauthConfigured: false,
  });
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [patInput, setPatInput] = useState('');
  const [connectingAuth, setConnectingAuth] = useState(false);

  const [repoInput, setRepoInput] = useState(
    project?.githubRemote
      ? `${project.githubRemote.owner}/${project.githubRemote.repo}`
      : project?.remoteUrl || ''
  );
  const [branchInput, setBranchInput] = useState(
    project?.githubRemote?.branch || project?.defaultBranch || 'main'
  );
  const [linkingRepo, setLinkingRepo] = useState(false);

  const [commits, setCommits] = useState<GitHubCommitInfo[]>([]);
  const [loadingCommits, setLoadingCommits] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [pushing, setPushing] = useState(false);

  // Granular Staging Area state: tracks exactly which file paths will be included in the next commit
  const [stagedPaths, setStagedPaths] = useState<Set<string>>(() => new Set());
  const [showCleanFiles, setShowCleanFiles] = useState(false);
  const [commitSummary, setCommitSummary] = useState('');
  const [commitBody, setCommitBody] = useState('');
  const [inlineError, setInlineError] = useState<string | null>(null);

  const loadGitHubStatus = useCallback(async () => {
    try {
      const res = await devmindApi.getGitHubStatus();
      setAccount(res.status);
    } catch {
      // Offline or unauthenticated
    } finally {
      setLoadingStatus(false);
    }
  }, []);

  const loadCommits = useCallback(async () => {
    if (!project?.id || !project.githubRemote?.connected || !isOnline) {
      setCommits([]);
      return;
    }
    setLoadingCommits(true);
    try {
      const res = await devmindApi.listGitHubCommits(project.id);
      setCommits(res.commits);
    } catch {
      // Non-fatal
    } finally {
      setLoadingCommits(false);
    }
  }, [project?.id, project?.githubRemote?.connected, isOnline]);

  useEffect(() => {
    void loadGitHubStatus();
  }, [loadGitHubStatus]);

  useEffect(() => {
    setRepoInput(
      project?.githubRemote
        ? `${project.githubRemote.owner}/${project.githubRemote.repo}`
        : project?.remoteUrl || ''
    );
    setBranchInput(project?.githubRemote?.branch || project?.defaultBranch || 'main');
    setStagedPaths(new Set());
    setInlineError(null);
  }, [project?.id, project?.githubRemote?.owner, project?.githubRemote?.repo, project?.githubRemote?.branch]);

  useEffect(() => {
    void loadCommits();
  }, [loadCommits]);

  // Listen for GitHub OAuth popup completion via postMessage
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const origin = event.origin;
      if (
        !origin.endsWith('.run.app') &&
        !origin.includes('localhost') &&
        !origin.includes('127.0.0.1')
      ) {
        return;
      }
      if (event.data?.type === 'GITHUB_OAUTH_SUCCESS') {
        void loadGitHubStatus();
        onNotify(
          event.data.username
            ? `Connected GitHub account @${event.data.username}.`
            : 'Connected GitHub account via OAuth.'
        );
      } else if (event.data?.type === 'GITHUB_OAUTH_ERROR') {
        setInlineError(String(event.data.error || 'GitHub OAuth sign-in failed.'));
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [loadGitHubStatus, onNotify]);

  // Prune any staged path that was deleted from the project
  useEffect(() => {
    if (!project) return;
    const validPaths = new Set(project.files.map((f) => f.path));
    setStagedPaths((prev) => {
      let changed = false;
      const next = new Set<string>();
      for (const p of prev) {
        if (validPaths.has(p)) {
          next.add(p);
        } else {
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [project]);

  const modifiedFiles = useMemo(() => {
    if (!project) return [];
    return project.files.filter((f) => {
      const isPending =
        pendingSyncFiles.has(`${project.id}:${f.path}`) || f.syncStatus === 'pending-sync';
      return f.gitStatus !== 'clean' || isPending;
    });
  }, [project, pendingSyncFiles]);

  const stagedFiles = useMemo(() => {
    if (!project) return [];
    return project.files.filter((f) => stagedPaths.has(f.path));
  }, [project, stagedPaths]);

  const unstagedFiles = useMemo(() => {
    if (!project) return [];
    const pool = showCleanFiles ? project.files : modifiedFiles;
    return pool.filter((f) => !stagedPaths.has(f.path));
  }, [project, showCleanFiles, modifiedFiles, stagedPaths]);

  const stageFile = (filePath: string) => {
    setStagedPaths((prev) => {
      const next = new Set(prev);
      next.add(filePath);
      return next;
    });
  };

  const unstageFile = (filePath: string) => {
    setStagedPaths((prev) => {
      const next = new Set(prev);
      next.delete(filePath);
      return next;
    });
  };

  const stageAllModified = () => {
    setStagedPaths((prev) => {
      const next = new Set(prev);
      for (const file of modifiedFiles) {
        next.add(file.path);
      }
      return next;
    });
  };

  const unstageAll = () => {
    setStagedPaths(new Set());
  };

  const handleConnectOAuth = async () => {
    if (!isOnline) {
      setInlineError('Internet connectivity is required to authenticate with GitHub.');
      return;
    }
    setInlineError(null);
    setConnectingAuth(true);
    try {
      const res = await devmindApi.getGitHubOAuthUrl(window.location.origin);
      const popup = window.open(res.url, 'devmind_github_oauth', 'width=600,height=720');
      if (!popup) {
        setInlineError('Popup was blocked by your browser. Allow popups or use a Personal Access Token below.');
      }
    } catch (err) {
      setInlineError(err instanceof Error ? err.message : 'Unable to start GitHub OAuth.');
    } finally {
      setConnectingAuth(false);
    }
  };

  const handleConnectToken = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!patInput.trim()) return;
    if (!isOnline) {
      setInlineError('Internet connectivity is required to verify your GitHub token.');
      return;
    }
    setInlineError(null);
    setConnectingAuth(true);
    try {
      const res = await devmindApi.connectGitHubToken(patInput.trim());
      setAccount(res.status);
      setPatInput('');
      onNotify(`Connected GitHub account @${res.status.username}.`);
    } catch (err) {
      setInlineError(err instanceof Error ? err.message : 'GitHub token verification failed.');
    } finally {
      setConnectingAuth(false);
    }
  };

  const handleDisconnectGitHub = async () => {
    setInlineError(null);
    try {
      const res = await devmindApi.disconnectGitHub();
      setAccount(res.status);
      onNotify('Disconnected GitHub credentials from this session.');
    } catch (err) {
      setInlineError(err instanceof Error ? err.message : 'Failed to disconnect GitHub.');
    }
  };

  const handleLinkRepo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!project || !repoInput.trim()) return;
    if (!isOnline) {
      setInlineError('Internet connectivity is required to verify and link a remote GitHub repository.');
      return;
    }
    setInlineError(null);
    setLinkingRepo(true);
    try {
      const res = await devmindApi.linkGitHubRepo(project.id, {
        repo: repoInput.trim(),
        branch: branchInput.trim() || undefined,
      });
      onProjectUpdated(res.project);
      setCommits(res.commits);
      onNotify(`Linked ${res.remote.owner}/${res.remote.repo} (${res.remote.branch}).`);
    } catch (err) {
      setInlineError(err instanceof Error ? err.message : 'Failed to link GitHub repository.');
    } finally {
      setLinkingRepo(false);
    }
  };

  const handleUnlinkRepo = async () => {
    if (!project) return;
    setInlineError(null);
    setLinkingRepo(true);
    try {
      const res = await devmindApi.unlinkGitHubRepo(project.id);
      onProjectUpdated(res.project);
      setCommits([]);
      onNotify('Unlinked remote GitHub repository.');
    } catch (err) {
      setInlineError(err instanceof Error ? err.message : 'Failed to unlink repository.');
    } finally {
      setLinkingRepo(false);
    }
  };

  const handlePull = async () => {
    if (!project?.githubRemote?.connected || !isOnline) return;
    setInlineError(null);
    setPulling(true);
    try {
      const res = await devmindApi.pullGitHubRepo(project.id);
      onProjectUpdated(res.project);
      setCommits(res.commits);
      setStagedPaths(new Set());
      onNotify(res.result.message);
    } catch (err) {
      setInlineError(err instanceof Error ? err.message : 'Pull from GitHub failed.');
    } finally {
      setPulling(false);
    }
  };

  const handleCommitAndPush = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!project?.githubRemote?.connected || !isOnline) return;
    if (stagedFiles.length === 0) {
      setInlineError('Stage at least one file before committing and pushing.');
      return;
    }
    if (!commitSummary.trim()) {
      setInlineError('Enter a commit message before pushing.');
      return;
    }

    const fullMessage = commitBody.trim()
      ? `${commitSummary.trim()}\n\n${commitBody.trim()}`
      : commitSummary.trim();

    setInlineError(null);
    setPushing(true);
    try {
      const pathsToPush = stagedFiles.map((f) => f.path);
      const res = await devmindApi.pushStagedGitHubFiles(project.id, {
        stagedPaths: pathsToPush,
        commitMessage: fullMessage,
      });
      onProjectUpdated(res.project);
      setCommits(res.commits);
      setStagedPaths((prev) => {
        const next = new Set(prev);
        for (const p of pathsToPush) next.delete(p);
        return next;
      });
      setCommitSummary('');
      setCommitBody('');
      onNotify(res.result.message);
    } catch (err) {
      setInlineError(err instanceof Error ? err.message : 'Failed to commit & push staged files.');
    } finally {
      setPushing(false);
    }
  };

  if (!project) {
    return (
      <div className="h-full flex items-center justify-center text-xs text-[var(--ink-muted)]">
        Select or import a repository to configure GitHub sync.
      </div>
    );
  }

  const remote = project.githubRemote;

  return (
    <div className="h-full overflow-y-auto p-6 space-y-5 bg-[var(--surface-canvas)]">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-[var(--ink-primary)]">
            GitHub Remote &amp; Staging Area
          </h1>
          <p className="text-xs text-[var(--ink-secondary)] mt-0.5">
            Link a remote GitHub repository to <span className="font-mono">{project.name}</span>, stage specific modified files, and push or pull commits directly.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {!isOnline && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--status-warning)]/15 text-[var(--status-warning)] text-xs font-medium">
              <CloudOff className="w-3.5 h-3.5" />
              Offline (Push/Pull paused)
            </span>
          )}
          {remote?.connected && (
            <button
              type="button"
              disabled={!isOnline || pulling}
              onClick={handlePull}
              className="h-8 px-3 rounded-lg border border-[var(--border-strong)] bg-[var(--surface-elevated)] hover:bg-[var(--surface-hover)] text-xs font-medium text-[var(--ink-primary)] disabled:opacity-40 inline-flex items-center gap-1.5 transition-colors"
            >
              {pulling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              Pull from {remote.branch}
            </button>
          )}
        </div>
      </div>

      {inlineError && (
        <div className="px-3.5 py-2.5 rounded-xl border border-[var(--status-danger)]/40 bg-[var(--status-danger)]/10 text-xs text-[var(--status-danger)] flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{inlineError}</span>
        </div>
      )}

      {/* Top Row: GitHub Authentication + Remote Repository Link */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Card 1: GitHub Account Credentials */}
        <section className="rounded-2xl border border-[var(--border-hairline)] bg-[var(--surface-elevated)] p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-[var(--accent-primary)]" />
              <h2 className="text-xs font-semibold text-[var(--ink-primary)]">
                GitHub Authentication
              </h2>
            </div>
            {loadingStatus ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--ink-muted)]" />
            ) : account.connected ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--status-success)]">
                <CheckCircle2 className="w-3.5 h-3.5" />
                @{account.username}
              </span>
            ) : (
              <span className="text-[11px] text-[var(--ink-muted)]">Not connected</span>
            )}
          </div>

          {account.connected ? (
            <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-[var(--surface-canvas)] border border-[var(--border-hairline)]">
              <div className="flex items-center gap-2.5 min-w-0">
                {account.avatarUrl ? (
                  <img
                    src={account.avatarUrl}
                    alt={account.username}
                    referrerPolicy="no-referrer"
                    className="w-7 h-7 rounded-full border border-[var(--border-hairline)]"
                  />
                ) : (
                  <span className="w-7 h-7 rounded-full bg-[var(--accent-soft)] text-[var(--accent-primary)] flex items-center justify-center text-xs font-semibold">
                    {(account.username || 'G').charAt(0).toUpperCase()}
                  </span>
                )}
                <div className="min-w-0">
                  <div className="text-xs font-medium text-[var(--ink-primary)] truncate">
                    Signed in as @{account.username}
                  </div>
                  <div className="text-[11px] text-[var(--ink-muted)]">
                    Token held in server session memory only (never stored in browser localStorage)
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={handleDisconnectGitHub}
                className="h-7 px-2.5 rounded-lg border border-[var(--border-strong)] hover:bg-[var(--surface-hover)] text-[11px] font-medium text-[var(--ink-secondary)] shrink-0"
              >
                Disconnect
              </button>
            </div>
          ) : (
            <div className="space-y-2.5">
              {account.oauthConfigured && (
                <button
                  type="button"
                  disabled={!isOnline || connectingAuth}
                  onClick={handleConnectOAuth}
                  className="w-full h-8 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-[var(--accent-ink)] text-xs font-medium disabled:opacity-40 inline-flex items-center justify-center gap-1.5 transition-colors"
                >
                  {connectingAuth && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Sign in with GitHub OAuth
                </button>
              )}

              <form onSubmit={handleConnectToken} className="flex gap-2">
                <input
                  type="password"
                  value={patInput}
                  onChange={(e) => setPatInput(e.target.value)}
                  placeholder="GitHub Personal Access Token (contents:write / repo)"
                  className="flex-1 h-8 px-2.5 rounded-lg bg-[var(--surface-canvas)] border border-[var(--border-hairline)] text-xs font-mono text-[var(--ink-primary)] focus:border-[var(--accent-primary)]"
                />
                <button
                  type="submit"
                  disabled={!isOnline || connectingAuth || !patInput.trim()}
                  className="h-8 px-3 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-[var(--accent-ink)] text-xs font-medium disabled:opacity-40 inline-flex items-center gap-1.5 shrink-0 transition-colors"
                >
                  {connectingAuth && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Connect
                </button>
              </form>
              <p className="text-[11px] text-[var(--ink-muted)]">
                Public repos can be linked and pulled read-only; connecting a token is required for private repos and pushing commits.
              </p>
            </div>
          )}
        </section>

        {/* Card 2: Remote Repository Link */}
        <section className="rounded-2xl border border-[var(--border-hairline)] bg-[var(--surface-elevated)] p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Link2 className="w-4 h-4 text-[var(--accent-primary)]" />
              <h2 className="text-xs font-semibold text-[var(--ink-primary)]">
                Linked Remote Repository
              </h2>
            </div>
            {remote?.connected && (
              <a
                href={remote.remoteUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[11px] text-[var(--accent-primary)] hover:underline"
              >
                {remote.owner}/{remote.repo}
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>

          <form onSubmit={handleLinkRepo} className="flex flex-wrap gap-2">
            <input
              type="text"
              value={repoInput}
              onChange={(e) => setRepoInput(e.target.value)}
              placeholder="owner/repo or https://github.com/owner/repo"
              className="flex-1 min-w-[180px] h-8 px-2.5 rounded-lg bg-[var(--surface-canvas)] border border-[var(--border-hairline)] text-xs font-mono text-[var(--ink-primary)] focus:border-[var(--accent-primary)]"
            />
            <input
              type="text"
              value={branchInput}
              onChange={(e) => setBranchInput(e.target.value)}
              placeholder="main"
              aria-label="Target branch"
              className="w-28 h-8 px-2.5 rounded-lg bg-[var(--surface-canvas)] border border-[var(--border-hairline)] text-xs font-mono text-[var(--ink-primary)] focus:border-[var(--accent-primary)]"
            />
            <button
              type="submit"
              disabled={!isOnline || linkingRepo || !repoInput.trim()}
              className="h-8 px-3 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-[var(--accent-ink)] text-xs font-medium disabled:opacity-40 inline-flex items-center gap-1.5 transition-colors"
            >
              {linkingRepo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <GitBranch className="w-3.5 h-3.5" />}
              {remote?.connected ? 'Update Link' : 'Link Repo'}
            </button>
            {remote?.connected && (
              <button
                type="button"
                disabled={linkingRepo}
                onClick={handleUnlinkRepo}
                title="Unlink remote repository"
                className="h-8 px-2.5 rounded-lg border border-[var(--border-strong)] hover:bg-[var(--surface-hover)] text-xs text-[var(--ink-secondary)] inline-flex items-center gap-1"
              >
                <Unlink className="w-3.5 h-3.5" />
              </button>
            )}
          </form>

          {remote?.connected ? (
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-[var(--ink-muted)] pt-0.5">
              <span>
                Branch: <strong className="text-[var(--ink-primary)]">{remote.branch}</strong>
                {remote.lastCommitSha ? ` · HEAD ${remote.lastCommitSha.slice(0, 7)}` : ''}
              </span>
              {remote.lastSyncedAt && (
                <span>
                  Last {remote.lastSyncDirection || 'sync'}:{' '}
                  {new Date(remote.lastSyncedAt).toLocaleTimeString()}
                </span>
              )}
            </div>
          ) : (
            <p className="text-[11px] text-[var(--ink-muted)]">
              Enter any GitHub repository slug or HTTPS URL to bind pull and staged push operations to this project.
            </p>
          )}
        </section>
      </div>

      {/* Main Feature: Interactive Staging Area + Commit & Push */}
      <section className="rounded-2xl border border-[var(--border-hairline)] bg-[var(--surface-elevated)] overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--border-hairline)] flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-xs font-semibold text-[var(--ink-primary)]">
              Staging Area — Granular Commit Selection
            </h2>
            <p className="text-[11px] text-[var(--ink-secondary)]">
              Select specific modified files to include in your next commit. Unstaged edits stay local and untouched.
            </p>
          </div>
          <div className="flex items-center gap-2 text-[11px] font-mono">
            <span className="text-[var(--status-success)]">{stagedFiles.length} staged</span>
            <span className="text-[var(--ink-muted)]">·</span>
            <span className="text-[var(--status-warning)]">
              {modifiedFiles.length - modifiedFiles.filter((f) => stagedPaths.has(f.path)).length}{' '}
              unstaged modified
            </span>
            <label className="ml-2 inline-flex items-center gap-1.5 text-[var(--ink-secondary)] font-sans cursor-pointer">
              <input
                type="checkbox"
                checked={showCleanFiles}
                onChange={(e) => setShowCleanFiles(e.target.checked)}
                className="rounded border-[var(--border-strong)]"
              />
              Show unchanged files
            </label>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-[var(--border-hairline)]">
          {/* Left Column: Unstaged Changes */}
          <div className="p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-muted)]">
                Unstaged Files ({unstagedFiles.length})
              </span>
              <button
                type="button"
                disabled={modifiedFiles.length === 0}
                onClick={stageAllModified}
                className="text-[11px] font-medium text-[var(--accent-primary)] hover:underline disabled:opacity-40"
              >
                Stage All Modified
              </button>
            </div>

            {unstagedFiles.length === 0 ? (
              <div className="py-8 text-center text-xs text-[var(--ink-muted)] rounded-xl border border-dashed border-[var(--border-hairline)]">
                {modifiedFiles.length === 0
                  ? 'Working tree clean — edit a file in the Code Editor or toggle "Show unchanged files".'
                  : 'All modified files are staged for the next commit.'}
              </div>
            ) : (
              <div className="space-y-1 max-h-[260px] overflow-y-auto pr-1">
                {unstagedFiles.map((file) => {
                  const isPending =
                    pendingSyncFiles.has(`${project.id}:${file.path}`) ||
                    file.syncStatus === 'pending-sync';
                  return (
                    <div
                      key={file.path}
                      className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-[var(--surface-canvas)] border border-[var(--border-hairline)] hover:border-[var(--border-strong)] transition-colors"
                    >
                      <button
                        type="button"
                        onClick={() => onOpenFile(file.path)}
                        className="flex items-center gap-2 min-w-0 text-left flex-1"
                        title="Open in Code Editor"
                      >
                        <FileCode2 className="w-3.5 h-3.5 text-[var(--ink-muted)] shrink-0" />
                        <span className="font-mono text-[11px] text-[var(--ink-primary)] truncate">
                          {file.path}
                        </span>
                      </button>

                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          className={`font-mono text-[10px] font-semibold ${
                            isPending
                              ? 'text-[var(--status-warning)]'
                              : file.gitStatus === 'added'
                              ? 'text-[var(--status-success)]'
                              : file.gitStatus === 'modified'
                              ? 'text-[var(--status-warning)]'
                              : 'text-[var(--ink-muted)]'
                          }`}
                        >
                          {isPending
                            ? 'PENDING'
                            : file.gitStatus === 'added'
                            ? 'A'
                            : file.gitStatus === 'modified'
                            ? 'M'
                            : 'CLEAN'}
                        </span>
                        <button
                          type="button"
                          onClick={() => stageFile(file.path)}
                          title={`Stage ${file.path}`}
                          className="h-6 px-2 rounded-md bg-[var(--accent-soft)] text-[var(--accent-primary)] hover:bg-[var(--accent-primary)] hover:text-white text-[11px] font-medium inline-flex items-center gap-1 transition-colors"
                        >
                          <Plus className="w-3 h-3" />
                          Stage
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right Column: Staged Changes */}
          <div className="p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--status-success)]">
                Staged for Next Commit ({stagedFiles.length})
              </span>
              <button
                type="button"
                disabled={stagedFiles.length === 0}
                onClick={unstageAll}
                className="text-[11px] font-medium text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:underline disabled:opacity-40"
              >
                Unstage All
              </button>
            </div>

            {stagedFiles.length === 0 ? (
              <div className="py-8 text-center text-xs text-[var(--ink-muted)] rounded-xl border border-dashed border-[var(--border-hairline)]">
                No files staged yet. Click <span className="font-semibold">Stage</span> on any file to include it in your next push.
              </div>
            ) : (
              <div className="space-y-1 max-h-[260px] overflow-y-auto pr-1">
                {stagedFiles.map((file) => (
                  <div
                    key={file.path}
                    className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-[var(--status-success)]/5 border border-[var(--status-success)]/30"
                  >
                    <button
                      type="button"
                      onClick={() => onOpenFile(file.path)}
                      className="flex items-center gap-2 min-w-0 text-left flex-1"
                    >
                      <Check className="w-3.5 h-3.5 text-[var(--status-success)] shrink-0" />
                      <span className="font-mono text-[11px] text-[var(--ink-primary)] truncate">
                        {file.path}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => unstageFile(file.path)}
                      title={`Unstage ${file.path}`}
                      className="h-6 px-2 rounded-md border border-[var(--border-strong)] bg-[var(--surface-canvas)] hover:bg-[var(--surface-hover)] text-[11px] font-medium text-[var(--ink-secondary)] inline-flex items-center gap-1 transition-colors shrink-0"
                    >
                      <Minus className="w-3 h-3" />
                      Unstage
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Commit Composer & Push Bar */}
        <form
          onSubmit={handleCommitAndPush}
          className="p-4 border-t border-[var(--border-hairline)] bg-[var(--surface-canvas)]/60 space-y-2.5"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            <input
              type="text"
              value={commitSummary}
              onChange={(e) => setCommitSummary(e.target.value)}
              placeholder="Commit summary (e.g. feat: add offline sync conflict guard)"
              maxLength={140}
              className="h-8 px-3 rounded-lg bg-[var(--surface-canvas)] border border-[var(--border-hairline)] text-xs text-[var(--ink-primary)] focus:border-[var(--accent-primary)]"
            />
            <input
              type="text"
              value={commitBody}
              onChange={(e) => setCommitBody(e.target.value)}
              placeholder="Optional extended commit description..."
              maxLength={320}
              className="h-8 px-3 rounded-lg bg-[var(--surface-canvas)] border border-[var(--border-hairline)] text-xs text-[var(--ink-primary)] focus:border-[var(--accent-primary)]"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] text-[var(--ink-muted)]">
              {!remote?.connected
                ? 'Link a GitHub repository above to enable Commit & Push.'
                : !account.connected
                ? 'Connect your GitHub account or Personal Access Token above to push.'
                : `Ready to commit ${stagedFiles.length} staged file${
                    stagedFiles.length === 1 ? '' : 's'
                  } to ${remote.owner}/${remote.repo}@${remote.branch}.`}
            </span>

            <button
              type="submit"
              disabled={
                !isOnline ||
                pushing ||
                !remote?.connected ||
                !account.connected ||
                stagedFiles.length === 0 ||
                !commitSummary.trim()
              }
              className="h-8 px-4 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-[var(--accent-ink)] text-xs font-medium disabled:opacity-40 inline-flex items-center gap-1.5 transition-colors"
            >
              {pushing ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Upload className="w-3.5 h-3.5" />
              )}
              Commit &amp; Push ({stagedFiles.length})
            </button>
          </div>
        </form>
      </section>

      {/* Recent Remote Commits */}
      <section className="rounded-2xl border border-[var(--border-hairline)] bg-[var(--surface-elevated)] p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <GitCommitHorizontal className="w-4 h-4 text-[var(--accent-primary)]" />
            <h2 className="text-xs font-semibold text-[var(--ink-primary)]">
              Recent Remote Commits
            </h2>
          </div>
          <button
            type="button"
            disabled={!remote?.connected || !isOnline || loadingCommits}
            onClick={() => void loadCommits()}
            className="h-7 px-2.5 rounded-lg hover:bg-[var(--surface-hover)] text-[11px] text-[var(--ink-secondary)] disabled:opacity-40 inline-flex items-center gap-1"
          >
            <RefreshCw className={`w-3 h-3 ${loadingCommits ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {!remote?.connected ? (
          <p className="text-xs text-[var(--ink-muted)] py-3">
            Link a remote repository to inspect live commit history.
          </p>
        ) : commits.length === 0 ? (
          <p className="text-xs text-[var(--ink-muted)] py-3">
            {loadingCommits ? 'Loading remote commits...' : 'No commits loaded yet.'}
          </p>
        ) : (
          <div className="divide-y divide-[var(--border-hairline)] rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-canvas)] overflow-hidden">
            {commits.map((commit) => (
              <div
                key={commit.sha}
                className="px-3.5 py-2.5 flex items-center justify-between gap-3 text-xs"
              >
                <div className="min-w-0">
                  <div className="font-medium text-[var(--ink-primary)] truncate">
                    {commit.message}
                  </div>
                  <div className="text-[11px] text-[var(--ink-muted)] mt-0.5">
                    {commit.author} · {new Date(commit.date).toLocaleString()}
                  </div>
                </div>
                <a
                  href={commit.url}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-[11px] px-2 py-0.5 rounded-md bg-[var(--surface-hover)] text-[var(--accent-primary)] hover:underline shrink-0"
                >
                  {commit.shortSha}
                </a>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
