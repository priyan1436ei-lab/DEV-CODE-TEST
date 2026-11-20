import React from 'react';
import { FileDiff, RotateCcw } from 'lucide-react';
import type { AgentTask, CodeChange } from '../types/devmind';

interface ExecutionHistoryViewProps {
  tasks: AgentTask[];
  onSelectTask: (task: AgentTask) => void;
  onInspectDiff: (change: CodeChange) => void;
  onRollbackTask: (taskId: string) => Promise<void>;
}

const STATUS_COLORS: Record<AgentTask['status'], string> = {
  pending: '#8A93AD',
  planning: '#4DB8FF',
  awaiting_approval: '#F5B84B',
  running: '#6C7BFF',
  testing: '#B38CFF',
  completed: '#3DD68C',
  failed: '#FF5C6C',
  cancelled: '#6B728A',
};

export const ExecutionHistoryView: React.FC<ExecutionHistoryViewProps> = ({
  tasks,
  onSelectTask,
  onInspectDiff,
  onRollbackTask,
}) => {
  return (
    <div className="h-full overflow-auto bg-[#0D0F14] p-6 space-y-6">
      <div className="border-b border-[#262B3A] pb-4">
        <h1 className="text-[20px] font-semibold text-[#E6E9F2] tracking-tight">
          Agent Execution History
        </h1>
        <p className="text-[13px] text-[#A3AABF] mt-1">
          Complete trace of autonomous engineering runs, approval records, sandbox verifications, and rollback snapshots.
        </p>
      </div>

      {tasks.length === 0 ? (
        <div className="bg-[#151821] border border-[#262B3A] rounded-[10px] p-10 text-center text-[#6B728A] text-[13px]">
          No agent executions recorded yet. Submit a task in the right-hand Autonomous Agent panel to begin.
        </div>
      ) : (
        <div className="space-y-4">
          {tasks.map((task) => {
            const lastTest = task.testRuns[task.testRuns.length - 1];
            return (
              <section
                key={task.id}
                className="bg-[#151821] border border-[#262B3A] rounded-[10px] p-5 space-y-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 font-mono text-[12px] tabular-nums">
                      <span
                        className="font-semibold uppercase"
                        style={{ color: STATUS_COLORS[task.status] }}
                      >
                        {task.status.replace('_', ' ')}
                      </span>
                      <span className="text-[#6B728A]" aria-hidden="true">·</span>
                      <span className="text-[#6B728A]">{task.id}</span>
                      <span className="text-[#6B728A]" aria-hidden="true">·</span>
                      <span className="text-[#A3AABF]">
                        {new Date(task.createdAt).toLocaleTimeString()}
                      </span>
                    </div>
                    <h2 className="text-[15px] font-semibold text-[#E6E9F2]">{task.title}</h2>
                    <div className="font-mono text-[11px] text-[#6B728A] tabular-nums">
                      {task.modelName} · {(task.promptTokens + task.completionTokens).toLocaleString()} tokens · $
                      {task.actualCostUsd.toFixed(5)} · retries {task.retryCount}/{task.maxRetries}
                      {lastTest
                        ? ` · latest sandbox: ${lastTest.passedCount}/${lastTest.totalCount} passed`
                        : ''}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => onSelectTask(task)}
                      className="px-3 py-1.5 text-[12px] font-medium bg-[#1C2030] hover:bg-[#262B3A] text-[#E6E9F2] border border-[#353B50] rounded-[6px] transition-colors duration-120 whitespace-nowrap"
                    >
                      Focus in AI Panel
                    </button>
                    {task.rollbackSnapshot && !task.rollbackSnapshot.restored && (
                      <button
                        onClick={() => void onRollbackTask(task.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium text-[#F5B84B] bg-[#0F1117] hover:bg-[#1C2030] border border-[#F5B84B]/40 rounded-[6px] transition-colors duration-120 whitespace-nowrap"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Rollback</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Approval Records */}
                {task.approvals.length > 0 && (
                  <div className="text-[12px] text-[#A3AABF] border-t border-[#262B3A] pt-3 space-y-1">
                    <div className="font-medium text-[#E6E9F2]">Approval Checkpoints</div>
                    {task.approvals.map((a) => (
                      <div key={a.id} className="font-mono text-[11px] text-[#A3AABF]">
                        {a.id} · {a.actionType} · status={a.status.toUpperCase()}
                        {a.decidedAt ? ` · decided at ${new Date(a.decidedAt).toLocaleTimeString()}` : ''}
                      </div>
                    ))}
                  </div>
                )}

                {/* Code Changes */}
                {task.changes.length > 0 && (
                  <div className="flex flex-wrap gap-2 border-t border-[#262B3A] pt-3">
                    {task.changes.map((chg) => (
                      <button
                        key={chg.id}
                        onClick={() => onInspectDiff(chg)}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-[6px] bg-[#0F1117] hover:bg-[#1C2030] border border-[#262B3A] font-mono text-[12px] text-[#8793FF]"
                      >
                        <FileDiff className="w-3.5 h-3.5" />
                        <span>{chg.filePath}</span>
                        <span className="text-[#6B728A]">({chg.status})</span>
                      </button>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
};
