import React, { useState } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FileText,
  Play,
  Shield,
  Terminal,
  X,
  XCircle,
} from 'lucide-react';
import type { AuditLogEntry, TestRun } from '../types/devmind';

interface BottomSandboxPanelProps {
  testRuns: TestRun[];
  auditLogs: AuditLogEntry[];
  runningTests: boolean;
  onRunTests: () => Promise<void>;
  onClose: () => void;
}

function getCoverageColor(percent: number): string {
  if (percent >= 80) return '#3DD68C';
  if (percent >= 50) return '#F5B84B';
  return '#FF5C6C';
}

export const BottomSandboxPanel: React.FC<BottomSandboxPanelProps> = ({
  testRuns,
  auditLogs,
  runningTests,
  onRunTests,
  onClose,
}) => {
  const safeRuns = Array.isArray(testRuns) ? testRuns : [];
  const safeAudit = Array.isArray(auditLogs) ? auditLogs : [];
  const [activeTab, setActiveTab] = useState<'tests' | 'output' | 'audit'>('tests');
  const [showCoverageBreakdown, setShowCoverageBreakdown] = useState(false);
  const latestRun = safeRuns[0] ?? null;
  const coverage = latestRun?.coverage ?? null;

  return (
    <section
      aria-label="Sandbox Terminal and Verification Output"
      className="flex flex-col h-full bg-[#10131C] border-t border-[#1E2433]"
    >
      {/* Header Bar */}
      <div className="flex items-center justify-between px-3 h-9 border-b border-[#1E2433] shrink-0 gap-3">
        <div className="flex items-center gap-1 min-w-0">
          <button
            onClick={() => setActiveTab('tests')}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-[12px] font-medium rounded-[5px] transition-colors duration-120 whitespace-nowrap ${
              activeTab === 'tests'
                ? 'bg-[#1C2030] text-[#E6E9F2]'
                : 'text-[#A3AABF] hover:text-[#E6E9F2]'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-[#3DD68C]" />
            <span>
              Test Results
              {latestRun ? ` (${latestRun.passedCount}/${latestRun.totalCount})` : ''}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('output')}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-[12px] font-medium rounded-[5px] transition-colors duration-120 whitespace-nowrap ${
              activeTab === 'output'
                ? 'bg-[#1C2030] text-[#E6E9F2]'
                : 'text-[#A3AABF] hover:text-[#E6E9F2]'
            }`}
          >
            <Terminal className="w-3.5 h-3.5 text-[#4DB8FF]" />
            <span>Sandbox Output</span>
          </button>

          <button
            onClick={() => setActiveTab('audit')}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-[12px] font-medium rounded-[5px] transition-colors duration-120 whitespace-nowrap ${
              activeTab === 'audit'
                ? 'bg-[#1C2030] text-[#E6E9F2]'
                : 'text-[#A3AABF] hover:text-[#E6E9F2]'
            }`}
          >
            <Shield className="w-3.5 h-3.5 text-[#F5B84B]" />
            <span>Audit Log ({safeAudit.length})</span>
          </button>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {/* Compact Coverage Percentage Indicator in Header */}
          {coverage && (
            <button
              type="button"
              onClick={() => {
                setActiveTab('tests');
                setShowCoverageBreakdown((v) => !v);
              }}
              title={`Line coverage: ${coverage.linePercent.toFixed(1)}% · Branches: ${coverage.branchPercent.toFixed(1)}% · Functions: ${coverage.funcsPercent.toFixed(1)}%`}
              className="hidden md:flex items-center gap-2 text-[11px] font-mono tabular-nums hover:opacity-90 transition-opacity whitespace-nowrap"
            >
              <span className="text-[#A3AABF]">Coverage</span>
              <span className="w-16 h-1.5 rounded-full bg-[#0F1117] border border-[#262B3A] overflow-hidden inline-block">
                <span
                  className="block h-full transition-all duration-300"
                  style={{
                    width: `${Math.min(100, Math.max(2, coverage.linePercent))}%`,
                    backgroundColor: getCoverageColor(coverage.linePercent),
                  }}
                />
              </span>
              <span
                className="font-semibold"
                style={{ color: getCoverageColor(coverage.linePercent) }}
              >
                {coverage.linePercent.toFixed(1)}%
              </span>
            </button>
          )}

          {latestRun && (
            <span className="hidden lg:inline font-mono text-[11px] text-[#6B728A] tabular-nums whitespace-nowrap">
              {latestRun.sandboxId} · exit {latestRun.exitCode} · {latestRun.durationMs}ms
            </span>
          )}

          <button
            onClick={() => void onRunTests()}
            disabled={runningTests}
            className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium bg-[#1C2030] hover:bg-[#262B3A] text-[#E6E9F2] border border-[#353B50] rounded-[5px] transition-colors duration-120 whitespace-nowrap"
          >
            <Play className="w-3 h-3 text-[#3DD68C]" />
            <span>{runningTests ? 'Running...' : 'Run Tests'}</span>
          </button>
          <button
            onClick={onClose}
            aria-label="Hide bottom panel"
            className="p-1 text-[#6B728A] hover:text-[#E6E9F2] rounded-[5px]"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto bg-[#0F1117] p-3 font-mono text-[12px]">
        {activeTab === 'tests' && (
          <>
            {!latestRun ? (
              <div className="h-full flex flex-col items-center justify-center text-[#6B728A] font-sans text-[12px] gap-2">
                <FileText className="w-5 h-5 text-[#353B50]" />
                <span>No sandbox verification runs yet. Click Run Tests to execute the test suite.</span>
              </div>
            ) : (
              <div className="space-y-2">
                {/* Summary Bar: Command + Pass/Fail + Coverage Percentage Indicator */}
                <div className="flex flex-wrap items-center justify-between gap-3 text-[11px] text-[#A3AABF] pb-2 border-b border-[#262B3A]">
                  <span className="truncate">$ {latestRun.command}</span>

                  <div className="flex flex-wrap items-center gap-3 tabular-nums">
                    <span
                      className={`font-semibold ${
                        latestRun.status === 'passed' ? 'text-[#3DD68C]' : 'text-[#FF5C6C]'
                      }`}
                    >
                      {latestRun.status.toUpperCase()} · {latestRun.passedCount} passed, {latestRun.failedCount} failed
                    </span>

                    {coverage && (
                      <>
                        <span className="text-[#353B50]" aria-hidden="true">|</span>
                        <button
                          type="button"
                          onClick={() => setShowCoverageBreakdown((v) => !v)}
                          aria-expanded={showCoverageBreakdown}
                          className="flex items-center gap-2 text-left hover:text-[#E6E9F2] transition-colors whitespace-nowrap"
                        >
                          {showCoverageBreakdown ? (
                            <ChevronDown className="w-3.5 h-3.5 text-[#6B728A]" />
                          ) : (
                            <ChevronRight className="w-3.5 h-3.5 text-[#6B728A]" />
                          )}
                          <span className="text-[#A3AABF]">Coverage</span>
                          <span className="w-20 h-1.5 rounded-full bg-[#151821] border border-[#262B3A] overflow-hidden inline-block">
                            <span
                              className="block h-full transition-all duration-300"
                              style={{
                                width: `${Math.min(100, Math.max(2, coverage.linePercent))}%`,
                                backgroundColor: getCoverageColor(coverage.linePercent),
                              }}
                            />
                          </span>
                          <span
                            className="font-semibold"
                            style={{ color: getCoverageColor(coverage.linePercent) }}
                          >
                            {coverage.linePercent.toFixed(1)}% lines
                          </span>
                          <span className="text-[#6B728A] hidden sm:inline">
                            · {coverage.branchPercent.toFixed(1)}% branches · {coverage.funcsPercent.toFixed(1)}% funcs
                          </span>
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Expandable Per-File Coverage Table */}
                {coverage && showCoverageBreakdown && coverage.files.length > 0 && (
                  <div className="bg-[#151821] border border-[#262B3A] rounded-[6px] p-2.5 mb-2">
                    <table className="w-full text-left text-[11px] tabular-nums">
                      <thead>
                        <tr className="text-[#6B728A] border-b border-[#262B3A]">
                          <th className="py-1 pr-4 font-medium">Source File</th>
                          <th className="py-1 px-3 font-medium text-right">Lines</th>
                          <th className="py-1 px-3 font-medium text-right">Branches</th>
                          <th className="py-1 px-3 font-medium text-right">Funcs</th>
                          <th className="py-1 pl-3 font-medium">Uncovered Lines</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#262B3A]/60">
                        {coverage.files.map((fc) => (
                          <tr key={fc.file}>
                            <td className="py-1.5 pr-4 text-[#E6E9F2]">{fc.file}</td>
                            <td
                              className="py-1.5 px-3 text-right font-medium"
                              style={{ color: getCoverageColor(fc.linePercent) }}
                            >
                              {fc.linePercent.toFixed(1)}%
                            </td>
                            <td className="py-1.5 px-3 text-right text-[#A3AABF]">
                              {fc.branchPercent.toFixed(1)}%
                            </td>
                            <td className="py-1.5 px-3 text-right text-[#A3AABF]">
                              {fc.funcsPercent.toFixed(1)}%
                            </td>
                            <td className="py-1.5 pl-3 text-[#6B728A]">
                              {fc.uncoveredLines || '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Individual Test Case Results */}
                {latestRun.cases.map((tc, idx) => (
                  <div
                    key={idx}
                    className="py-1.5 px-2 rounded-[5px] hover:bg-[#151821] space-y-1"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        {tc.status === 'pass' ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-[#3DD68C] shrink-0" />
                        ) : (
                          <XCircle className="w-3.5 h-3.5 text-[#FF5C6C] shrink-0" />
                        )}
                        <span className="text-[#E6E9F2] truncate">{tc.name}</span>
                      </div>
                      <span className="text-[11px] text-[#6B728A] tabular-nums shrink-0">
                        {tc.durationMs}ms
                      </span>
                    </div>
                    {tc.errorMessage && (
                      <div className="pl-6 text-[11px] text-[#FF5C6C] break-all">
                        {tc.errorMessage}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {activeTab === 'output' && (
          <div className="space-y-2">
            {!latestRun ? (
              <div className="text-[#6B728A] font-sans">No raw sandbox stdout/stderr captured yet.</div>
            ) : (
              <>
                <div className="text-[#6B728A]">
                  # Disposable sandbox {latestRun.sandboxId} (host secrets stripped, V8 coverage enabled)
                </div>
                <pre className="whitespace-pre-wrap text-[#A3AABF] leading-relaxed">
                  {latestRun.stdout || '(empty stdout)'}
                </pre>
                {latestRun.stderr && (
                  <pre className="whitespace-pre-wrap text-[#FF5C6C] leading-relaxed pt-2 border-t border-[#262B3A]">
                    {latestRun.stderr}
                  </pre>
                )}
              </>
            )}
          </div>
        )}

        {activeTab === 'audit' && (
          <div className="divide-y divide-[#262B3A]/70">
            {safeAudit.map((entry) => (
              <div key={entry.id} className="py-1.5 flex items-baseline justify-between gap-4">
                <div className="min-w-0">
                  <span className="text-[#8793FF] mr-2">{entry.eventType}</span>
                  <span className="text-[#E6E9F2] font-sans">{entry.summary}</span>
                </div>
                <span className="text-[11px] text-[#6B728A] tabular-nums shrink-0">
                  {entry.actor} · {new Date(entry.timestamp).toLocaleTimeString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};
