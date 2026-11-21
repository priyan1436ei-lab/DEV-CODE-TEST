import React, { useMemo, useState } from 'react';
import {
  Activity,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Circle,
  Clock,
  FileCode2,
  Loader2,
  PauseCircle,
  Plus,
  X,
  XCircle,
} from 'lucide-react';
import type { AgentStep, AgentTask, ScreenId, TaskPriority, TaskStatus } from '../types/devmind';

export interface PipelineStageState {
  key: string;
  stepNumber: number;
  agentType: AgentStep['agentType'];
  label: string;
  status: AgentStep['status'];
  action: string;
  inputSummary?: string;
  outputSummary?: string;
  durationMs?: number;
  createdAt?: string;
}

export interface TaskProgressSummary {
  percent: number;
  completedCount: number;
  totalCount: number;
  currentStageLabel: string;
  stages: PipelineStageState[];
  totalDurationMs: number;
  isActive: boolean;
}

const CANONICAL_PIPELINE: Array<{
  agentType: AgentStep['agentType'];
  label: string;
  defaultAction: string;
}> = [
  {
    agentType: 'repository',
    label: 'Inspect',
    defaultAction: 'Inspect repository AST, static security findings, and diagnostics',
  },
  {
    agentType: 'planner',
    label: 'Plan',
    defaultAction: 'Synthesize multi-step execution plan and root-cause analysis',
  },
  {
    agentType: 'coding',
    label: 'Synthesize',
    defaultAction: 'Generate multi-file source patches and unified diffs',
  },
  {
    agentType: 'policy',
    label: 'Policy Gate',
    defaultAction: 'Evaluate permission rules and developer approval checkpoint',
  },
  {
    agentType: 'security',
    label: 'Verify',
    defaultAction: 'Apply patches, re-index AST, and run post-patch security scan',
  },
];

const AGENT_LABEL_MAP: Record<AgentStep['agentType'], string> = {
  repository: 'Inspect',
  planner: 'Plan',
  coding: 'Synthesize',
  policy: 'Policy Gate',
  security: 'Verify',
  review: 'Review',
  debugging: 'Diagnose',
};

const ACTIVE_STATUSES = new Set<TaskStatus>(['pending', 'planning', 'running', 'awaiting_approval']);

const STATUS_META: Record<
  TaskStatus,
  { label: string; textColor: string; barColor: string }
> = {
  pending: {
    label: 'Queued',
    textColor: 'text-[var(--ink-secondary)]',
    barColor: 'bg-[var(--accent-primary)]',
  },
  planning: {
    label: 'Planning',
    textColor: 'text-[var(--accent-primary)]',
    barColor: 'bg-[var(--accent-primary)]',
  },
  running: {
    label: 'Running',
    textColor: 'text-[var(--accent-primary)]',
    barColor: 'bg-[var(--accent-primary)]',
  },
  awaiting_approval: {
    label: 'Awaiting Approval',
    textColor: 'text-[var(--status-warning)]',
    barColor: 'bg-[var(--status-warning)]',
  },
  completed: {
    label: 'Completed',
    textColor: 'text-[var(--status-success)]',
    barColor: 'bg-[var(--status-success)]',
  },
  failed: {
    label: 'Failed',
    textColor: 'text-[var(--status-danger)]',
    barColor: 'bg-[var(--status-danger)]',
  },
  cancelled: {
    label: 'Cancelled',
    textColor: 'text-[var(--ink-muted)]',
    barColor: 'bg-[var(--ink-muted)]',
  },
};

const PRIORITY_TEXT: Record<TaskPriority, { label: string; color: string }> = {
  high: { label: 'High', color: 'text-[var(--status-danger)]' },
  medium: { label: 'Medium', color: 'text-[var(--status-warning)]' },
  low: { label: 'Low', color: 'text-[var(--status-success)]' },
};

export function isTaskActive(status: TaskStatus): boolean {
  return ACTIVE_STATUSES.has(status);
}

