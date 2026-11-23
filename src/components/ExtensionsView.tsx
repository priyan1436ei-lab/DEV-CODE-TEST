import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Blocks,
  CheckCircle2,
  Download,
  ExternalLink,
  GitBranch,
  KeyRound,
  Play,
  Power,
  PowerOff,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Terminal,
  Trash2,
  XCircle,
} from 'lucide-react';
import type {
  ExtensionCategory,
  ExtensionHostSnapshot,
  ExtensionPermission,
  ExtensionRecord,
} from '../types/devmind';

interface ExtensionsViewProps {
  host: ExtensionHostSnapshot | null;
  activeProjectId: string;
  activeFilePath: string | null;
  onInstall: (extensionId: string) => Promise<void>;
  onUninstall: (extensionId: string, cascade?: boolean) => Promise<void>;
  onToggle: (extensionId: string, enabled: boolean) => Promise<void>;
  onActivate: (extensionId: string) => Promise<void>;
  onExecuteCommand: (commandId: string, filePath?: string) => Promise<void>;
  onRefresh: () => Promise<void>;
}

type FilterTab = 'marketplace' | 'installed' | 'enabled' | 'disabled';
type DetailTab = 'overview' | 'permissions' | 'dependencies' | 'runtime';

const PERMISSION_META: Record<ExtensionPermission, { label: string; description: string; risk: 'low' | 'medium' | 'high' }> = {
  'workspace.read': {
    label: 'Workspace Read',
    description: 'Read source files, symbols, and repository structure from the active project.',
    risk: 'low',
  },
  'workspace.write': {
    label: 'Workspace Write',
    description: 'Modify source files in the active project when explicitly invoked by a user command.',
    risk: 'high',
  },
  'editor.diagnostics': {
    label: 'Editor Diagnostics',
    description: 'Publish warnings, errors, and informational hints to the Problems panel and code editor.',
    risk: 'low',
  },
  'ui.commands': {
    label: 'Command Palette Contributions',
    description: 'Register executable commands in the Command Palette and Editor toolbar.',
    risk: 'low',
  },
  'ui.statusbar': {
    label: 'Status Bar Contributions',
    description: 'Render live status metrics and clickable quick triggers in the desktop status bar.',
    risk: 'low',
  },
  'events.subscribe': {
    label: 'Core Event Bus',
    description: 'Listen to core lifecycle events such as onStartupFinished, onFileSave, and onProjectChanged.',
    risk: 'medium',
  },
  'security.hooks': {
    label: 'Security Inspection Hooks',
    description: 'Inspect environment files and credentials against local static hygiene rules.',
    risk: 'medium',
  },
};

function formatDownloads(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return String(count);
}

function getStateLabel(ext: ExtensionRecord): { text: string; toneClass: string } {
  if (!ext.compatible) {
    return { text: 'Incompatible', toneClass: 'text-[var(--status-danger)]' };
  }
  if (!ext.installed) {
    return { text: 'Available', toneClass: 'text-[var(--ink-muted)]' };
  }
  if (!ext.enabled || ext.state === 'disabled') {
    return { text: 'Disabled', toneClass: 'text-[var(--status-warning)]' };
  }
  if (ext.state === 'active') {
    return { text: 'Active', toneClass: 'text-[var(--status-success)]' };
  }
  if (ext.state === 'error') {
    return { text: 'Error', toneClass: 'text-[var(--status-danger)]' };
  }
  return { text: 'Installed', toneClass: 'text-[var(--accent-primary)]' };
}

