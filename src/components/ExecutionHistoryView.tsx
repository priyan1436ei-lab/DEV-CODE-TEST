import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  FileDiff,
  History,
  RotateCcw,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import type { AgentTask, CodeChange, TaskPriority } from '../types/devmind';

interface ExecutionHistoryViewProps {
  tasks: AgentTask[];
  onOpenDiff: (change: CodeChange) => void;
  onRollbackTask: (taskId: string) => Promise<void>;
  onUpdateTaskPriority: (taskId: string, priority: TaskPriority) => Promise<void>;
}

const PRIORITY_STYLE: Record<TaskPriority, { label: string; dot: string; text: string }> = {
  high: { label: 'High', dot: 'bg-[var(--status-danger)]', text: 'text-[var(--status-danger)]' },
  medium: { label: 'Medium', dot: 'bg-[var(--status-warning)]', text: 'text-[var(--status-warning)]' },
  low: { label: 'Low', dot: 'bg-[var(--status-success)]', text: 'text-[var(--status-success)]' },
};

export const ExecutionHistoryView: React.FC<ExecutionHistoryViewProps> = ({
  tasks,
  onOpenDiff,
  onRollbackTask,
  onUpdateTaskPriority,
}) => {
  const [priorityFilter, setPriorityFilter] = useState<'all' | TaskPriority>('all');
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(tasks[0]?.id ?? null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const filteredTasks = useMemo(() => {
    if (priorityFilter === 'all') return tasks;
    return tasks.filter((t) => (t.priority || 'medium') === priorityFilter);
  }, [tasks, priorityFilter]);

  const selectedTask = useMemo(() => {
    return (
      filteredTasks.find((t) => t.id === selectedTaskId) ||
      filteredTasks[0] ||
      null
    );
  }, [filteredTasks, selectedTaskId]);

  const handlePriorityChange = async (taskId: string, priority: TaskPriority) => {
    setBusyId(`prio:${taskId}`);
    try {
      await onUpdateTaskPriority(taskId, priority);
    } finally {
      setBusyId(null);
    }
  };

  const handleRollback = async (taskId: string) => {
    setBusyId(`rb:${taskId}`);
    try {
      await onRollbackTask(taskId);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="h-full flex bg-[var(--surface-canvas)] overflow-hidden">
      {/* Left Task List */}
      <div className="w-[340px] shrink-0 border-r border-[var(--border-hairline)] bg-[var(--surface-sidebar)] flex flex-col">
        <div className="px-4 py-3 border-b border-[var(--border-hairline)] space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <History className="w-4 h-4 text-[var(--accent-primary)]" />
              <h1 className="text-xs font-semibold uppercase tracking-wider text-[var(--ink-primary)]">
                Task History ({filteredTasks.length})
              </h1>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2">
            <label htmlFor="history-priority-filter" className="text-[11px] text-[var(--ink-muted)]">
              Priority Filter
            </label>
            <select
              id="history-priority-filter"
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value as 'all' | TaskPriority)}
              className="h-7 px-2 text-xs rounded-[4px] bg-[var(--surface-canvas)] border border-[var(--border-hairline)] text-[var(--ink-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
            >
              <option value="all">All Priorities</option>
              <option value="high">High Priority</option>
              <option value="medium">Medium Priority</option>
              <option value="low">Low Priority</option>
            </select>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-[var(--border-hairline)]">
          {filteredTasks.length === 0 ? (
            <div className="p-6 text-center text-xs text-[var(--ink-muted)]">
              No tasks match the current priority filter.
            </div>
          ) : (
            filteredTasks.map((task) => {
              const p = PRIORITY_STYLE[task.priority || 'medium'];
              const isSelected = selectedTask?.id === task.id;
              return (
                <button
                  key={task.id}
                  type="button"
                  onClick={() => setSelectedTaskId(task.id)}
                  className={`w-full px-4 py-3 text-left transition-colors border-l-2 ${
                    isSelected
                      ? 'bg-[var(--surface-active)] border-l-[var(--accent-primary)]'
                      : 'border-l-transparent hover:bg-[var(--surface-hover)]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-mono font-semibold uppercase">
                      <span className={`w-1.5 h-1.5 rounded-full ${p.dot}`} />
                      <span className={p.text}>{p.label}</span>
                    </span>
                    <span className="text-[10px] font-mono text-[var(--ink-muted)] uppercase">
                      {task.status.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="mt-1 text-xs font-medium text-[var(--ink-primary)] line-clamp-2">
                    {task.title}
                  </div>
                  <div className="mt-1 text-[11px] font-mono tabular-nums text-[var(--ink-muted)]">
                    {task.changes.length} patch(es) · ${task.actualCostUsd.toFixed(4)} ·{' '}
                    {new Date(task.createdAt).toLocaleTimeString()}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Right Task Detail Inspector */}
      <div className="flex-1 overflow-y-auto p-6">
        {selectedTask ? (
          <div className="max-w-4xl space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--border-hairline)] pb-4">
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-[var(--ink-primary)]">
                  {selectedTask.title}
                </h2>
                <p className="text-xs text-[var(--ink-secondary)] mt-1">{selectedTask.description}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] font-mono text-[var(--ink-muted)]">
                  <span>{selectedTask.id}</span>
                  <span>·</span>
                  <span>{selectedTask.modelProvider}/{selectedTask.modelName}</span>
                  <span>·</span>
                  <span className="tabular-nums">
                    {selectedTask.promptTokens + selectedTask.completionTokens} tokens
                  </span>
                  <span>·</span>
                  <span className="tabular-nums">${selectedTask.actualCostUsd.toFixed(4)}</span>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <label className="text-xs text-[var(--ink-secondary)]">Priority:</label>
                <select
                  value={selectedTask.priority || 'medium'}
                  disabled={busyId === `prio:${selectedTask.id}`}
                  onChange={(e) =>
                    handlePriorityChange(selectedTask.id, e.target.value as TaskPriority)
                  }
                  className="h-8 px-2.5 text-xs rounded-[4px] bg-[var(--surface-elevated)] border border-[var(--border-strong)] text-[var(--ink-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                >
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>

                {selectedTask.rollbackSnapshot && !selectedTask.rollbackSnapshot.restored && (
                  <button
                    type="button"
                    disabled={busyId !== null}
                    onClick={() => handleRollback(selectedTask.id)}
                    className="h-8 px-3 text-xs font-medium rounded-[4px] border border-[var(--border-strong)] bg-[var(--surface-elevated)] text-[var(--ink-primary)] hover:bg-[var(--surface-hover)] inline-flex items-center gap-1.5"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Restore Snapshot
                  </button>
                )}
              </div>
            </div>

            {/* Execution Steps */}
            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--ink-muted)]">
                Execution Steps ({selectedTask.steps.length})
              </h3>
              <div className="border border-[var(--border-hairline)] rounded-[4px] divide-y divide-[var(--border-hairline)] bg-[var(--surface-elevated)]">
                {selectedTask.steps.map((step) => (
                  <div key={step.id} className="px-4 py-2.5 flex items-start justify-between gap-4 text-xs">
                    <div className="flex items-start gap-2.5">
                      {step.status === 'completed' ? (
                        <CheckCircle2 className="w-4 h-4 text-[var(--status-success)] shrink-0 mt-0.5" />
                      ) : step.status === 'failed' ? (
                        <XCircle className="w-4 h-4 text-[var(--status-danger)] shrink-0 mt-0.5" />
                      ) : (
                        <Clock className="w-4 h-4 text-[var(--status-warning)] shrink-0 mt-0.5" />
                      )}
                      <div>
                        <div className="font-medium text-[var(--ink-primary)]">
                          {step.stepNumber}. {step.action}
                        </div>
                        <div className="text-[11px] text-[var(--ink-secondary)] mt-0.5">
                          {step.outputSummary}
                        </div>
                      </div>
                    </div>
                    <span className="text-[11px] font-mono text-[var(--ink-muted)] shrink-0">
                      {step.agentType}
                    </span>
                  </div>
                ))}
              </div>
            </section>

            {/* File Changes */}
            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--ink-muted)]">
                Code Patches ({selectedTask.changes.length})
              </h3>
              {selectedTask.changes.length === 0 ? (
                <div className="p-4 border border-[var(--border-hairline)] rounded-[4px] bg-[var(--surface-elevated)] text-xs text-[var(--ink-muted)]">
                  No file changes recorded for this task.
                </div>
              ) : (
                <div className="border border-[var(--border-hairline)] rounded-[4px] divide-y divide-[var(--border-hairline)] bg-[var(--surface-elevated)]">
                  {selectedTask.changes.map((chg) => (
                    <div key={chg.id} className="px-4 py-3 flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <div className="text-xs font-mono font-medium text-[var(--ink-primary)]">
                          {chg.filePath}
                        </div>
                        <div className="text-[11px] text-[var(--ink-secondary)] mt-0.5">
                          {chg.rationale}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-[11px] font-mono text-[var(--ink-muted)] uppercase">
                          {chg.status}
                        </span>
                        <button
                          type="button"
                          onClick={() => onOpenDiff(chg)}
                          className="h-7 px-2.5 text-xs font-medium rounded-[3px] border border-[var(--border-strong)] bg-[var(--surface-canvas)] text-[var(--ink-primary)] hover:bg-[var(--surface-hover)] inline-flex items-center gap-1"
                        >
                          <FileDiff className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                          View Diff
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Approval Records */}
            {selectedTask.approvals.length > 0 && (
              <section className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--ink-muted)]">
                  Approval Audit Trail
                </h3>
                <div className="border border-[var(--border-hairline)] rounded-[4px] divide-y divide-[var(--border-hairline)] bg-[var(--surface-elevated)]">
                  {selectedTask.approvals.map((app) => (
                    <div key={app.id} className="px-4 py-3 flex items-center justify-between gap-4 text-xs">
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="w-4 h-4 text-[var(--accent-primary)]" />
                        <div>
                          <div className="font-medium text-[var(--ink-primary)]">{app.title}</div>
                          <div className="text-[11px] text-[var(--ink-secondary)]">{app.summary}</div>
                        </div>
                      </div>
                      <span className="text-[11px] font-mono uppercase text-[var(--ink-muted)]">
                        {app.status}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        ) : (
          <div className="h-full flex items-center justify-center text-xs text-[var(--ink-muted)]">
            Select a task from the list to inspect its execution history, patches, and rollback snapshot.
          </div>
        )}
      </div>
    </div>
  );
};
