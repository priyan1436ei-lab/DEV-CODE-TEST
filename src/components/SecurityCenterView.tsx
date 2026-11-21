import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  FileCode2,
  Loader2,
  ShieldAlert,
  ShieldCheck,
  Wrench,
} from 'lucide-react';
import type { SecurityFinding, Severity, UsageLedger } from '../types/devmind';

interface SecurityCenterViewProps {
  findings: SecurityFinding[];
  usage: UsageLedger | null;
  onRemediateWithAgent: (finding: SecurityFinding) => Promise<void>;
  onOpenFileLine: (filePath: string, line: number) => void;
}

const SEVERITY_ORDER: Record<Severity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

const SEVERITY_COLOR: Record<Severity, string> = {
  critical: 'text-[var(--status-danger)]',
  high: 'text-[var(--status-danger)]',
  medium: 'text-[var(--status-warning)]',
  low: 'text-[var(--status-info)]',
  info: 'text-[var(--ink-muted)]',
};

export const SecurityCenterView: React.FC<SecurityCenterViewProps> = ({
  findings,
  usage,
  onRemediateWithAgent,
  onOpenFileLine,
}) => {
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'remediated'>('open');
  const [remediatingId, setRemediatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sortedFindings = useMemo(() => {
    return [...findings]
      .filter((f) => (statusFilter === 'all' ? true : f.status === statusFilter))
      .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
  }, [findings, statusFilter]);

  const openCount = findings.filter((f) => f.status === 'open').length;
  const remediatedCount = findings.filter((f) => f.status === 'remediated').length;
  const criticalHighCount = findings.filter(
    (f) => f.status === 'open' && (f.severity === 'critical' || f.severity === 'high')
  ).length;

  const handleRemediate = async (finding: SecurityFinding) => {
    setRemediatingId(finding.id);
    setError(null);
    try {
      await onRemediateWithAgent(finding);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to start remediation task.');
    } finally {
      setRemediatingId(null);
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-[var(--surface-canvas)] p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--border-hairline)] pb-4">
        <div>
          <h1 className="text-lg font-semibold text-[var(--ink-primary)] tracking-tight">
            Security Center
          </h1>
          <p className="text-xs text-[var(--ink-secondary)] mt-0.5">
            Static CWE vulnerability scanning, outbound secret redaction, and policy-gated code remediation.
          </p>
        </div>

        <div className="flex items-center gap-1 border border-[var(--border-hairline)] rounded-[4px] p-0.5 bg-[var(--surface-elevated)]">
          {(
            [
              { id: 'open', label: `Open (${openCount})` },
              { id: 'remediated', label: `Remediated (${remediatedCount})` },
              { id: 'all', label: `All (${findings.length})` },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setStatusFilter(tab.id)}
              className={`h-7 px-2.5 text-xs font-medium rounded-[3px] transition-colors ${
                statusFilter === tab.id
                  ? 'bg-[var(--accent-soft)] text-[var(--accent-primary)]'
                  : 'text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Metrics Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3.5">
        <div className="p-3.5 rounded-[4px] border border-[var(--border-hairline)] bg-[var(--surface-elevated)]">
          <div className="text-[11px] text-[var(--ink-muted)]">Critical & High</div>
          <div className="mt-1 text-xl font-semibold font-mono tabular-nums text-[var(--status-danger)]">
            {criticalHighCount}
          </div>
        </div>
        <div className="p-3.5 rounded-[4px] border border-[var(--border-hairline)] bg-[var(--surface-elevated)]">
          <div className="text-[11px] text-[var(--ink-muted)]">Open Findings</div>
          <div className="mt-1 text-xl font-semibold font-mono tabular-nums text-[var(--ink-primary)]">
            {openCount}
          </div>
        </div>
        <div className="p-3.5 rounded-[4px] border border-[var(--border-hairline)] bg-[var(--surface-elevated)]">
          <div className="text-[11px] text-[var(--ink-muted)]">Secrets Redacted</div>
          <div className="mt-1 text-xl font-semibold font-mono tabular-nums text-[var(--accent-primary)]">
            {usage?.secretsRedactedTotal ?? 0}
          </div>
        </div>
        <div className="p-3.5 rounded-[4px] border border-[var(--border-hairline)] bg-[var(--surface-elevated)]">
          <div className="text-[11px] text-[var(--ink-muted)]">Policy Blocks</div>
          <div className="mt-1 text-xl font-semibold font-mono tabular-nums text-[var(--status-success)]">
            {usage?.unauthorizedActionsBlocked ?? 0}
          </div>
        </div>
      </div>

      {error && (
        <div className="px-3.5 py-2.5 rounded-[4px] border border-[var(--status-danger)]/40 bg-[var(--status-danger)]/10 text-xs text-[var(--status-danger)]">
          {error}
        </div>
      )}

      {/* Findings List */}
      {sortedFindings.length === 0 ? (
        <div className="p-10 text-center border border-[var(--border-hairline)] rounded-[4px] bg-[var(--surface-elevated)]">
          <ShieldCheck className="w-8 h-8 text-[var(--status-success)] mx-auto mb-2" />
          <p className="text-sm font-medium text-[var(--ink-primary)]">No findings in this view</p>
          <p className="text-xs text-[var(--ink-muted)] mt-1">
            Static scanning updates automatically whenever files are saved or patched.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {sortedFindings.map((finding) => (
            <div
              key={finding.id}
              className="border border-[var(--border-hairline)] rounded-[4px] bg-[var(--surface-elevated)] overflow-hidden"
            >
              <div className="px-4 py-3 border-b border-[var(--border-hairline)] flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {finding.status === 'open' ? (
                      <ShieldAlert className={`w-4 h-4 shrink-0 ${SEVERITY_COLOR[finding.severity]}`} />
                    ) : (
                      <CheckCircle2 className="w-4 h-4 text-[var(--status-success)] shrink-0" />
                    )}
                    <span className={`text-[11px] font-mono font-semibold uppercase ${SEVERITY_COLOR[finding.severity]}`}>
                      {finding.severity}
                    </span>
                    <span className="text-xs font-semibold text-[var(--ink-primary)]">
                      {finding.title}
                    </span>
                    <span className="text-[11px] font-mono text-[var(--ink-muted)]">
                      {finding.cwe} · {finding.ruleId}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => onOpenFileLine(finding.filePath, finding.line)}
                    className="mt-1 inline-flex items-center gap-1 text-[11px] font-mono text-[var(--accent-primary)] hover:underline"
                  >
                    <FileCode2 className="w-3 h-3" />
                    {finding.filePath}:{finding.line}
                  </button>
                </div>

                {finding.status === 'open' && (
                  <button
                    type="button"
                    disabled={remediatingId !== null}
                    onClick={() => handleRemediate(finding)}
                    className="h-7 px-3 text-xs font-medium rounded-[3px] bg-[var(--accent-primary)] text-[var(--accent-ink)] hover:bg-[var(--accent-hover)] disabled:opacity-40 inline-flex items-center gap-1.5 shrink-0"
                  >
                    {remediatingId === finding.id ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Wrench className="w-3 h-3" />
                    )}
                    Generate Fix Patch
                  </button>
                )}
              </div>

              <div className="p-4 space-y-2.5 text-xs">
                <p className="text-[var(--ink-secondary)] leading-relaxed">{finding.description}</p>
                {finding.snippet && (
                  <pre className="p-2.5 rounded-[3px] bg-[var(--surface-canvas)] border border-[var(--border-hairline)] font-mono text-[11px] text-[var(--ink-primary)] overflow-x-auto">
                    {finding.snippet}
                  </pre>
                )}
                <div className="text-[11px] text-[var(--ink-secondary)]">
                  <span className="font-semibold text-[var(--ink-primary)]">Remediation: </span>
                  {finding.remediation}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
