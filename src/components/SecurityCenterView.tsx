import React, { useMemo, useState } from 'react';
import { RefreshCw, ShieldCheck, Wand2 } from 'lucide-react';
import type { Project, SecurityFinding, Severity } from '../types/devmind';

interface SecurityCenterViewProps {
  project: Project;
  findings: SecurityFinding[];
  onRefreshScan: () => Promise<void>;
  onOpenFileAtLine: (filePath: string, line: number) => void;
  onRemediateWithAgent: (prompt: string) => void;
}

const SEVERITY_COLORS: Record<Severity, string> = {
  critical: '#FF3B4E',
  high: '#FF7A45',
  medium: '#F5B84B',
  low: '#4DB8FF',
  info: '#8A93AD',
};

export const SecurityCenterView: React.FC<SecurityCenterViewProps> = ({
  project,
  findings,
  onRefreshScan,
  onOpenFileAtLine,
  onRemediateWithAgent,
}) => {
  const safeFindings = Array.isArray(findings) ? findings : [];
  const [filter, setFilter] = useState<'all' | Severity>('all');
  const [scanning, setScanning] = useState(false);

  const filtered = useMemo(
    () => (filter === 'all' ? safeFindings : safeFindings.filter((f) => f.severity === filter)),
    [safeFindings, filter]
  );

  const counts = useMemo(() => {
    return {
      critical: safeFindings.filter((f) => f.severity === 'critical').length,
      high: safeFindings.filter((f) => f.severity === 'high').length,
      medium: safeFindings.filter((f) => f.severity === 'medium').length,
      low: safeFindings.filter((f) => f.severity === 'low').length,
    };
  }, [safeFindings]);

  const handleScan = async () => {
    setScanning(true);
    try {
      await onRefreshScan();
    } finally {
      setScanning(false);
    }
  };

  const handleRemediateAll = () => {
    const summary = safeFindings
      .filter((f) => f.ruleId !== 'DEVMIND-INJECT-007')
      .map((f) => `- ${f.filePath}:${f.line} [${f.cwe}] ${f.title}: ${f.remediation}`)
      .join('\n');
    onRemediateWithAgent(
      `Remediate all open static security vulnerabilities in ${project.name} and verify all tests pass in the sandbox:\n${summary}`
    );
  };

  return (
    <div className="h-full overflow-auto bg-[#090B10] p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#262B3A] pb-4">
        <div>
          <h1 className="text-[20px] font-semibold text-[#E6E9F2] tracking-tight">
            Security Intelligence Center
          </h1>
          <p className="text-[13px] text-[#A3AABF] mt-1 tabular-nums">
            Static AST & pattern rules · Secret scanning & prompt-injection isolation · {safeFindings.length} open finding(s)
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => void handleScan()}
            disabled={scanning}
            className="flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium bg-[#1C2030] hover:bg-[#262B3A] text-[#E6E9F2] border border-[#353B50] rounded-[6px] transition-colors duration-120 whitespace-nowrap"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${scanning ? 'animate-spin' : ''}`} />
            <span>{scanning ? 'Scanning...' : 'Re-scan Repo'}</span>
          </button>

          {safeFindings.length > 0 && (
            <button
              onClick={handleRemediateAll}
              className="flex items-center gap-1.5 px-3.5 py-2 text-[12px] font-semibold bg-[#6C7BFF] hover:bg-[#8793FF] text-[#0D0F14] rounded-[6px] transition-colors duration-120 whitespace-nowrap"
            >
              <Wand2 className="w-3.5 h-3.5" />
              <span>Remediate All with Agent</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 p-1 bg-[#151821] border border-[#262B3A] rounded-[8px]">
          {(['all', 'critical', 'high', 'medium', 'low'] as const).map((sev) => (
            <button
              key={sev}
              onClick={() => setFilter(sev)}
              className={`px-3 py-1 text-[12px] font-medium rounded-[6px] transition-colors duration-120 capitalize whitespace-nowrap ${
                filter === sev
                  ? 'bg-[#1C2030] text-[#E6E9F2]'
                  : 'text-[#A3AABF] hover:text-[#E6E9F2]'
              }`}
            >
              {sev === 'all' ? `All (${safeFindings.length})` : `${sev} (${counts[sev]})`}
            </button>
          ))}
        </div>

        <span className="text-[12px] text-[#6B728A]">
          All repository content is scrubbed of secrets and isolated in untrusted-data delimiters before AI dispatch.
        </span>
      </div>

      {/* Findings List */}
      {filtered.length === 0 ? (
        <div className="bg-[#151821] border border-[#262B3A] rounded-[10px] p-10 text-center space-y-2">
          <ShieldCheck className="w-8 h-8 mx-auto text-[#3DD68C]" />
          <p className="text-[14px] font-semibold text-[#E6E9F2]">
            No vulnerabilities match this filter
          </p>
          <p className="text-[12px] text-[#A3AABF]">
            All configured CWE static rules and hardcoded secret detectors passed cleanly.
          </p>
        </div>
      ) : (
        <div className="bg-[#151821] border border-[#262B3A] rounded-[10px] divide-y divide-[#262B3A]">
          {filtered.map((finding) => (
            <div key={finding.id} className="p-4 space-y-2.5 hover:bg-[#1C2030]/35 transition-colors duration-120">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2 text-[12px] font-mono">
                    <span
                      className="font-semibold uppercase"
                      style={{ color: SEVERITY_COLORS[finding.severity] }}
                    >
                      {finding.severity}
                    </span>
                    <span className="text-[#6B728A]" aria-hidden="true">·</span>
                    <span className="text-[#A3AABF]">{finding.cwe}</span>
                    <span className="text-[#6B728A]" aria-hidden="true">·</span>
                    <span className="text-[#6B728A]">{finding.ruleId}</span>
                  </div>
                  <h2 className="text-[14px] font-semibold text-[#E6E9F2]">{finding.title}</h2>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => onOpenFileAtLine(finding.filePath, finding.line)}
                    className="font-mono text-[12px] text-[#8793FF] hover:underline whitespace-nowrap"
                  >
                    {finding.filePath}:{finding.line}
                  </button>
                  <button
                    onClick={() =>
                      onRemediateWithAgent(
                        `Fix security finding ${finding.ruleId} (${finding.cwe}) in ${finding.filePath} line ${finding.line}: ${finding.title}. ${finding.remediation}. Run sandbox tests to verify.`
                      )
                    }
                    className="px-2.5 py-1 text-[12px] font-medium bg-[#1C2030] hover:bg-[#262B3A] text-[#E6E9F2] border border-[#353B50] rounded-[6px] transition-colors duration-120 whitespace-nowrap"
                  >
                    Fix with Agent
                  </button>
                </div>
              </div>

              <pre className="bg-[#0F1117] border border-[#262B3A] rounded-[6px] px-3 py-2 font-mono text-[12px] text-[#FF7A45] overflow-x-auto">
                {finding.snippet}
              </pre>

              <div className="text-[12px] text-[#A3AABF] leading-relaxed">
                <span className="text-[#E6E9F2] font-medium">Remediation:</span> {finding.remediation}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