export const ExtensionsView: React.FC<ExtensionsViewProps> = ({
  host,
  activeFilePath,
  onInstall,
  onUninstall,
  onToggle,
  onActivate,
  onExecuteCommand,
  onRefresh,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTab, setFilterTab] = useState<FilterTab>('marketplace');
  const [categoryFilter, setCategoryFilter] = useState<ExtensionCategory | 'all'>('all');
  const [selectedId, setSelectedId] = useState<string>('devmind.code-formatter');
  const [detailTab, setDetailTab] = useState<DetailTab>('overview');
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [cascadeConfirmId, setCascadeConfirmId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<{ tone: 'info' | 'error'; text: string } | null>(null);

  const extensions = host?.extensions ?? [];

  const filteredExtensions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return extensions.filter((ext) => {
      if (filterTab === 'installed' && !ext.installed) return false;
      if (filterTab === 'enabled' && (!ext.installed || !ext.enabled)) return false;
      if (filterTab === 'disabled' && (!ext.installed || ext.enabled)) return false;
      if (categoryFilter !== 'all' && ext.manifest.category !== categoryFilter) return false;
      if (!q) return true;
      return (
        ext.manifest.displayName.toLowerCase().includes(q) ||
        ext.manifest.id.toLowerCase().includes(q) ||
        ext.manifest.publisher.toLowerCase().includes(q) ||
        ext.manifest.description.toLowerCase().includes(q) ||
        ext.manifest.category.toLowerCase().includes(q)
      );
    });
  }, [extensions, searchQuery, filterTab, categoryFilter]);

  const selectedExtension = useMemo(() => {
    return (
      extensions.find((e) => e.manifest.id === selectedId) ||
      filteredExtensions[0] ||
      extensions[0] ||
      null
    );
  }, [extensions, filteredExtensions, selectedId]);

  const counts = useMemo(() => {
    const installed = extensions.filter((e) => e.installed).length;
    const enabled = extensions.filter((e) => e.installed && e.enabled).length;
    const disabled = extensions.filter((e) => e.installed && !e.enabled).length;
    const active = extensions.filter((e) => e.state === 'active').length;
    return { total: extensions.length, installed, enabled, disabled, active };
  }, [extensions]);

  const runAction = async (key: string, fn: () => Promise<void>, successMsg?: string) => {
    setBusyAction(key);
    setActionMessage(null);
    try {
      await fn();
      if (successMsg) {
        setActionMessage({ tone: 'info', text: successMsg });
      }
      setCascadeConfirmId(null);
    } catch (err) {
      setActionMessage({
        tone: 'error',
        text: err instanceof Error ? err.message : 'Extension operation failed.',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const extensionLogs = useMemo(() => {
    if (!host || !selectedExtension) return [];
    const specific = host.runtimeLogs.filter((l) => l.extensionId === selectedExtension.manifest.id);
    return specific.length > 0 ? specific : host.runtimeLogs.slice(0, 20);
  }, [host, selectedExtension]);

  const extensionDiagnostics = useMemo(() => {
    if (!host || !selectedExtension) return [];
    return host.diagnostics.filter((d) => d.extensionId === selectedExtension.manifest.id);
  }, [host, selectedExtension]);

  if (!host) {
    return (
      <div className="h-full flex items-center justify-center bg-[var(--surface-canvas)] text-[var(--ink-secondary)] text-sm">
        Initializing Extension Host runtime...
      </div>
    );
  }

  return (
    <div className="h-full flex bg-[var(--surface-canvas)] overflow-hidden">
      {/* Left Marketplace List Column */}
      <div className="w-[340px] shrink-0 border-r border-[var(--border-hairline)] bg-[var(--surface-sidebar)] flex flex-col">
        <div className="px-3.5 py-3 border-b border-[var(--border-hairline)] space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Blocks className="w-4 h-4 text-[var(--accent-primary)]" />
              <span className="text-xs font-semibold uppercase tracking-wider text-[var(--ink-primary)]">
                Extensions
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-mono tabular-nums text-[var(--ink-muted)]">
                Host v{host.engineVersion}
              </span>
              <button
                type="button"
                onClick={() => runAction('refresh', onRefresh)}
                disabled={busyAction !== null}
                title="Refresh Extension Host"
                className="p-1 rounded text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:bg-[var(--surface-hover)] transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${busyAction === 'refresh' ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-[var(--ink-muted)] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search extensions in Marketplace..."
              className="w-full h-8 pl-8 pr-2.5 text-xs rounded-[4px] bg-[var(--surface-canvas)] border border-[var(--border-hairline)] text-[var(--ink-primary)] placeholder:text-[var(--ink-muted)] focus:outline-none focus:border-[var(--accent-primary)]"
            />
          </div>

          <div className="flex items-center gap-1 border-b border-[var(--border-hairline)] pb-2">
            {(
              [
                { id: 'marketplace', label: 'All', count: counts.total },
                { id: 'installed', label: 'Installed', count: counts.installed },
                { id: 'enabled', label: 'Enabled', count: counts.enabled },
                { id: 'disabled', label: 'Disabled', count: counts.disabled },
              ] as Array<{ id: FilterTab; label: string; count: number }>
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilterTab(tab.id)}
                className={`px-2 py-1 text-[11px] font-medium rounded-[3px] transition-colors ${
                  filterTab === tab.id
                    ? 'bg-[var(--accent-soft)] text-[var(--accent-primary)]'
                    : 'text-[var(--ink-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--ink-primary)]'
                }`}
              >
                {tab.label}{' '}
                <span className="font-mono tabular-nums opacity-75">{tab.count}</span>
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between gap-2">
            <label htmlFor="ext-category" className="text-[11px] text-[var(--ink-muted)]">
              Category
            </label>
            <select
              id="ext-category"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value as ExtensionCategory | 'all')}
              className="h-7 px-2 text-xs rounded-[4px] bg-[var(--surface-canvas)] border border-[var(--border-hairline)] text-[var(--ink-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
            >
              <option value="all">All Categories</option>
              <option value="Formatters">Formatters</option>
              <option value="Linters">Linters</option>
              <option value="Productivity">Productivity</option>
              <option value="Security">Security</option>
              <option value="Navigation">Navigation</option>
              <option value="Runtime">Runtime</option>
            </select>
          </div>
        </div>

        {/* Extension Rows */}
        <div className="flex-1 overflow-y-auto divide-y divide-[var(--border-hairline)]">
          {filteredExtensions.length === 0 ? (
            <div className="px-4 py-10 text-center text-xs text-[var(--ink-muted)]">
              No extensions match the current filter.
            </div>
          ) : (
            filteredExtensions.map((ext) => {
              const isSelected = selectedExtension?.manifest.id === ext.manifest.id;
              const stateBadge = getStateLabel(ext);
              const isBusy = busyAction === ext.manifest.id;
              return (
                <div
                  key={ext.manifest.id}
                  onClick={() => {
                    setSelectedId(ext.manifest.id);
                    setCascadeConfirmId(null);
                  }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedId(ext.manifest.id);
                    }
                  }}
                  className={`px-3.5 py-2.5 cursor-pointer transition-colors border-l-2 ${
                    isSelected
                      ? 'bg-[var(--surface-active)] border-l-[var(--accent-primary)]'
                      : 'border-l-transparent hover:bg-[var(--surface-hover)]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[13px] font-semibold text-[var(--ink-primary)] truncate">
                          {ext.manifest.displayName}
                        </span>
                        <span className="text-[10px] font-mono text-[var(--ink-muted)] shrink-0">
                          v{ext.manifest.version}
                        </span>
                      </div>
                      <p className="text-[11px] text-[var(--ink-secondary)] line-clamp-2 mt-0.5 leading-snug">
                        {ext.manifest.description}
                      </p>
                      <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-[var(--ink-muted)]">
                        <span className="truncate">{ext.manifest.publisher}</span>
                        {ext.manifest.verifiedPublisher && (
                          <CheckCircle2 className="w-3 h-3 text-[var(--accent-primary)] shrink-0" />
                        )}
                        <span>·</span>
                        <span className="font-mono tabular-nums">{formatDownloads(ext.manifest.downloads)}</span>
                        <span>·</span>
                        <span className={`font-medium ${stateBadge.toneClass}`}>{stateBadge.text}</span>
                      </div>
                    </div>

                    <div className="shrink-0 pt-0.5" onClick={(e) => e.stopPropagation()}>
                      {!ext.installed ? (
                        <button
                          type="button"
                          disabled={!ext.compatible || isBusy}
                          onClick={() =>
                            runAction(
                              ext.manifest.id,
                              () => onInstall(ext.manifest.id),
                              `Installed ${ext.manifest.displayName}`
                            )
                          }
                          className="h-6 px-2.5 text-[11px] font-medium rounded-[3px] bg-[var(--accent-primary)] text-[var(--accent-ink)] hover:bg-[var(--accent-hover)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                          {isBusy ? '...' : 'Install'}
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() =>
                            runAction(
                              ext.manifest.id,
                              () => onToggle(ext.manifest.id, !ext.enabled),
                              `${ext.enabled ? 'Disabled' : 'Enabled'} ${ext.manifest.displayName}`
                            )
                          }
                          title={ext.enabled ? 'Disable extension' : 'Enable extension'}
                          className="h-6 px-2 text-[11px] font-medium rounded-[3px] border border-[var(--border-strong)] bg-[var(--surface-canvas)] text-[var(--ink-primary)] hover:bg-[var(--surface-hover)] disabled:opacity-40 transition-colors"
                        >
                          {isBusy ? '...' : ext.enabled ? 'Disable' : 'Enable'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer summary */}
        <div className="px-3.5 py-2 border-t border-[var(--border-hairline)] bg-[var(--surface-chrome)] flex items-center justify-between text-[11px] text-[var(--ink-muted)] font-mono tabular-nums">
          <span>{counts.active} active / {counts.installed} installed</span>
          <span>{host.activeCommands.length} commands</span>
        </div>
      </div>

      {/* Right Detail & Runtime Inspector Pane */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-[var(--surface-canvas)]">
        {selectedExtension ? (
          <>
            {/* Header */}
            <div className="px-6 py-5 border-b border-[var(--border-hairline)] bg-[var(--surface-elevated)]">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <h1 className="text-lg font-semibold text-[var(--ink-primary)] tracking-tight">
                      {selectedExtension.manifest.displayName}
                    </h1>
                    <span className="text-xs font-mono text-[var(--ink-muted)]">
                      v{selectedExtension.manifest.version}
                    </span>
                    <span className={`text-xs font-medium ${getStateLabel(selectedExtension).toneClass}`}>
                      {getStateLabel(selectedExtension).text}
                    </span>
                  </div>

                  <div className="mt-1 flex items-center gap-2 text-xs text-[var(--ink-secondary)] flex-wrap">
                    <span className="font-mono text-[var(--ink-muted)]">{selectedExtension.manifest.id}</span>
                    <span>·</span>
                    <span className="inline-flex items-center gap-1">
                      {selectedExtension.manifest.publisher}
                      {selectedExtension.manifest.verifiedPublisher && (
                        <CheckCircle2 className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                      )}
                    </span>
                    <span>·</span>
                    <span>{selectedExtension.manifest.category}</span>
                    <span>·</span>
                    <span className="font-mono tabular-nums">
                      {selectedExtension.manifest.downloads.toLocaleString()} installs
                    </span>
                    <span>·</span>
                    <span>{selectedExtension.manifest.license} License</span>
                  </div>

                  <p className="mt-2.5 text-sm text-[var(--ink-secondary)] max-w-3xl leading-relaxed">
                    {selectedExtension.manifest.description}
                  </p>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-2 shrink-0">
                  {!selectedExtension.installed ? (
                    <button
                      type="button"
                      disabled={!selectedExtension.compatible || busyAction !== null}
                      onClick={() =>
                        runAction(
                          selectedExtension.manifest.id,
                          () => onInstall(selectedExtension.manifest.id),
                          `Installed ${selectedExtension.manifest.displayName} and resolved dependencies.`
                        )
                      }
                      className="h-8 px-3.5 text-xs font-medium rounded-[4px] bg-[var(--accent-primary)] text-[var(--accent-ink)] hover:bg-[var(--accent-hover)] disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1.5 transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Install Extension
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        disabled={busyAction !== null}
                        onClick={() =>
                          runAction(
                            selectedExtension.manifest.id,
                            () => onToggle(selectedExtension.manifest.id, !selectedExtension.enabled),
                            `${selectedExtension.enabled ? 'Disabled' : 'Enabled'} ${selectedExtension.manifest.displayName}.`
                          )
                        }
                        className="h-8 px-3 text-xs font-medium rounded-[4px] border border-[var(--border-strong)] bg-[var(--surface-canvas)] text-[var(--ink-primary)] hover:bg-[var(--surface-hover)] inline-flex items-center gap-1.5 transition-colors"
                      >
                        {selectedExtension.enabled ? (
                          <>
                            <PowerOff className="w-3.5 h-3.5 text-[var(--status-warning)]" />
                            Disable
                          </>
                        ) : (
                          <>
                            <Power className="w-3.5 h-3.5 text-[var(--status-success)]" />
                            Enable
                          </>
                        )}
                      </button>

                      {selectedExtension.enabled && selectedExtension.state !== 'active' && (
                        <button
                          type="button"
                          disabled={busyAction !== null}
                          onClick={() =>
                            runAction(
                              `activate:${selectedExtension.manifest.id}`,
                              () => onActivate(selectedExtension.manifest.id),
                              `Activated ${selectedExtension.manifest.displayName}.`
                            )
                          }
                          className="h-8 px-3 text-xs font-medium rounded-[4px] bg-[var(--accent-primary)] text-[var(--accent-ink)] hover:bg-[var(--accent-hover)] inline-flex items-center gap-1.5 transition-colors"
                        >
                          <Play className="w-3.5 h-3.5" />
                          Activate Now
                        </button>
                      )}

                      <button
                        type="button"
                        disabled={busyAction !== null}
                        onClick={() => {
                          if (selectedExtension.dependents.length > 0 && cascadeConfirmId !== selectedExtension.manifest.id) {
                            setCascadeConfirmId(selectedExtension.manifest.id);
                            return;
                          }
                          runAction(
                            `uninstall:${selectedExtension.manifest.id}`,
                            () => onUninstall(selectedExtension.manifest.id, selectedExtension.dependents.length > 0),
                            `Uninstalled ${selectedExtension.manifest.displayName}.`
                          );
                        }}
                        className="h-8 px-3 text-xs font-medium rounded-[4px] border border-[var(--border-strong)] bg-[var(--surface-canvas)] text-[var(--status-danger)] hover:bg-[var(--surface-hover)] inline-flex items-center gap-1.5 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Uninstall
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Engine compatibility or cascade confirmation banners */}
              {!selectedExtension.compatible && (
                <div className="mt-4 px-3.5 py-2.5 rounded-[4px] border border-[var(--status-danger)]/40 bg-[var(--status-danger)]/10 flex items-start gap-2.5 text-xs text-[var(--ink-primary)]">
                  <XCircle className="w-4 h-4 text-[var(--status-danger)] shrink-0 mt-0.5" />
                  <div>
                    <div className="font-semibold text-[var(--status-danger)]">Incompatible Engine Requirement</div>
                    <p className="mt-0.5 text-[var(--ink-secondary)]">
                      {selectedExtension.compatibilityNote} (Requires{' '}
                      <code className="font-mono">{selectedExtension.manifest.engines.devmind}</code>, running Core{' '}
                      <code className="font-mono">v{host.engineVersion}</code>).
                    </p>
                  </div>
                </div>
              )}

              {cascadeConfirmId === selectedExtension.manifest.id && selectedExtension.dependents.length > 0 && (
                <div className="mt-4 px-3.5 py-2.5 rounded-[4px] border border-[var(--status-warning)]/50 bg-[var(--status-warning)]/10 flex items-center justify-between gap-3 text-xs">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-[var(--status-warning)] shrink-0 mt-0.5" />
                    <div>
                      <div className="font-semibold text-[var(--ink-primary)]">Dependent extensions require this package</div>
                      <p className="text-[var(--ink-secondary)] mt-0.5">
                        Uninstalling will also remove:{' '}
                        <span className="font-mono">{selectedExtension.dependents.join(', ')}</span>
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setCascadeConfirmId(null)}
                      className="h-7 px-2.5 rounded-[3px] border border-[var(--border-strong)] text-[var(--ink-secondary)] hover:bg-[var(--surface-hover)]"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        runAction(
                          `uninstall:${selectedExtension.manifest.id}`,
                          () => onUninstall(selectedExtension.manifest.id, true),
                          `Removed ${selectedExtension.manifest.displayName} and dependent extensions.`
                        )
                      }
                      className="h-7 px-2.5 rounded-[3px] bg-[var(--status-danger)] text-white font-medium hover:opacity-90"
                    >
                      Uninstall All
                    </button>
                  </div>
                </div>
              )}

              {actionMessage && (
                <div
                  className={`mt-3 px-3 py-2 rounded-[4px] text-xs flex items-center justify-between border ${
                    actionMessage.tone === 'error'
                      ? 'border-[var(--status-danger)]/40 bg-[var(--status-danger)]/10 text-[var(--status-danger)]'
                      : 'border-[var(--border-strong)] bg-[var(--surface-subtle)] text-[var(--ink-primary)]'
                  }`}
                >
                  <span>{actionMessage.text}</span>
                  <button
                    type="button"
                    onClick={() => setActionMessage(null)}
                    className="text-[11px] underline opacity-75 hover:opacity-100"
                  >
                    Dismiss
                  </button>
                </div>
              )}

              {/* Detail Tabs */}
              <div className="mt-5 -mb-5 flex items-center gap-5">
                {(
                  [
                    { id: 'overview', label: 'Overview & Commands' },
                    { id: 'permissions', label: `Permissions (${selectedExtension.manifest.permissions.length})` },
                    {
                      id: 'dependencies',
                      label: `Dependencies (${selectedExtension.manifest.extensionDependencies.length})`,
                    },
                    { id: 'runtime', label: `Runtime Events (${extensionLogs.length})` },
                  ] as Array<{ id: DetailTab; label: string }>
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setDetailTab(tab.id)}
                    className={`pb-2.5 text-xs font-medium border-b-2 transition-colors ${
                      detailTab === tab.id
                        ? 'border-[var(--accent-primary)] text-[var(--ink-primary)]'
                        : 'border-transparent text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Detail Body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
              {detailTab === 'overview' && (
                <>
                  {/* Lifecycle & Engine Metadata Strip */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <div className="p-3 rounded-[4px] border border-[var(--border-hairline)] bg-[var(--surface-elevated)]">
                      <div className="text-[11px] text-[var(--ink-muted)]">Engine Target</div>
                      <div className="mt-1 text-xs font-mono text-[var(--ink-primary)]">
                        {selectedExtension.manifest.engines.devmind}
                      </div>
                    </div>
                    <div className="p-3 rounded-[4px] border border-[var(--border-hairline)] bg-[var(--surface-elevated)]">
                      <div className="text-[11px] text-[var(--ink-muted)]">Activation Time</div>
                      <div className="mt-1 text-xs font-mono tabular-nums text-[var(--ink-primary)]">
                        {selectedExtension.activationDurationMs !== undefined
                          ? `${selectedExtension.activationDurationMs} ms`
                          : 'Inactive'}
                      </div>
                    </div>
                    <div className="p-3 rounded-[4px] border border-[var(--border-hairline)] bg-[var(--surface-elevated)]">
                      <div className="text-[11px] text-[var(--ink-muted)]">Live Diagnostics</div>
                      <div className="mt-1 text-xs font-mono tabular-nums text-[var(--ink-primary)]">
                        {extensionDiagnostics.length} findings
                      </div>
                    </div>
                    <div className="p-3 rounded-[4px] border border-[var(--border-hairline)] bg-[var(--surface-elevated)]">
                      <div className="text-[11px] text-[var(--ink-muted)]">Repository</div>
                      <div className="mt-1 text-xs font-mono text-[var(--ink-secondary)] truncate inline-flex items-center gap-1">
                        <ExternalLink className="w-3 h-3 shrink-0" />
                        {selectedExtension.manifest.repositoryUrl.replace('https://', '')}
                      </div>
                    </div>
                  </div>

                  {/* Detailed Description */}
                  <section className="space-y-2">
                    <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--ink-muted)]">
                      About This Extension
                    </h2>
                    <p className="text-sm text-[var(--ink-primary)] leading-relaxed max-w-3xl">
                      {selectedExtension.manifest.longDescription}
                    </p>
                  </section>

                  {/* Contributed Commands — Executable Directly */}
                  <section className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--ink-muted)]">
                        Contributed Commands ({selectedExtension.manifest.contributes.commands.length})
                      </h2>
                      {activeFilePath && (
                        <span className="text-[11px] font-mono text-[var(--ink-muted)]">
                          Active File: {activeFilePath}
                        </span>
                      )}
                    </div>

                    {selectedExtension.manifest.contributes.commands.length === 0 ? (
                      <div className="p-4 rounded-[4px] border border-[var(--border-hairline)] bg-[var(--surface-elevated)] text-xs text-[var(--ink-secondary)]">
                        This extension operates as a background runtime service and does not register manual commands.
                      </div>
                    ) : (
                      <div className="border border-[var(--border-hairline)] rounded-[4px] divide-y divide-[var(--border-hairline)] bg-[var(--surface-elevated)]">
                        {selectedExtension.manifest.contributes.commands.map((cmd) => {
                          const canRun =
                            selectedExtension.installed &&
                            selectedExtension.enabled &&
                            (!cmd.requiresActiveFile || Boolean(activeFilePath));
                          const isRunning = busyAction === `cmd:${cmd.id}`;

                          return (
                            <div
                              key={cmd.id}
                              className="px-4 py-3 flex items-center justify-between gap-4"
                            >
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-semibold text-[var(--ink-primary)]">
                                    {cmd.category}: {cmd.title}
                                  </span>
                                  <code className="text-[11px] font-mono text-[var(--ink-muted)]">
                                    {cmd.id}
                                  </code>
                                  {cmd.mutatesFile && (
                                    <span className="text-[10px] font-medium text-[var(--status-warning)]">
                                      Writes File
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-[var(--ink-secondary)] mt-0.5">
                                  {cmd.description}
                                </p>
                              </div>

                              <button
                                type="button"
                                disabled={!canRun || busyAction !== null}
                                onClick={() =>
                                  runAction(
                                    `cmd:${cmd.id}`,
                                    () => onExecuteCommand(cmd.id, activeFilePath || undefined),
                                    `Executed "${cmd.title}".`
                                  )
                                }
                                title={
                                  !selectedExtension.installed || !selectedExtension.enabled
                                    ? 'Install and enable extension to run commands'
                                    : cmd.requiresActiveFile && !activeFilePath
                                    ? 'Open a file in the Code Editor first'
                                    : `Run ${cmd.title}`
                                }
                                className="h-7 px-3 text-xs font-medium rounded-[3px] border border-[var(--border-strong)] bg-[var(--surface-canvas)] text-[var(--ink-primary)] hover:bg-[var(--surface-hover)] disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1.5 shrink-0 transition-colors"
                              >
                                <Play className="w-3 h-3 text-[var(--accent-primary)]" />
                                {isRunning ? 'Running...' : 'Run Command'}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </section>

                  {/* Activation Events */}
                  <section className="space-y-2">
                    <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--ink-muted)]">
                      Activation Events
                    </h2>
                    <div className="flex flex-wrap gap-2">
                      {selectedExtension.manifest.activationEvents.map((ev) => (
                        <code
                          key={ev}
                          className="px-2.5 py-1 text-xs font-mono rounded-[3px] border border-[var(--border-hairline)] bg-[var(--surface-elevated)] text-[var(--ink-primary)]"
                        >
                          {ev}
                        </code>
                      ))}
                    </div>
                  </section>
                </>
              )}

              {detailTab === 'permissions' && (
                <section className="space-y-3">
                  <div className="flex items-center gap-2 text-xs text-[var(--ink-secondary)]">
                    <ShieldCheck className="w-4 h-4 text-[var(--accent-primary)]" />
                    <span>
                      The Extension Host enforces declared capability scopes before granting file read/write, event bus, or diagnostic APIs.
                    </span>
                  </div>
                  <div className="border border-[var(--border-hairline)] rounded-[4px] divide-y divide-[var(--border-hairline)] bg-[var(--surface-elevated)]">
                    {selectedExtension.manifest.permissions.map((perm) => {
                      const info = PERMISSION_META[perm];
                      return (
                        <div key={perm} className="px-4 py-3 flex items-start justify-between gap-4">
                          <div className="flex items-start gap-2.5">
                            <KeyRound className="w-4 h-4 text-[var(--ink-muted)] mt-0.5 shrink-0" />
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-semibold text-[var(--ink-primary)]">
                                  {info.label}
                                </span>
                                <code className="text-[11px] font-mono text-[var(--ink-muted)]">
                                  {perm}
                                </code>
                              </div>
                              <p className="text-xs text-[var(--ink-secondary)] mt-0.5">{info.description}</p>
                            </div>
                          </div>
                          <span
                            className={`text-[11px] font-mono uppercase shrink-0 ${
                              info.risk === 'high'
                                ? 'text-[var(--status-warning)]'
                                : info.risk === 'medium'
                                ? 'text-[var(--accent-primary)]'
                                : 'text-[var(--status-success)]'
                            }`}
                          >
                            {info.risk} scope
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {detailTab === 'dependencies' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  <section className="space-y-2.5">
                    <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--ink-muted)]">
                      Required Dependencies
                    </h2>
                    {selectedExtension.manifest.extensionDependencies.length === 0 ? (
                      <div className="p-4 rounded-[4px] border border-[var(--border-hairline)] bg-[var(--surface-elevated)] text-xs text-[var(--ink-secondary)]">
                        Standalone extension with zero external extension dependencies.
                      </div>
                    ) : (
                      <div className="border border-[var(--border-hairline)] rounded-[4px] divide-y divide-[var(--border-hairline)] bg-[var(--surface-elevated)]">
                        {selectedExtension.manifest.extensionDependencies.map((depId) => {
                          const dep = extensions.find((e) => e.manifest.id === depId);
                          return (
                            <button
                              key={depId}
                              type="button"
                              onClick={() => setSelectedId(depId)}
                              className="w-full text-left px-4 py-3 hover:bg-[var(--surface-hover)] flex items-center justify-between gap-2 transition-colors"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <GitBranch className="w-3.5 h-3.5 text-[var(--accent-primary)] shrink-0" />
                                <div className="min-w-0">
                                  <div className="text-xs font-semibold text-[var(--ink-primary)] truncate">
                                    {dep?.manifest.displayName || depId}
                                  </div>
                                  <div className="text-[11px] font-mono text-[var(--ink-muted)]">{depId}</div>
                                </div>
                              </div>
                              <span
                                className={`text-[11px] font-medium shrink-0 ${
                                  dep ? getStateLabel(dep).toneClass : 'text-[var(--status-danger)]'
                                }`}
                              >
                                {dep ? getStateLabel(dep).text : 'Missing'}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </section>

                  <section className="space-y-2.5">
                    <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--ink-muted)]">
                      Installed Dependents
                    </h2>
                    {selectedExtension.dependents.length === 0 ? (
                      <div className="p-4 rounded-[4px] border border-[var(--border-hairline)] bg-[var(--surface-elevated)] text-xs text-[var(--ink-secondary)]">
                        No currently installed extensions depend on this package.
                      </div>
                    ) : (
                      <div className="border border-[var(--border-hairline)] rounded-[4px] divide-y divide-[var(--border-hairline)] bg-[var(--surface-elevated)]">
                        {selectedExtension.dependents.map((depId) => {
                          const dep = extensions.find((e) => e.manifest.id === depId);
                          return (
                            <button
                              key={depId}
                              type="button"
                              onClick={() => setSelectedId(depId)}
                              className="w-full text-left px-4 py-3 hover:bg-[var(--surface-hover)] flex items-center justify-between gap-2 transition-colors"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <ShieldAlert className="w-3.5 h-3.5 text-[var(--status-warning)] shrink-0" />
                                <div className="min-w-0">
                                  <div className="text-xs font-semibold text-[var(--ink-primary)] truncate">
                                    {dep?.manifest.displayName || depId}
                                  </div>
                                  <div className="text-[11px] font-mono text-[var(--ink-muted)]">{depId}</div>
                                </div>
                              </div>
                              <span className="text-[11px] text-[var(--ink-muted)] shrink-0">Requires this</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </section>
                </div>
              )}

              {detailTab === 'runtime' && (
                <section className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--ink-muted)] flex items-center gap-1.5">
                      <Terminal className="w-3.5 h-3.5" />
                      Extension Host Communication Stream
                    </h2>
                    <span className="text-[11px] font-mono text-[var(--ink-muted)]">
                      Core Bridge · IPC Active
                    </span>
                  </div>
                  <div className="border border-[var(--border-hairline)] rounded-[4px] bg-[var(--surface-elevated)] divide-y divide-[var(--border-hairline)] font-mono text-xs">
                    {extensionLogs.length === 0 ? (
                      <div className="p-4 text-[var(--ink-muted)]">No runtime events recorded yet.</div>
                    ) : (
                      extensionLogs.map((log) => (
                        <div key={log.id} className="px-3.5 py-2 flex items-start gap-3">
                          <span className="text-[11px] text-[var(--ink-muted)] tabular-nums shrink-0">
                            {new Date(log.timestamp).toLocaleTimeString()}
                          </span>
                          <span
                            className={`text-[11px] uppercase shrink-0 w-10 ${
                              log.level === 'error'
                                ? 'text-[var(--status-danger)]'
                                : log.level === 'warn'
                                ? 'text-[var(--status-warning)]'
                                : 'text-[var(--accent-primary)]'
                            }`}
                          >
                            {log.level}
                          </span>
                          <span className="text-[11px] text-[var(--ink-secondary)] shrink-0">
                            [{log.event}]
                          </span>
                          <span className="text-[var(--ink-primary)] break-words">{log.message}</span>
                        </div>
                      ))
                    )}
                  </div>
                </section>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-xs text-[var(--ink-muted)]">
            Select an extension to inspect its manifest, permissions, and contributed commands.
          </div>
        )}
      </div>
    </div>
  );
};