export function formatDurationMs(ms?: number): string {
  if (!ms || ms <= 0) return '';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function computeTaskProgress(task: AgentTask): TaskProgressSummary {
  const isActive = isTaskActive(task.status);
  const stepsByType = new Map<AgentStep['agentType'], AgentStep>();
  const extraSteps: AgentStep[] = [];

  for (const step of task.steps || []) {
    const isCanonical = CANONICAL_PIPELINE.some((c) => c.agentType === step.agentType);
    if (isCanonical && !stepsByType.has(step.agentType)) {
      stepsByType.set(step.agentType, step);
    } else {
      extraSteps.push(step);
    }
  }

  const stages: PipelineStageState[] = CANONICAL_PIPELINE.map((slot, index) => {
    const recorded = stepsByType.get(slot.agentType);
    if (recorded) {
      return {
        key: recorded.id,
        stepNumber: index + 1,
        agentType: slot.agentType,
        label: slot.label,
        status: recorded.status,
        action: recorded.action,
        inputSummary: recorded.inputSummary,
        outputSummary: recorded.outputSummary,
        durationMs: recorded.durationMs,
        createdAt: recorded.createdAt,
      };
    }

    let inferredStatus: AgentStep['status'] = 'pending';
    if (task.status === 'completed') {
      inferredStatus = 'completed';
    } else if (task.status === 'cancelled') {
      inferredStatus = 'skipped';
    } else if (task.status === 'planning' && slot.agentType === 'planner') {
      inferredStatus = 'running';
    } else if (task.status === 'running' && index === task.steps.length) {
      inferredStatus = 'running';
    } else if (task.status === 'failed' && index === task.steps.length) {
      inferredStatus = 'failed';
    }

    return {
      key: `${task.id}-${slot.agentType}`,
      stepNumber: index + 1,
      agentType: slot.agentType,
      label: slot.label,
      status: inferredStatus,
      action: slot.defaultAction,
    };
  });

  // Append any non-canonical extra steps (e.g. review, debugging, or retries)
  for (const extra of extraSteps) {
    stages.push({
      key: extra.id,
      stepNumber: stages.length + 1,
      agentType: extra.agentType,
      label: AGENT_LABEL_MAP[extra.agentType] || extra.agentType,
      status: extra.status,
      action: extra.action,
      inputSummary: extra.inputSummary,
      outputSummary: extra.outputSummary,
      durationMs: extra.durationMs,
      createdAt: extra.createdAt,
    });
  }

  const totalCount = Math.max(1, stages.length);
  let completedCount = 0;
  let weightedScore = 0;

  for (const stage of stages) {
    if (stage.status === 'completed') {
      completedCount += 1;
      weightedScore += 1;
    } else if (stage.status === 'running' || stage.status === 'awaiting_approval') {
      weightedScore += 0.5;
    }
  }

  const percent =
    task.status === 'completed'
      ? 100
      : Math.min(99, Math.max(0, Math.round((weightedScore / totalCount) * 100)));

  const currentStage =
    stages.find((s) => s.status === 'running' || s.status === 'awaiting_approval') ||
    stages.find((s) => s.status === 'failed') ||
    stages.find((s) => s.status === 'pending') ||
    stages[stages.length - 1];

  const totalDurationMs = (task.steps || []).reduce((acc, s) => acc + (s.durationMs ?? 0), 0);

  return {
    percent,
    completedCount,
    totalCount,
    currentStageLabel: currentStage?.label ?? 'Queued',
    stages,
    totalDurationMs,
    isActive,
  };
}

interface ActiveTasksTimelineProps {
  tasks: AgentTask[];
  onNavigate: (screen: ScreenId) => void;
  onOpenFileLine: (filePath: string, line: number) => void;
  onOpenAgentPanel?: () => void;
  onDecideApproval?: (approvalId: string, decision: 'approve' | 'reject') => Promise<void>;
  onCancelTask?: (taskId: string) => Promise<void>;
}

export const ActiveTasksTimeline: React.FC<ActiveTasksTimelineProps> = ({
  tasks,
  onNavigate,
  onOpenFileLine,
  onOpenAgentPanel,
  onDecideApproval,
  onCancelTask,
}) => {
  const [viewMode, setViewMode] = useState<'active' | 'all'>('active');
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [selectedStageByTask, setSelectedStageByTask] = useState<Record<string, string>>({});
  const [busyActionId, setBusyActionId] = useState<string | null>(null);

  const activeTasks = useMemo(
    () => tasks.filter((t) => isTaskActive(t.status)),
    [tasks]
  );

  const orderedAllTasks = useMemo(() => {
    const active = tasks.filter((t) => isTaskActive(t.status));
    const rest = tasks.filter((t) => !isTaskActive(t.status));
    return [...active, ...rest].slice(0, 6);
  }, [tasks]);

  const visibleTasks = viewMode === 'active' ? activeTasks : orderedAllTasks;

  const aggregateStats = useMemo(() => {
    const scope = activeTasks.length > 0 ? activeTasks : tasks.slice(0, 6);
    if (scope.length === 0) {
      return { avgPercent: 0, awaitingApprovalCount: 0, runningCount: 0 };
    }
    const totalPct = scope.reduce((sum, t) => sum + computeTaskProgress(t).percent, 0);
    return {
      avgPercent: Math.round(totalPct / scope.length),
      awaitingApprovalCount: activeTasks.filter((t) => t.status === 'awaiting_approval').length,
      runningCount: activeTasks.filter((t) => t.status !== 'awaiting_approval').length,
    };
  }, [activeTasks, tasks]);

  const handleApproval = async (approvalId: string, decision: 'approve' | 'reject') => {
    if (!onDecideApproval) return;
    setBusyActionId(`${approvalId}:${decision}`);
    try {
      await onDecideApproval(approvalId, decision);
    } finally {
      setBusyActionId(null);
    }
  };

  const handleCancel = async (taskId: string) => {
    if (!onCancelTask) return;
    setBusyActionId(`cancel:${taskId}`);
    try {
      await onCancelTask(taskId);
    } finally {
      setBusyActionId(null);
    }
  };

  const renderStageIcon = (status: AgentStep['status']) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="w-3.5 h-3.5 text-[var(--status-success)] shrink-0" />;
      case 'running':
        return <Loader2 className="w-3.5 h-3.5 text-[var(--accent-primary)] animate-spin shrink-0" />;
      case 'awaiting_approval':
        return <PauseCircle className="w-3.5 h-3.5 text-[var(--status-warning)] shrink-0" />;
      case 'failed':
        return <XCircle className="w-3.5 h-3.5 text-[var(--status-danger)] shrink-0" />;
      default:
        return <Circle className="w-3.5 h-3.5 text-[var(--ink-muted)] opacity-60 shrink-0" />;
    }
  };

  return (
    <section
      aria-label="Agent Job Progress Timeline"
      className="apple-card overflow-hidden"
    >
      {/* Header Bar */}
      <div className="px-4 py-3 border-b border-[var(--border-hairline)] flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-[var(--accent-primary)] shrink-0" />
            <h2 className="text-xs font-semibold text-[var(--ink-primary)]">
              Agent Job Pipeline &amp; Timeline
            </h2>
          </div>
          <p className="text-[11px] text-[var(--ink-muted)] mt-0.5 font-mono tabular-nums">
            {activeTasks.length > 0 ? (
              <>
                {activeTasks.length} active job{activeTasks.length === 1 ? '' : 's'}
                {aggregateStats.runningCount > 0 && ` · ${aggregateStats.runningCount} executing`}
                {aggregateStats.awaitingApprovalCount > 0 &&
                  ` · ${aggregateStats.awaitingApprovalCount} awaiting approval`}
                {` · ${aggregateStats.avgPercent}% avg completion`}
              </>
            ) : (
              <>
                No active jobs running · {tasks.length} recorded engineering job
                {tasks.length === 1 ? '' : 's'}
              </>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <div
            className="apple-segmented"
            role="group"
            aria-label="Filter timeline jobs"
          >
            <button
              type="button"
              data-active={viewMode === 'active'}
              onClick={() => setViewMode('active')}
              className="apple-segmented-item h-6 px-2.5 text-[11px] font-medium text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] whitespace-nowrap shrink-0 tabular-nums"
            >
              Active ({activeTasks.length})
            </button>
            <button
              type="button"
              data-active={viewMode === 'all'}
              onClick={() => setViewMode('all')}
              className="apple-segmented-item h-6 px-2.5 text-[11px] font-medium text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] whitespace-nowrap shrink-0 tabular-nums"
            >
              All Jobs ({tasks.length})
            </button>
          </div>

          <button
            type="button"
            onClick={() => onNavigate('history')}
            className="text-xs font-medium text-[var(--accent-primary)] hover:underline inline-flex items-center gap-1 whitespace-nowrap shrink-0"
          >
            History <ArrowRight className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Empty State */}
      {visibleTasks.length === 0 ? (
        <div className="px-5 py-7 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-medium text-[var(--ink-primary)]">
              {viewMode === 'active'
                ? 'All multi-step agent jobs are currently idle.'
                : 'No multi-step engineering jobs have been dispatched yet.'}
            </p>
            <p className="text-[11px] text-[var(--ink-muted)] mt-1">
              Dispatch a repository task from the AI Workspace inspector to monitor live stage-by-stage completion, approval checkpoints, and patch verification here.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {viewMode === 'active' && tasks.length > 0 && (
              <button
                type="button"
                onClick={() => setViewMode('all')}
                className="h-8 px-3 text-xs font-medium rounded-lg border border-[var(--border-strong)] bg-[var(--surface-canvas)] text-[var(--ink-primary)] hover:bg-[var(--surface-hover)] transition-colors whitespace-nowrap shrink-0"
              >
                Show All Jobs ({tasks.length})
              </button>
            )}
            {onOpenAgentPanel && (
              <button
                type="button"
                onClick={onOpenAgentPanel}
                className="h-8 px-3.5 text-xs font-semibold rounded-lg bg-[var(--accent-primary)] text-[var(--accent-ink)] hover:bg-[var(--accent-hover)] inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                New Agent Task
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="divide-y divide-[var(--border-hairline)]">
          {visibleTasks.map((task) => {
            const progress = computeTaskProgress(task);
            const statusMeta = STATUS_META[task.status];
            const priorityMeta = PRIORITY_TEXT[task.priority || 'medium'];
            const pendingApproval = task.approvals.find((a) => a.status === 'pending');
            const isExpanded = expandedTaskId === task.id;
            const selectedStageKey =
              selectedStageByTask[task.id] ||
              progress.stages.find((s) => s.status === 'awaiting_approval' || s.status === 'running')?.key ||
              progress.stages[Math.max(0, progress.completedCount - 1)]?.key ||
              progress.stages[0]?.key;
            const selectedStage =
              progress.stages.find((s) => s.key === selectedStageKey) || progress.stages[0];

            return (
              <div key={task.id} className="px-4 py-4 space-y-3">
                {/* Row 1: Title, Metadata & Completion Percentage */}
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[13px] font-semibold text-[var(--ink-primary)] truncate">
                        {task.title}
                      </span>
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] font-mono tabular-nums text-[var(--ink-muted)]">
                      <span className={`font-semibold ${statusMeta.textColor}`}>
                        {statusMeta.label}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className={priorityMeta.color}>{priorityMeta.label} priority</span>
                      <span aria-hidden="true">·</span>
                      <span>
                        {progress.completedCount}/{progress.totalCount} steps
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>Stage: {progress.currentStageLabel}</span>
                      {progress.totalDurationMs > 0 && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>{formatDurationMs(progress.totalDurationMs)}</span>
                        </>
                      )}
                      {task.changes.length > 0 && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>
                            {task.changes.length} file patch{task.changes.length === 1 ? '' : 'es'}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Right Actions & Percentage Readout */}
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <div className="text-sm font-semibold font-mono tabular-nums text-[var(--ink-primary)] leading-none">
                        {progress.percent}%
                      </div>
                      <div className="text-[10px] font-mono tabular-nums text-[var(--ink-muted)] mt-0.5">
                        {new Date(task.createdAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setExpandedTaskId(isExpanded ? null : task.id)}
                      aria-expanded={isExpanded}
                      className="h-7 px-2.5 text-[11px] font-medium rounded-lg border border-[var(--border-strong)] bg-[var(--surface-canvas)] text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:bg-[var(--surface-hover)] inline-flex items-center gap-1 transition-colors whitespace-nowrap shrink-0"
                    >
                      Steps
                      {isExpanded ? (
                        <ChevronUp className="w-3 h-3" />
                      ) : (
                        <ChevronDown className="w-3 h-3" />
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => onNavigate('history')}
                      className="h-7 px-2.5 text-[11px] font-medium rounded-lg text-[var(--accent-primary)] hover:bg-[var(--accent-soft)] transition-colors whitespace-nowrap shrink-0"
                    >
                      Inspect
                    </button>
                  </div>
                </div>

                {/* Row 2: Precision Progress Bar (Compositor-Only scaleX Animation) */}
                <div
                  role="progressbar"
                  aria-label={`${task.title} completion`}
                  aria-valuenow={progress.percent}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  className="h-2 w-full rounded-full bg-[var(--surface-hover)] overflow-hidden"
                >
                  <div
                    className={`h-full w-full origin-left rounded-full transition-transform duration-300 ease-out ${statusMeta.barColor}`}
                    style={{ transform: `scaleX(${Math.max(0.02, progress.percent / 100)})` }}
                  />
                </div>

                {/* Row 3: Multi-Step Horizontal Timeline Track */}
                <div className="overflow-x-auto pb-0.5">
                  <ol className="flex items-center min-w-[520px] gap-1">
                    {progress.stages.map((stage, idx) => {
                      const isStageSelected = isExpanded && selectedStage?.key === stage.key;
                      const connectorDone = stage.status === 'completed';

                      return (
                        <React.Fragment key={stage.key}>
                          <li className="shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedStageByTask((prev) => ({
                                  ...prev,
                                  [task.id]: stage.key,
                                }));
                                setExpandedTaskId(task.id);
                              }}
                              className={`px-2 py-1.5 rounded-lg inline-flex items-center gap-1.5 text-left transition-colors ${
                                isStageSelected
                                  ? 'bg-[var(--accent-soft)] text-[var(--ink-primary)]'
                                  : 'hover:bg-[var(--surface-hover)] text-[var(--ink-secondary)]'
                              }`}
                            >
                              {renderStageIcon(stage.status)}
                              <span className="text-[11px] font-medium whitespace-nowrap">
                                {stage.stepNumber}. {stage.label}
                              </span>
                              {stage.durationMs !== undefined && stage.durationMs > 0 && (
                                <span className="text-[10px] font-mono tabular-nums text-[var(--ink-muted)] whitespace-nowrap">
                                  {formatDurationMs(stage.durationMs)}
                                </span>
                              )}
                            </button>
                          </li>

                          {idx < progress.stages.length - 1 && (
                            <li aria-hidden="true" className="flex-1 min-w-[16px]">
                              <div
                                className={`h-px w-full transition-colors ${
                                  connectorDone
                                    ? 'bg-[var(--status-success)] opacity-60'
                                    : 'bg-[var(--border-strong)]'
                                }`}
                              />
                            </li>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </ol>
                </div>

                {/* Row 4: Inline Action Strip for Active Approval Checkpoints or Running Cancel */}
                {(pendingApproval || (progress.isActive && onCancelTask)) && (
                  <div className="pt-2 border-t border-[var(--border-hairline)] flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0 flex items-center gap-2 text-[11px] text-[var(--ink-secondary)]">
                      <Clock className="w-3.5 h-3.5 text-[var(--status-warning)] shrink-0" />
                      <span className="truncate">
                        {pendingApproval
                          ? `${pendingApproval.title} — ${pendingApproval.affectedFiles.join(', ')}`
                          : `Task is currently ${statusMeta.label.toLowerCase()} at stage ${progress.currentStageLabel}.`}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {pendingApproval && onDecideApproval && (
                        <>
                          <button
                            type="button"
                            disabled={busyActionId !== null}
                            onClick={() => handleApproval(pendingApproval.id, 'approve')}
                            className="h-7 px-3 text-[11px] font-semibold rounded-lg bg-[var(--accent-primary)] text-[var(--accent-ink)] hover:bg-[var(--accent-hover)] disabled:opacity-40 inline-flex items-center gap-1 transition-colors whitespace-nowrap shrink-0"
                          >
                            <Check className="w-3 h-3" />
                            {busyActionId === `${pendingApproval.id}:approve`
                              ? 'Applying...'
                              : 'Approve Patches'}
                          </button>
                          <button
                            type="button"
                            disabled={busyActionId !== null}
                            onClick={() => handleApproval(pendingApproval.id, 'reject')}
                            className="h-7 px-2.5 text-[11px] font-medium rounded-lg border border-[var(--border-strong)] bg-[var(--surface-canvas)] text-[var(--ink-secondary)] hover:text-[var(--status-danger)] hover:bg-[var(--surface-hover)] disabled:opacity-40 inline-flex items-center gap-1 transition-colors whitespace-nowrap shrink-0"
                          >
                            <X className="w-3 h-3" />
                            Reject
                          </button>
                        </>
                      )}

                      {!pendingApproval && progress.isActive && onCancelTask && (
                        <button
                          type="button"
                          disabled={busyActionId !== null}
                          onClick={() => handleCancel(task.id)}
                          className="h-7 px-2.5 text-[11px] font-medium rounded-lg border border-[var(--border-strong)] bg-[var(--surface-canvas)] text-[var(--ink-secondary)] hover:text-[var(--status-danger)] hover:bg-[var(--surface-hover)] disabled:opacity-40 transition-colors whitespace-nowrap shrink-0"
                        >
                          {busyActionId === `cancel:${task.id}` ? 'Cancelling...' : 'Cancel Job'}
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Row 5: Expandable Step Inspector & Affected Files (Hairline Divider, Zero Nested Cards) */}
                {isExpanded && selectedStage && (
                  <div className="pt-3 border-t border-[var(--border-hairline)] space-y-2.5 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {renderStageIcon(selectedStage.status)}
                        <span className="font-semibold text-[var(--ink-primary)] truncate">
                          Step {selectedStage.stepNumber}: {selectedStage.action}
                        </span>
                      </div>
                      <span className="text-[11px] font-mono tabular-nums text-[var(--ink-muted)] shrink-0">
                        {selectedStage.status.replace('_', ' ')}
                        {selectedStage.durationMs
                          ? ` · ${formatDurationMs(selectedStage.durationMs)}`
                          : ''}
                      </span>
                    </div>

                    {selectedStage.inputSummary && (
                      <div className="text-[11px] text-[var(--ink-secondary)]">
                        <span className="font-mono text-[var(--ink-muted)]">Input: </span>
                        {selectedStage.inputSummary}
                      </div>
                    )}

                    {selectedStage.outputSummary && (
                      <div className="text-[11px] text-[var(--ink-secondary)]">
                        <span className="font-mono text-[var(--ink-muted)]">Output: </span>
                        {selectedStage.outputSummary}
                      </div>
                    )}

                    {task.errorMessage && task.status === 'failed' && (
                      <div className="text-[11px] text-[var(--status-danger)] font-mono">
                        Error: {task.errorMessage}
                      </div>
                    )}

                    {task.changes.length > 0 && (
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1">
                        <span className="text-[11px] font-mono text-[var(--ink-muted)]">
                          Affected files:
                        </span>
                        {task.changes.map((chg) => (
                          <button
                            key={chg.id}
                            type="button"
                            onClick={() => onOpenFileLine(chg.filePath, 1)}
                            className="inline-flex items-center gap-1 text-[11px] font-mono text-[var(--accent-primary)] hover:underline"
                          >
                            <FileCode2 className="w-3 h-3 shrink-0" />
                            {chg.filePath}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};
