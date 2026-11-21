import React, { useMemo, useState } from 'react';
import { FileDiff, Filter, RotateCcw } from 'lucide-react';
import type { AgentTask, CodeChange, TaskPriority } from '../types/devmind';

interface ExecutionHistoryViewProps {
  tasks: AgentTask[];
  onSelectTask: (task: AgentTask) => void;
  onInspectDiff: (change: CodeChange) => void;
  onRollbackTask: (taskId: string) => Promise<void>;
  onUpdateTaskPriority: (taskId: string, priority: TaskPriority) => Promise<void>;
}

const STATUS_COLORS: Record<AgentTask['status'], string> = {
  pending: '#8A93AD',
  planning: '#4DB8FF',
  awaiting_approval: '#F5B642',
  running: '#5B7CFF',
  testing: '#B38CFF',
  completed: '#2FD68B',
  failed: '#FF5468',
  cancelled: '#6B728A',
};

const PRIORITY_META: Record<TaskPriority, { label: string; color: string; border: string; bg: string }> = {
  high: {
    label: 'High',
    color: '#FF5468',
    border: 'rgba(255, 84, 104, 0.38)',
    bg: 'rgba(255, 84, 104, 0.1)',
  },
  medium: {
    label: 'Medium',
    color: '#F5B642',
    border: 'rgba(245, 182, 66, 0.38)',
    bg: 'rgba(245, 182, 66, 0.1)',
  },
  low: {
    label: 'Low',
    color: '#4DB8FF',
    border: 'rgba(77, 184, 255, 0.38)',
    bg: 'rgba(77, 184, 255, 0.1)',
  },
};

