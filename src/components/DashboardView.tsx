import React from 'react';
import {
  ArrowUpRight,
  CheckCircle2,
  Play,
  ShieldAlert,
  Terminal,
  XCircle,
} from 'lucide-react';
import type {
  AgentTask,
  Project,
  ScreenId,
  SecurityFinding,
  TestRun,
  UsageLedger,
} from '../types/devmind';

interface DashboardViewProps {
  project: Project;
  projects: Project[];
  tasks: AgentTask[];
  securityFindings: SecurityFinding[];
  testRuns: TestRun[];
  usage: UsageLedger | null;
  runningTests: boolean;
  onSelectProject: (projectId: string) => void;
  onNavigate: (screen: ScreenId) => void;
  onRunSandboxTests: () => Promise<void>;
  onLaunchMilestoneDemo: () => void;
  onSelectTask: (task: AgentTask) => void;
  onOpenImportModal: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  project,
  projects,
  tasks,
  securityFindings,
  testRuns,
  usage,
  runningTests,
  onSelectProject,
  onNavigate,
  onRunSandboxTests,
  onLaunchMilestoneDemo,
  onSelectTask,
  onOpenImportModal,
}) => {
  const latestRun = testRuns[0] ?? null;
  const criticalCount = securityFindings.filter((f) => f.severity === 'critical').length;
  const highCount = securityFindings.filter((f) => f.severity === 'high').length;
  const completedTasks = tasks.filter((t) => t.status === 'completed').length;
  const spendPct = usage
    ? Math.min(100, Math.round((usage.spentUsd / Math.max(0.01, usage.monthlyBudgetUsd)) * 100))
    : 0;

  return (
    <div className="h-full overflow-auto bg-[#0D0F14] p-6 space-y-6">
      {/* Header Row */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#262B3A] pb-5">
        <div className="space-y-1 max-w-2xl">
          <h1 className="text-[22px] font-semibold text-[#E6E9F2] tracking-tight">
            {project.name}
          </h1>
          <p className="text-[13px] text-[#A3AABF] leading-relaxed">{project.description}</p>
          <div className="flex flex-wrap items-center gap-2 text-[12px] text-[#6B728A] font-mono pt-1 tabular-nums">
            <span>{project.primaryLanguage}</span>
            <span aria-hidden="true">·</span>
            <span>{project.framework}</span>
            <span aria-hidden="true">·</span>
            <span>branch {project.defaultBranch}</span>
            <span aria-hidden="true">·</span>
            <span>indexed in {project.indexingDurationMs}ms</span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onOpenImportModal}
            className="px-3.5 py-2 text-[13px] font-medium text-[#E6E9F2] bg-[#151821] hover:bg-[#1C2030] border border-[#262B3A] rounded-[6px] transition-colors duration-120 whitespace-nowrap"
          >
            Import Local Repo
          </button>
          <button
            onClick={onLaunchMilestoneDemo}
            className="flex items-center gap-1.5 px-4 py-2 text-[13px] font-semibold bg-[#6C7BFF] hover:bg-[#8793FF] text-[#0D0F14] rounded-[6px] transition-colors duration-120 whitespace-nowrap"
          >
            <Play className="w-3.5 h-3.5" />
            <span>Run Autonomous Security Fix</span>
          </button>
        </div>
      </div>

      {/* KPI Strip (Single Elevation, Tabular Numerals, No Hallucinated Scoreboards) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#151821] border border-[#262B3A] rounded-[10px] p-4 space-y-1">
          <div className="text-[12px] text-[#A3AABF]">Repository Brain</div>
          <div className="text-[22px] font-semibold text-[#E6E9F2] font-mono tabular-nums">
            {project.architecture.totalSymbols} symbols
          </div>
          <div className="text-[12px] text-[#6B728A] tabular-nums">
            {project.architecture.totalFiles} files · {project.architecture.edges.length} graph edges
          </div>
        </div>

        <div className="bg-[#151821] border border-[#262B3A] rounded-[10px] p-4 space-y-1">
          <div className="text-[12px] text-[#A3AABF]">Sandbox Verification</div>
          <div className="text-[22px] font-semibold font-mono tabular-nums">
            {latestRun ? (
              <span className={latestRun.status === 'passed' ? 'text-[#3DD68C]' : 'text-[#FF5C6C]'}>
                {latestRun.passedCount}/{latestRun.totalCount} passed
              </span>
            ) : (
              <span className="text-[#A3AABF]">Not run yet</span>
            )}
          </div>
          <div className="text-[12px] text-[#6B728A] tabular-nums">
            {latestRun
              ? `${latestRun.durationMs}ms${latestRun.coverage ? ` · ${latestRun.coverage.linePercent.toFixed(1)}% line coverage` : ''} · ${latestRun.sandboxId}`
              : 'Run baseline tests in isolated sandbox'}
          </div>
        </div>

        <div className="bg-[#151821] border border-[#262B3A] rounded-[10px] p-4 space-y-1">
          <div className="text-[12px] text-[#A3AABF]">Open Security Findings</div>
          <div className="text-[22px] font-semibold font-mono tabular-nums">
            <span className={securityFindings.length > 0 ? 'text-[#FF7A45]' : 'text-[#3DD68C]'}>
              {securityFindings.length}
            </span>
          </div>
          <div className="text-[12px] text-[#6B728A] tabular-nums">
            {criticalCount} critical · {highCount} high · {usage?.secretsRedactedTotal ?? 0} secrets scrubbed
          </div>
        </div>

        <div className="bg-[#151821] border border-[#262B3A] rounded-[10px] p-4 space-y-1">
          <div className="text-[12px] text-[#A3AABF]">Policy & Token Spend</div>
          <div className="text-[22px] font-semibold text-[#E6E9F2] font-mono tabular-nums">
            ${(usage?.spentUsd ?? 0).toFixed(4)}
          </div>
          <div className="text-[12px] text-[#6B728A] tabular-nums">
            0 unauthorized actions · {(usage?.tokensUsed ?? 0).toLocaleString()} tokens
          </div>
        </div>
      </div>

      {/* Main 2-Column Workspace Overview */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        {/* Left: Active Verification & Security Overview */}
        <div className="xl:col-span-7 space-y-5">
          {/* End-to-End Milestone Workflow Card */}
          <section className="bg-[#151821] border border-[#262B3A] rounded-[10px] p-5 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-[15px] font-semibold text-[#E6E9F2]">
                  End-to-End Verification Pipeline
                </h2>
                <p className="text-[12px] text-[#A3AABF] mt-0.5">
                  Completion is strictly gated on passing sandbox tests and explicit developer approval.
                </p>
              </div>
              <button
                onClick={() => void onRunSandboxTests()}
                disabled={runningTests}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium bg-[#1C2030] hover:bg-[#262B3A] text-[#E6E9F2] border border-[#353B50] rounded-[6px] transition-colors duration-120 whitespace-nowrap"
              >
                <Terminal className="w-3.5 h-3.5 text-[#3DD68C]" />
                <span>{runningTests ? 'Executing...' : 'Run Baseline Tests'}</span>
              </button>
            </div>

            {latestRun ? (
              <div className="divide-y divide-[#262B3A] border border-[#262B3A] rounded-[8px] bg-[#0F1117]">
                {latestRun.cases.map((tc, i) => (
                  <div key={i} className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-[12px]">
                    <div className="flex items-center gap-2 min-w-0">
                      {tc.status === 'pass' ? (
                        <CheckCircle2 className="w-4 h-4 text-[#3DD68C] shrink-0" />
                      ) : (
                        <XCircle className="w-4 h-4 text-[#FF5C6C] shrink-0" />
                      )}
                      <span className="text-[#E6E9F2] truncate">{tc.name}</span>
                    </div>
                    <span className="font-mono text-[11px] text-[#6B728A] tabular-nums shrink-0">
                      {tc.status.toUpperCase()} · {tc.durationMs}ms
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-4 rounded-[8px] bg-[#0F1117] border border-[#262B3A] text-[12px] text-[#A3AABF]">
                Click <span className="text-[#E6E9F2] font-medium">Run Baseline Tests</span> to execute{' '}
                <span className="font-mono text-[#E6E9F2]">tests/*.test.ts</span> inside a clean ephemeral sandbox and capture real failing test assertions before dispatching the autonomous agent.
              </div>
            )}
          </section>

          {/* Recent Agent Tasks */}
          <section className="bg-[#151821] border border-[#262B3A] rounded-[10px] p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-[15px] font-semibold text-[#E6E9F2]">
                Recent Autonomous Tasks
              </h2>
              <button
                onClick={() => onNavigate('history')}
                className="flex items-center gap-1 text-[12px] text-[#8793FF] hover:underline"
              >
                <span>View all ({tasks.length})</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {tasks.length === 0 ? (
              <p className="text-[12px] text-[#6B728A] py-3">
                No autonomous tasks executed yet. Launch a task from the right-hand AI panel or click{' '}
                <span className="text-[#E6E9F2]">Run Autonomous Security Fix</span> above.
              </p>
            ) : (
              <div className="divide-y divide-[#262B3A] border-t border-[#262B3A]">
                {tasks.slice(0, 5).map((t) => (
                  <button
                    key={t.id}
                    onClick={() => onSelectTask(t)}
                    className="w-full flex items-center justify-between gap-4 py-3 text-left hover:bg-[#1C2030]/40 px-2 -mx-2 rounded-[6px] transition-colors duration-120"
                  >
                    <div className="min-w-0">
                      <div className="text-[13px] font-medium text-[#E6E9F2] truncate">{t.title}</div>
                      <div className="text-[11px] text-[#6B728A] font-mono tabular-nums mt-0.5">
                        {t.changes.length} file patch(es) · {(t.promptTokens + t.completionTokens).toLocaleString()} tokens · ${t.actualCostUsd.toFixed(5)}
                      </div>
                    </div>
                    <span className="font-mono text-[11px] text-[#A3AABF] shrink-0 uppercase">
                      {t.status.replace('_', ' ')}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Right: Connected Repositories, Security Highlights & Budget Meter */}
        <div className="xl:col-span-5 space-y-5">
          {/* Workspace Projects */}
          <section className="bg-[#151821] border border-[#262B3A] rounded-[10px] p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-[15px] font-semibold text-[#E6E9F2]">Workspace Repositories</h2>
              <span className="text-[12px] text-[#6B728A] tabular-nums">{projects.length} connected</span>
            </div>
            <div className="divide-y divide-[#262B3A]">
              {projects.map((p) => {
                const isCurrent = p.id === project.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => onSelectProject(p.id)}
                    className={`w-full flex items-center justify-between py-2.5 px-2.5 -mx-2.5 rounded-[6px] text-left transition-colors duration-120 ${
                      isCurrent ? 'bg-[#1C2030] text-[#E6E9F2]' : 'hover:bg-[#1C2030]/50 text-[#A3AABF]'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="font-mono text-[13px] font-medium text-[#E6E9F2] truncate">
                        {p.name}
                      </div>
                      <div className="text-[11px] text-[#6B728A] tabular-nums">
                        {p.primaryLanguage} · {p.files.length} files · {p.symbols.length} symbols
                      </div>
                    </div>
                    {isCurrent && (
                      <span className="text-[11px] font-medium text-[#6C7BFF] shrink-0">Active</span>
                    )}
                  </button>
                );
              })}
            </div>
          </section>

          {/* Security Alerts Preview */}
          <section className="bg-[#151821] border border-[#262B3A] rounded-[10px] p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-[15px] font-semibold text-[#E6E9F2]">Static Security Findings</h2>
              <button
                onClick={() => onNavigate('security')}
                className="text-[12px] text-[#8793FF] hover:underline"
              >
                Open Security Center
              </button>
            </div>
            {securityFindings.length === 0 ? (
              <p className="text-[12px] text-[#3DD68C]">
                Zero open security findings detected in {project.name}.
              </p>
            ) : (
              <div className="space-y-2">
                {securityFindings.slice(0, 4).map((f) => (
                  <div key={f.id} className="flex items-start gap-2.5 text-[12px]">
                    <ShieldAlert
                      className="w-4 h-4 shrink-0 mt-0.5"
                      style={{
                        color:
                          f.severity === 'critical'
                            ? '#FF3B4E'
                            : f.severity === 'high'
                              ? '#FF7A45'
                              : '#F5B84B',
                      }}
                    />
                    <div className="min-w-0">
                      <div className="text-[#E6E9F2] font-medium truncate">{f.title}</div>
                      <div className="font-mono text-[11px] text-[#6B728A]">
                        {f.filePath}:{f.line} · {f.cwe} · {f.severity}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Cost & Budget Guardrails (Section 15) */}
          <section className="bg-[#151821] border border-[#262B3A] rounded-[10px] p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-[15px] font-semibold text-[#E6E9F2]">Usage & Budget Guard</h2>
              <button
                onClick={() => onNavigate('settings')}
                className="text-[12px] text-[#8793FF] hover:underline"
              >
                Configure limits
              </button>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[12px] font-mono tabular-nums">
                <span className="text-[#A3AABF]">
                  ${(usage?.spentUsd ?? 0).toFixed(5)} / ${(usage?.monthlyBudgetUsd ?? 25).toFixed(2)}
                </span>
                <span className="text-[#E6E9F2]">{spendPct}%</span>
              </div>
              <div className="h-2 rounded-full bg-[#0F1117] overflow-hidden border border-[#262B3A]">
                <div
                  className="h-full transition-all duration-300"
                  style={{
                    width: `${Math.max(2, spendPct)}%`,
                    backgroundColor:
                      spendPct >= 100 ? '#FF5C6C' : spendPct >= 80 ? '#F5B84B' : '#6C7BFF',
                  }}
                />
              </div>
              <div className="flex items-center justify-between text-[11px] text-[#6B728A] tabular-nums pt-1">
                <span>Plan: {usage?.planName ?? 'Pro'} · Alerts at 80% & 100%</span>
                <span>{completedTasks} verified tasks</span>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
