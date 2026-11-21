import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  Blocks,
  Code2,
  FolderGit2,
  Play,
  Plus,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Wallet,
} from 'lucide-react';
import type {
  AgentTask,
  ExtensionHostSnapshot,
  Project,
  ScreenId,
  SecurityFinding,
  TaskPriority,
  UsageLedger,
} from '../types/devmind';

interface DashboardViewProps {
  projects: Project[];
  activeProject: Project | null;
  tasks: AgentTask[];
  securityFindings: SecurityFinding[];
  extensionHost: ExtensionHostSnapshot | null;
  usage: UsageLedger | null;
  onSelectProject: (projectId: string) => void;
  onNavigate: (screen: ScreenId) => void;
  onOpenImportModal: () => void;
  onReindex: () => Promise<void>;
  onExecuteExtensionCommand: (commandId: string) => Promise<void>;
  onOpenFileLine: (filePath: string, line: number) => void;
}

const PRIORITY_STYLES: Record<TaskPriority, { label: string; color: string }> = {
  high: { label: 'High', color: 'text-[var(--status-danger)]' },
  medium: { label: 'Medium', color: 'text-[var(--status-warning)]' },
  low: { label: 'Low', color: 'text-[var(--status-success)]' },
};

export const DashboardView: React.FC<DashboardViewProps> = ({
  projects,
  activeProject,
  tasks,
  securityFindings,
  extensionHost,
  usage,
  onSelectProject,
  onNavigate,
  onOpenImportModal,
  onReindex,
  onExecuteExtensionCommand,
  onOpenFileLine,
}) => {
  const [priorityFilter, setPriorityFilter] = useState<'all' | TaskPriority>('all');
  const [reindexing, setReindexing] = useState(false);
  const [runningCmd, setRunningCmd] = useState<string | null>(null);

  const openSecurityFindings = useMemo(
    () => securityFindings.filter((f) => f.status === 'open'),
    [securityFindings]
  );

  const filteredTasks = useMemo(() => {
    const list = priorityFilter === 'all' ? tasks : tasks.filter((t) => (t.priority || 'medium') === priorityFilter);
    return list.slice(0, 6);
  }, [tasks, priorityFilter]);

  const installedExtensions = useMemo(
    () => extensionHost?.extensions.filter((e) => e.installed) ?? [],
    [extensionHost]
  );
  const activeExtensionsCount = useMemo(
    () => extensionHost?.extensions.filter((e) => e.state === 'active').length ?? 0,
    [extensionHost]
  );
  const workspaceCommands = useMemo(
    () => (extensionHost?.activeCommands ?? []).filter((c) => !c.requiresActiveFile).slice(0, 5),
    [extensionHost]
  );

  const handleReindex = async () => {
    setReindexing(true);
    try {
      await onReindex();
    } finally {
      setReindexing(false);
    }
  };

  const handleRunWorkspaceCmd = async (commandId: string) => {
    setRunningCmd(commandId);
    try {
      await onExecuteExtensionCommand(commandId);
    } finally {
      setRunningCmd(null);
    }
  };

  const spendPercent = usage
    ? Math.min(100, Math.round((usage.spentUsd / Math.max(0.01, usage.monthlyBudgetUsd)) * 100))
    : 0;

  return (
    <div className="h-full overflow-y-auto bg-[var(--surface-canvas)] p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--border-hairline)] pb-4">
        <div>
          <h1 className="text-xl font-semibold text-[var(--ink-primary)] tracking-[-0.02em]">
            Workspace Overview
          </h1>
          <p className="text-xs text-[var(--ink-secondary)] mt-0.5">
            {activeProject
              ? `${activeProject.name} · ${activeProject.localPath} · ${activeProject.defaultBranch}`
              : 'Select or import a repository to begin.'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleReindex}
            disabled={!activeProject || reindexing}
            className="h-8 px-3 text-xs font-medium rounded-lg border border-[var(--border-strong)] bg-[var(--surface-elevated)] text-[var(--ink-primary)] hover:bg-[var(--surface-hover)] disabled:opacity-40 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${reindexing ? 'animate-spin' : ''}`} />
            Re-Index AST
          </button>

          <button
            type="button"
            onClick={() => onNavigate('extensions')}
            className="h-8 px-3 text-xs font-medium rounded-lg border border-[var(--border-strong)] bg-[var(--surface-elevated)] text-[var(--ink-primary)] hover:bg-[var(--surface-hover)] inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
          >
            <Blocks className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
            Extensions
          </button>

          <button
            type="button"
            onClick={onOpenImportModal}
            className="h-8 px-3.5 text-xs font-semibold rounded-lg bg-[var(--accent-primary)] text-[var(--accent-ink)] hover:bg-[var(--accent-hover)] inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            Import Repository
          </button>
        </div>
      </div>

      {/* 4 Apple Metric Tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="p-4 apple-card">
          <div className="flex items-center justify-between text-xs text-[var(--ink-secondary)]">
            <span className="font-medium">Indexed Codebase</span>
            <Code2 className="w-4 h-4 text-[var(--accent-primary)]" />
          </div>
          <div className="mt-2.5 text-2xl font-semibold font-mono tabular-nums text-[var(--ink-primary)]">
            {activeProject?.architecture.totalFiles ?? 0}{' '}
            <span className="text-xs font-sans font-normal text-[var(--ink-muted)]">files</span>
          </div>
          <div className="mt-1 text-[11px] font-mono tabular-nums text-[var(--ink-muted)]">
            {activeProject?.architecture.totalSymbols ?? 0} symbols · {activeProject?.architecture.totalLines ?? 0} LOC
          </div>
        </div>

        <button
          type="button"
          onClick={() => onNavigate('extensions')}
          className="text-left p-4 apple-card hover:border-[var(--accent-primary)] transition-colors"
        >
          <div className="flex items-center justify-between text-xs text-[var(--ink-secondary)]">
            <span className="font-medium">Extension Host</span>
            <Blocks className="w-4 h-4 text-[var(--accent-primary)]" />
          </div>
          <div className="mt-2.5 text-2xl font-semibold font-mono tabular-nums text-[var(--ink-primary)]">
            {activeExtensionsCount}{' '}
            <span className="text-xs font-sans font-normal text-[var(--ink-muted)]">
              active / {installedExtensions.length} installed
            </span>
          </div>
          <div className="mt-1 text-[11px] font-mono tabular-nums text-[var(--ink-muted)]">
            {extensionHost?.activeCommands.length ?? 0} commands · {extensionHost?.diagnostics.length ?? 0} diagnostics
          </div>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('security')}
          className="text-left p-4 apple-card hover:border-[var(--accent-primary)] transition-colors"
        >
          <div className="flex items-center justify-between text-xs text-[var(--ink-secondary)]">
            <span className="font-medium">Static Security Scan</span>
            {openSecurityFindings.length > 0 ? (
              <ShieldAlert className="w-4 h-4 text-[var(--status-danger)]" />
            ) : (
              <ShieldCheck className="w-4 h-4 text-[var(--status-success)]" />
            )}
          </div>
          <div className="mt-2.5 text-2xl font-semibold font-mono tabular-nums text-[var(--ink-primary)]">
            {openSecurityFindings.length}{' '}
            <span className="text-xs font-sans font-normal text-[var(--ink-muted)]">open findings</span>
          </div>
          <div className="mt-1 text-[11px] font-mono tabular-nums text-[var(--ink-muted)]">
            {usage?.secretsRedactedTotal ?? 0} secrets redacted · {usage?.unauthorizedActionsBlocked ?? 0} blocked
          </div>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('settings')}
          className="text-left p-4 apple-card hover:border-[var(--accent-primary)] transition-colors"
        >
          <div className="flex items-center justify-between text-xs text-[var(--ink-secondary)]">
            <span className="font-medium">Monthly Spend Guard</span>
            <Wallet className="w-4 h-4 text-[var(--accent-primary)]" />
          </div>
          <div className="mt-2.5 text-2xl font-semibold font-mono tabular-nums text-[var(--ink-primary)]">
            ${(usage?.spentUsd ?? 0).toFixed(4)}
          </div>
          <div className="mt-2.5 h-1.5 w-full rounded-full bg-[var(--surface-hover)] overflow-hidden">
            <div
              className="h-full rounded-full bg-[var(--accent-primary)] transition-all"
              style={{ width: `${spendPercent}%` }}
            />
          </div>
          <div className="mt-1.5 text-[11px] font-mono tabular-nums text-[var(--ink-muted)]">
            {spendPercent}% of ${(usage?.monthlyBudgetUsd ?? 25).toFixed(2)} cap
          </div>
        </button>
      </div>

      {/* Main Two-Column Section */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        {/* Left Column: Repositories + Recent Engineering Tasks */}
        <div className="xl:col-span-7 space-y-5">
          <section className="apple-card overflow-hidden">
            <div className="px-4 py-3 border-b border-[var(--border-hairline)] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FolderGit2 className="w-4 h-4 text-[var(--accent-primary)]" />
                <h2 className="text-xs font-semibold text-[var(--ink-primary)]">
                  Workspace Repositories ({projects.length})
                </h2>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('explorer')}
                className="text-xs font-medium text-[var(--accent-primary)] hover:underline inline-flex items-center gap-1"
              >
                Open Editor <ArrowRight className="w-3 h-3" />
              </button>
            </div>

            <div className="divide-y divide-[var(--border-hairline)]">
              {Array.from(new Map(projects.map((p) => [p.id, p])).values()).map((proj) => {
                const isSelected = activeProject?.id === proj.id;
                return (
                  <button
                    key={proj.id}
                    type="button"
                    onClick={() => onSelectProject(proj.id)}
                    className={`w-full px-4 py-3 text-left flex items-center justify-between gap-4 transition-colors ${
                      isSelected ? 'bg-[var(--accent-soft)]' : 'hover:bg-[var(--surface-hover)]'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-semibold text-[var(--ink-primary)] truncate">
                          {proj.name}
                        </span>
                        <span className="text-[11px] font-mono text-[var(--ink-muted)]">
                          {proj.framework} · {proj.primaryLanguage}
                        </span>
                      </div>
                      <p className="text-[11px] text-[var(--ink-secondary)] truncate mt-0.5 font-mono">
                        {proj.localPath}
                      </p>
                    </div>
                    <div className="text-right shrink-0 font-mono text-[11px] tabular-nums text-[var(--ink-muted)]">
                      <div>{proj.files.length} files</div>
                      <div>{proj.symbols.length} symbols</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Recent Engineering Tasks with Apple Segmented Priority Filter */}
          <section className="apple-card overflow-hidden">
            <div className="px-4 py-3 border-b border-[var(--border-hairline)] flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xs font-semibold text-[var(--ink-primary)]">
                Recent Engineering Tasks
              </h2>
              <div className="flex items-center gap-2.5">
                <div className="apple-segmented" role="group" aria-label="Filter dashboard tasks by priority">
                  {(['all', 'high', 'medium', 'low'] as const).map((level) => (
                    <button
                      key={level}
                      type="button"
                      data-active={priorityFilter === level}
                      onClick={() => setPriorityFilter(level)}
                      className="apple-segmented-item h-6 px-2 text-[11px] font-medium capitalize text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]"
                    >
                      {level}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate('history')}
                  className="text-xs font-medium text-[var(--accent-primary)] hover:underline"
                >
                  View All
                </button>
              </div>
            </div>

            {filteredTasks.length === 0 ? (
              <div className="px-4 py-8 text-center text-xs text-[var(--ink-muted)]">
                No tasks matching the selected priority level yet. Create a task in the right inspector panel.
              </div>
            ) : (
              <div className="divide-y divide-[var(--border-hairline)]">
                {filteredTasks.map((task) => {
                  const p = PRIORITY_STYLES[task.priority || 'medium'];
                  return (
                    <div
                      key={task.id}
                      className="px-4 py-3 flex items-center justify-between gap-4 hover:bg-[var(--surface-hover)] transition-colors"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-[11px] font-semibold uppercase font-mono ${p.color}`}>
                            {p.label}
                          </span>
                          <span className="text-[13px] font-medium text-[var(--ink-primary)] truncate">
                            {task.title}
                          </span>
                        </div>
                        <div className="text-[11px] text-[var(--ink-muted)] mt-0.5 font-mono tabular-nums">
                          {task.status.replace('_', ' ')} · {task.changes.length} patch(es) ·{' '}
                          {new Date(task.createdAt).toLocaleTimeString()}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => onNavigate('history')}
                        className="text-xs font-medium text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] shrink-0"
                      >
                        Inspect
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        {/* Right Column: Active Extensions & Security Highlights */}
        <div className="xl:col-span-5 space-y-5">
          <section className="apple-card overflow-hidden">
            <div className="px-4 py-3 border-b border-[var(--border-hairline)] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Blocks className="w-4 h-4 text-[var(--accent-primary)]" />
                <h2 className="text-xs font-semibold text-[var(--ink-primary)]">
                  Extension Quick Commands
                </h2>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('extensions')}
                className="text-xs font-medium text-[var(--accent-primary)] hover:underline"
              >
                Manage
              </button>
            </div>

            {workspaceCommands.length === 0 ? (
              <div className="px-4 py-6 text-xs text-[var(--ink-muted)]">
                Enable workspace extensions in the Marketplace to trigger live workspace scans and utilities.
              </div>
            ) : (
              <div className="divide-y divide-[var(--border-hairline)]">
                {workspaceCommands.map((cmd) => (
                  <div
                    key={cmd.id}
                    className="px-4 py-2.5 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-[var(--ink-primary)] truncate">
                        {cmd.category}: {cmd.title}
                      </div>
                      <div className="text-[11px] text-[var(--ink-muted)] truncate">
                        {cmd.extensionName}
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={runningCmd !== null}
                      onClick={() => handleRunWorkspaceCmd(cmd.id)}
                      className="h-7 px-2.5 text-[11px] font-medium rounded-lg border border-[var(--border-strong)] bg-[var(--surface-canvas)] text-[var(--ink-primary)] hover:bg-[var(--surface-hover)] disabled:opacity-40 inline-flex items-center gap-1 shrink-0 transition-colors"
                    >
                      <Play className="w-3 h-3 text-[var(--accent-primary)]" />
                      {runningCmd === cmd.id ? 'Running...' : 'Run'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="apple-card overflow-hidden">
            <div className="px-4 py-3 border-b border-[var(--border-hairline)] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-[var(--status-danger)]" />
                <h2 className="text-xs font-semibold text-[var(--ink-primary)]">
                  Open Security Findings ({openSecurityFindings.length})
                </h2>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('security')}
                className="text-xs font-medium text-[var(--accent-primary)] hover:underline"
              >
                Security Center
              </button>
            </div>

            {openSecurityFindings.length === 0 ? (
              <div className="px-4 py-6 text-xs text-[var(--status-success)] flex items-center gap-2">
                <ShieldCheck className="w-4 h-4" />
                Zero open security findings in this repository.
              </div>
            ) : (
              <div className="divide-y divide-[var(--border-hairline)]">
                {openSecurityFindings.slice(0, 5).map((finding) => (
                  <button
                    key={finding.id}
                    type="button"
                    onClick={() => onOpenFileLine(finding.filePath, finding.line)}
                    className="w-full px-4 py-2.5 text-left hover:bg-[var(--surface-hover)] flex items-start justify-between gap-3 transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-[var(--ink-primary)] truncate">
                        {finding.title}
                      </div>
                      <div className="text-[11px] font-mono text-[var(--ink-muted)] mt-0.5">
                        {finding.filePath}:{finding.line} · {finding.cwe}
                      </div>
                    </div>
                    <span
                      className={`text-[11px] font-mono uppercase shrink-0 ${
                        finding.severity === 'critical' || finding.severity === 'high'
                          ? 'text-[var(--status-danger)]'
                          : 'text-[var(--status-warning)]'
                      }`}
                    >
                      {finding.severity}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};