export const ExecutionHistoryView: React.FC<ExecutionHistoryViewProps> = ({
  tasks,
  onSelectTask,
  onInspectDiff,
  onRollbackTask,
  onUpdateTaskPriority,
}) => {
  const safeTasks = Array.isArray(tasks) ? tasks : [];
  const [priorityFilter, setPriorityFilter] = useState<'all' | TaskPriority>('all');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const priorityCounts = useMemo(() => {
    const counts = { high: 0, medium: 0, low: 0 };
    for (const t of safeTasks) {
      const p: TaskPriority =
        t.priority === 'high' || t.priority === 'medium' || t.priority === 'low'
          ? t.priority
          : 'medium';
      counts[p] += 1;
    }
    return counts;
  }, [safeTasks]);

  const filteredTasks = useMemo(() => {
    if (priorityFilter === 'all') return safeTasks;
    return safeTasks.filter((t) => (t.priority ?? 'medium') === priorityFilter);
  }, [safeTasks, priorityFilter]);

  const handlePriorityChange = async (taskId: string, next: TaskPriority) => {
    setUpdatingId(taskId);
    try {
      await onUpdateTaskPriority(taskId, next);
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="h-full overflow-auto bg-[#090B10] p-6 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#1E2433] pb-4">
        <div>
          <h1 className="text-[20px] font-semibold text-[#E6E9F2] tracking-tight">
            Agent Execution History
          </h1>
          <p className="text-[13px] text-[#A3AABF] mt-1 tabular-nums">
            Complete trace of autonomous engineering runs, priorities, approval records, and rollback snapshots ·{' '}
            Showing {filteredTasks.length} of {safeTasks.length} task(s)
          </p>
        </div>

        {/* Priority Filter Dropdown */}
        <div className="flex items-center gap-2 shrink-0">
          <Filter className="w-3.5 h-3.5 text-[#6B728A]" aria-hidden="true" />
          <label htmlFor="history-priority-filter" className="text-[12px] text-[#A3AABF] whitespace-nowrap">
            Priority:
          </label>
          <select
            id="history-priority-filter"
            aria-label="Filter agent tasks by priority"
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value as 'all' | TaskPriority)}
            className="bg-[#10131C] border border-[#262E42] hover:border-[#3A4560] focus:border-[#5B7CFF] text-[#E6E9F2] text-[12px] rounded-[6px] px-2.5 py-1.5 outline-none"
          >
            <option value="all">All Priorities ({safeTasks.length})</option>
            <option value="high">High Priority ({priorityCounts.high})</option>
            <option value="medium">Medium Priority ({priorityCounts.medium})</option>
            <option value="low">Low Priority ({priorityCounts.low})</option>
          </select>
        </div>
      </div>

      {safeTasks.length === 0 ? (
        <div className="bg-[#10131C] border border-[#1E2433] rounded-[10px] p-10 text-center text-[#6B728A] text-[13px]">
          No agent executions recorded yet. Submit a task in the right-hand Autonomous Agent panel to begin.
        </div>
      ) : filteredTasks.length === 0 ? (
        <div className="bg-[#10131C] border border-[#1E2433] rounded-[10px] p-10 text-center space-y-3">
          <p className="text-[13px] text-[#A3AABF]">
            No <span className="font-semibold text-[#E6E9F2] capitalize">{priorityFilter}</span> priority agent tasks found.
          </p>
          <button
            type="button"
            onClick={() => setPriorityFilter('all')}
            className="px-3 py-1.5 text-[12px] font-medium bg-[#161A26] hover:bg-[#1E2433] text-[#E6E9F2] border border-[#2B3347] rounded-[6px] transition-colors"
          >
            Show All Priorities
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredTasks.map((task) => {
            const lastTest = task.testRuns[task.testRuns.length - 1];
            const priority: TaskPriority =
              task.priority === 'high' || task.priority === 'medium' || task.priority === 'low'
                ? task.priority
                : 'medium';
            const pMeta = PRIORITY_META[priority];

            return (
              <section
                key={task.id}
                className="bg-[#10131C] border border-[#1E2433] rounded-[10px] p-5 space-y-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 font-mono text-[12px] tabular-nums">
                      {/* Task Priority Indicator */}
                      <span
                        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[4px] text-[11px] font-semibold uppercase tracking-wide border"
                        style={{
                          color: pMeta.color,
                          borderColor: pMeta.border,
                          backgroundColor: pMeta.bg,
                        }}
                      >
                        <span
                          className="w-1.5 h-1.5 rounded-full shrink-0"
                          style={{ backgroundColor: pMeta.color }}
                        />
                        {pMeta.label}
                      </span>

                      <span className="text-[#6B728A]" aria-hidden="true">·</span>

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

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <select
                      aria-label={`Set priority for ${task.title}`}
                      value={priority}
                      disabled={updatingId === task.id}
                      onChange={(e) => void handlePriorityChange(task.id, e.target.value as TaskPriority)}
                      className="bg-[#090B10] border border-[#262E42] hover:border-[#3A4560] text-[#E6E9F2] text-[12px] rounded-[6px] px-2 py-1.5 outline-none"
                    >
                      <option value="high">High Priority</option>
                      <option value="medium">Medium Priority</option>
                      <option value="low">Low Priority</option>
                    </select>

                    <button
                      type="button"
                      onClick={() => onSelectTask(task)}
                      className="px-3 py-1.5 text-[12px] font-medium bg-[#161A26] hover:bg-[#1E2433] text-[#E6E9F2] border border-[#2B3347] rounded-[6px] transition-colors whitespace-nowrap"
                    >
                      Focus in AI Panel
                    </button>
                    {task.rollbackSnapshot && !task.rollbackSnapshot.restored && (
                      <button
                        type="button"
                        onClick={() => void onRollbackTask(task.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium text-[#F5B642] bg-[#090B10] hover:bg-[#161A26] border border-[#F5B642]/40 rounded-[6px] transition-colors whitespace-nowrap"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Rollback</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Approval Records */}
                {task.approvals.length > 0 && (
                  <div className="text-[12px] text-[#A3AABF] border-t border-[#1E2433] pt-3 space-y-1">
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
                  <div className="flex flex-wrap gap-2 border-t border-[#1E2433] pt-3">
                    {task.changes.map((chg) => (
                      <button
                        key={chg.id}
                        type="button"
                        onClick={() => onInspectDiff(chg)}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-[6px] bg-[#090B10] hover:bg-[#161A26] border border-[#1E2433] font-mono text-[12px] text-[#7C96FF]"
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
