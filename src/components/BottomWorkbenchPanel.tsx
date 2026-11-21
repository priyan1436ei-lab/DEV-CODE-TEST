import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Info,
  ScrollText,
  ShieldAlert,
  Terminal,
} from 'lucide-react';
import type {
  AuditLogEntry,
  ExtensionDiagnostic,
  ExtensionRuntimeLog,
  SecurityFinding,
} from '../types/devmind';

interface BottomWorkbenchPanelProps {
  diagnostics: ExtensionDiagnostic[];
  securityFindings: SecurityFinding[];
  runtimeLogs: ExtensionRuntimeLog[];
  auditLogs: AuditLogEntry[];
  activeTab: 'problems' | 'extensions' | 'audit';
  onTabChange: (tab: 'problems' | 'extensions' | 'audit') => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onOpenFileLine: (filePath: string, line: number) => void;
}

export const BottomWorkbenchPanel: React.FC<BottomWorkbenchPanelProps> = ({
  diagnostics,
  securityFindings,
  runtimeLogs,
  auditLogs,
  activeTab,
  onTabChange,
  collapsed,
  onToggleCollapse,
  onOpenFileLine,
}) => {
  const [severityFilter, setSeverityFilter] = useState<'all' | 'error' | 'warning' | 'info'>('all');

  const openSecurity = useMemo(
    () => securityFindings.filter((f) => f.status === 'open'),
    [securityFindings]
  );

  const combinedProblems = useMemo(() => {
    const items: Array<{
      id: string;
      severity: 'error' | 'warning' | 'info';
      source: string;
      code: string;
      message: string;
      filePath: string;
      line: number;
    }> = [
      ...openSecurity.map((f) => ({
        id: `sec:${f.id}`,
        severity: (f.severity === 'critical' || f.severity === 'high' ? 'error' : 'warning') as
          | 'error'
          | 'warning',
        source: `Security (${f.cwe})`,
        code: f.ruleId,
        message: f.title,
        filePath: f.filePath,
        line: f.line,
      })),
      ...diagnostics.map((d) => ({
        id: `ext:${d.id}`,
        severity: d.severity,
        source: d.source,
        code: d.code,
        message: d.message,
        filePath: d.filePath,
        line: d.line,
      })),
    ];

    if (severityFilter === 'all') return items;
    return items.filter((item) => item.severity === severityFilter);
  }, [openSecurity, diagnostics, severityFilter]);

  const errorCount = useMemo(
    () =>
      openSecurity.filter((f) => f.severity === 'critical' || f.severity === 'high').length +
      diagnostics.filter((d) => d.severity === 'error').length,
    [openSecurity, diagnostics]
  );

  const warningCount = useMemo(
    () =>
      openSecurity.filter((f) => f.severity !== 'critical' && f.severity !== 'high').length +
      diagnostics.filter((d) => d.severity === 'warning').length,
    [openSecurity, diagnostics]
  );

  const totalProblems = openSecurity.length + diagnostics.length;

  return (
    <div className="border-t border-[var(--border-hairline)] bg-[var(--surface-elevated)] flex flex-col shrink-0">
      {/* Workbench Panel Header Bar */}
      <div className="h-8 px-3 flex items-center justify-between border-b border-[var(--border-hairline)] bg-[var(--surface-chrome)] select-none">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => {
              onTabChange('problems');
              if (collapsed) onToggleCollapse();
            }}
            className={`h-8 text-[11px] font-medium uppercase tracking-wide border-b-2 inline-flex items-center gap-1.5 transition-colors ${
              activeTab === 'problems' && !collapsed
                ? 'border-[var(--accent-primary)] text-[var(--ink-primary)]'
                : 'border-transparent text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]'
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            Problems
            <span className="font-mono tabular-nums text-[10px] text-[var(--ink-muted)]">
              {totalProblems}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              onTabChange('extensions');
              if (collapsed) onToggleCollapse();
            }}
            className={`h-8 text-[11px] font-medium uppercase tracking-wide border-b-2 inline-flex items-center gap-1.5 transition-colors ${
              activeTab === 'extensions' && !collapsed
                ? 'border-[var(--accent-primary)] text-[var(--ink-primary)]'
                : 'border-transparent text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            Extension Host
            <span className="font-mono tabular-nums text-[10px] text-[var(--ink-muted)]">
              {runtimeLogs.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              onTabChange('audit');
              if (collapsed) onToggleCollapse();
            }}
            className={`h-8 text-[11px] font-medium uppercase tracking-wide border-b-2 inline-flex items-center gap-1.5 transition-colors ${
              activeTab === 'audit' && !collapsed
                ? 'border-[var(--accent-primary)] text-[var(--ink-primary)]'
                : 'border-transparent text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]'
            }`}
          >
            <ScrollText className="w-3.5 h-3.5" />
            Audit Log
            <span className="font-mono tabular-nums text-[10px] text-[var(--ink-muted)]">
              {auditLogs.length}
            </span>
          </button>
        </div>

        <div className="flex items-center gap-3">
          {!collapsed && activeTab === 'problems' && (
            <div className="flex items-center gap-2 text-[11px]">
              <span className="font-mono tabular-nums text-[var(--status-danger)]">
                {errorCount} errors
              </span>
              <span className="text-[var(--ink-muted)]">·</span>
              <span className="font-mono tabular-nums text-[var(--status-warning)]">
                {warningCount} warnings
              </span>
              <select
                value={severityFilter}
                onChange={(e) => setSeverityFilter(e.target.value as 'all' | 'error' | 'warning' | 'info')}
                className="h-5 px-1.5 text-[11px] rounded-[3px] bg-[var(--surface-canvas)] border border-[var(--border-hairline)] text-[var(--ink-primary)] focus:outline-none"
              >
                <option value="all">All</option>
                <option value="error">Errors</option>
                <option value="warning">Warnings</option>
                <option value="info">Info</option>
              </select>
            </div>
          )}

          <button
            type="button"
            onClick={onToggleCollapse}
            title={collapsed ? 'Expand panel' : 'Collapse panel'}
            className="p-1 rounded text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:bg-[var(--surface-hover)]"
          >
            {collapsed ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Body */}
      {!collapsed && (
        <div className="h-[196px] overflow-y-auto bg-[var(--surface-canvas)]">
          {activeTab === 'problems' && (
            combinedProblems.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-[var(--ink-muted)]">
                No problems detected in the active workspace.
              </div>
            ) : (
              <div className="divide-y divide-[var(--border-hairline)]">
                {combinedProblems.map((problem) => (
                  <button
                    key={problem.id}
                    type="button"
                    onClick={() => onOpenFileLine(problem.filePath, problem.line)}
                    className="w-full px-3.5 py-1.5 text-left hover:bg-[var(--surface-hover)] flex items-center justify-between gap-4 text-xs transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {problem.severity === 'error' ? (
                        <AlertCircle className="w-3.5 h-3.5 text-[var(--status-danger)] shrink-0" />
                      ) : problem.severity === 'warning' ? (
                        <AlertTriangle className="w-3.5 h-3.5 text-[var(--status-warning)] shrink-0" />
                      ) : (
                        <Info className="w-3.5 h-3.5 text-[var(--status-info)] shrink-0" />
                      )}
                      <span className="text-[var(--ink-primary)] truncate">{problem.message}</span>
                      <span className="text-[11px] text-[var(--ink-muted)] shrink-0">
                        {problem.source} · {problem.code}
                      </span>
                    </div>
                    <span className="text-[11px] font-mono tabular-nums text-[var(--ink-secondary)] shrink-0">
                      {problem.filePath}:{problem.line}
                    </span>
                  </button>
                ))}
              </div>
            )
          )}

          {activeTab === 'extensions' && (
            runtimeLogs.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-[var(--ink-muted)]">
                No Extension Host runtime activity logged yet.
              </div>
            ) : (
              <div className="divide-y divide-[var(--border-hairline)] font-mono text-xs">
                {runtimeLogs.map((log) => (
                  <div key={log.id} className="px-3.5 py-1.5 flex items-center gap-3">
                    <span className="text-[11px] text-[var(--ink-muted)] tabular-nums shrink-0">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </span>
                    <span
                      className={`text-[10px] uppercase w-10 shrink-0 ${
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
                      {log.extensionId}
                    </span>
                    <span className="text-[11px] text-[var(--ink-muted)] shrink-0">[{log.event}]</span>
                    <span className="text-[var(--ink-primary)] truncate">{log.message}</span>
                  </div>
                ))}
              </div>
            )
          )}

          {activeTab === 'audit' && (
            auditLogs.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-[var(--ink-muted)]">
                No audit entries recorded yet.
              </div>
            ) : (
              <div className="divide-y divide-[var(--border-hairline)] font-mono text-xs">
                {auditLogs.slice(0, 80).map((entry) => (
                  <div key={entry.id} className="px-3.5 py-1.5 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-[11px] text-[var(--ink-muted)] tabular-nums shrink-0">
                        {new Date(entry.timestamp).toLocaleTimeString()}
                      </span>
                      <span className="text-[11px] text-[var(--accent-primary)] shrink-0">
                        {entry.eventType}
                      </span>
                      <span className="text-[var(--ink-primary)] truncate font-sans">
                        {entry.summary}
                      </span>
                    </div>
                    <span className="text-[11px] text-[var(--ink-muted)] shrink-0">
                      {entry.actor}
                    </span>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
};
