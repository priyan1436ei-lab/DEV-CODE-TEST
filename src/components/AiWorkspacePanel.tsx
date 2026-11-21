import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  FileDiff,
  Loader2,
  MessageSquare,
  RotateCcw,
  Send,
  ShieldCheck,
  TerminalSquare,
  XCircle,
} from 'lucide-react';
import type {
  AgentTask,
  ChatMessage,
  CodeChange,
  CodeCitation,
  PublicUserSession,
  TaskPriority,
} from '../types/devmind';

interface AiWorkspacePanelProps {
  session: PublicUserSession;
  activeProjectName: string;
  tasks: AgentTask[];
  chatMessages: ChatMessage[];
  onCreateTask: (
    title: string,
    description: string,
    executionMode: 'approval' | 'direct',
    priority: TaskPriority
  ) => Promise<void>;
  onDecideApproval: (approvalId: string, decision: 'approve' | 'reject') => Promise<void>;
  onRollbackTask: (taskId: string) => Promise<void>;
  onCancelTask: (taskId: string) => Promise<void>;
  onSendChat: (message: string) => Promise<void>;
  onOpenDiff: (change: CodeChange) => void;
  onOpenCitation: (citation: CodeCitation) => void;
}

const PRIORITY_TONE: Record<TaskPriority, string> = {
  high: 'text-[var(--status-danger)]',
  medium: 'text-[var(--status-warning)]',
  low: 'text-[var(--status-success)]',
};

export const AiWorkspacePanel: React.FC<AiWorkspacePanelProps> = ({
  session,
  activeProjectName,
  tasks,
  chatMessages,
  onCreateTask,
  onDecideApproval,
  onRollbackTask,
  onCancelTask,
  onSendChat,
  onOpenDiff,
  onOpenCitation,
}) => {
  const [activeTab, setActiveTab] = useState<'tasks' | 'chat'>('tasks');
  const [taskPrompt, setTaskPrompt] = useState('');
  const [executionMode, setExecutionMode] = useState<'approval' | 'direct'>('approval');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [priorityFilter, setPriorityFilter] = useState<'all' | TaskPriority>('all');
  const [chatInput, setChatInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const safeTasks = Array.isArray(tasks) ? tasks : [];
  const safeChat = Array.isArray(chatMessages) ? chatMessages : [];

  const filteredTasks = useMemo(() => {
    if (priorityFilter === 'all') return safeTasks;
    return safeTasks.filter((t) => (t.priority || 'medium') === priorityFilter);
  }, [safeTasks, priorityFilter]);

  const handleTaskSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = taskPrompt.trim();
    if (!trimmed || submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const title = trimmed.length > 70 ? `${trimmed.slice(0, 67)}...` : trimmed;
      await onCreateTask(title, trimmed, executionMode, priority);
      setTaskPrompt('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to execute engineering task.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = chatInput.trim();
    if (!trimmed || submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      await onSendChat(trimmed);
      setChatInput('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to send repository query.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleApproval = async (approvalId: string, decision: 'approve' | 'reject') => {
    setActionBusyId(approvalId);
    setError(null);
    try {
      await onDecideApproval(approvalId, decision);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Approval action failed.');
    } finally {
      setActionBusyId(null);
    }
  };

  return (
    <aside className="h-full flex flex-col bg-[var(--surface-sidebar)] border-l border-[var(--border-hairline)] overflow-hidden">
      {/* Header Tabs */}
      <div className="h-10 px-3 border-b border-[var(--border-hairline)] bg-[var(--surface-chrome)] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setActiveTab('tasks')}
            className={`h-10 text-xs font-medium border-b-2 inline-flex items-center gap-1.5 transition-colors ${
              activeTab === 'tasks'
                ? 'border-[var(--accent-primary)] text-[var(--ink-primary)]'
                : 'border-transparent text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]'
            }`}
          >
            <TerminalSquare className="w-3.5 h-3.5" />
            Tasks
            <span className="font-mono tabular-nums text-[11px] text-[var(--ink-muted)]">
              {safeTasks.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('chat')}
            className={`h-10 text-xs font-medium border-b-2 inline-flex items-center gap-1.5 transition-colors ${
              activeTab === 'chat'
                ? 'border-[var(--accent-primary)] text-[var(--ink-primary)]'
                : 'border-transparent text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            Ask Repo
          </button>
        </div>

        <span className="text-[11px] font-mono text-[var(--ink-muted)] truncate max-w-[130px]" title={session.llm.model}>
          {session.llm.configured ? session.llm.model : 'Local Rules'}
        </span>
      </div>

      {error && (
        <div className="mx-3 mt-2.5 px-3 py-2 rounded-[4px] border border-[var(--status-danger)]/40 bg-[var(--status-danger)]/10 text-xs text-[var(--status-danger)] flex items-center justify-between gap-2 shrink-0">
          <span className="truncate">{error}</span>
          <button type="button" onClick={() => setError(null)} className="text-[11px] underline shrink-0">
            Close
          </button>
        </div>
      )}

      {activeTab === 'tasks' ? (
        <>
          {/* Task Priority Filter Strip */}
          <div className="px-3 py-2 border-b border-[var(--border-hairline)] flex items-center justify-between gap-2 shrink-0">
            <span className="text-[11px] text-[var(--ink-muted)] truncate">
              Repo: <span className="text-[var(--ink-primary)] font-medium">{activeProjectName}</span>
            </span>
            <select
              aria-label="Filter tasks by priority"
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value as 'all' | TaskPriority)}
              className="h-6 px-1.5 text-[11px] rounded-[3px] bg-[var(--surface-canvas)] border border-[var(--border-hairline)] text-[var(--ink-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
            >
              <option value="all">All Priorities</option>
              <option value="high">High Priority</option>
              <option value="medium">Medium Priority</option>
              <option value="low">Low Priority</option>
            </select>
          </div>

          {/* Task Stream */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {filteredTasks.length === 0 ? (
              <div className="py-8 px-3 text-center text-xs text-[var(--ink-muted)] border border-dashed border-[var(--border-hairline)] rounded-[4px]">
                Describe a code change, refactor, or security remediation below to generate reviewed patches.
              </div>
            ) : (
              filteredTasks.map((task) => {
                const pendingApproval = task.approvals.find((a) => a.status === 'pending');
                const taskPriority = task.priority || 'medium';

                return (
                  <div
                    key={task.id}
                    className="rounded-[4px] border border-[var(--border-hairline)] bg-[var(--surface-elevated)] overflow-hidden"
                  >
                    <div className="px-3 py-2.5 border-b border-[var(--border-hairline)]">
                      <div className="flex items-start justify-between gap-2">
                        <div className="text-xs font-semibold text-[var(--ink-primary)] leading-snug">
                          {task.title}
                        </div>
                        <span
                          className={`text-[10px] font-mono font-semibold uppercase shrink-0 ${PRIORITY_TONE[taskPriority]}`}
                        >
                          {taskPriority}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-[11px] font-mono text-[var(--ink-muted)]">
                        <span>{task.status.replace('_', ' ')}</span>
                        <span>·</span>
                        <span>{task.executionMode === 'approval' ? 'Approval Gate' : 'Direct Apply'}</span>
                        <span>·</span>
                        <span className="tabular-nums">${task.actualCostUsd.toFixed(4)}</span>
                      </div>
                    </div>

                    {/* Steps Summary */}
                    {task.steps.length > 0 && (
                      <div className="px-3 py-2 space-y-1 border-b border-[var(--border-hairline)] bg-[var(--surface-canvas)]">
                        {task.steps.map((step) => (
                          <div key={step.id} className="flex items-center justify-between gap-2 text-[11px]">
                            <div className="flex items-center gap-1.5 min-w-0">
                              {step.status === 'completed' ? (
                                <CheckCircle2 className="w-3 h-3 text-[var(--status-success)] shrink-0" />
                              ) : step.status === 'failed' ? (
                                <XCircle className="w-3 h-3 text-[var(--status-danger)] shrink-0" />
                              ) : (
                                <Clock className="w-3 h-3 text-[var(--status-warning)] shrink-0" />
                              )}
                              <span className="text-[var(--ink-secondary)] truncate">{step.action}</span>
                            </div>
                            <span className="font-mono text-[10px] text-[var(--ink-muted)] shrink-0">
                              {step.agentType}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Proposed / Applied File Patches */}
                    {task.changes.length > 0 && (
                      <div className="px-3 py-2 space-y-1 border-b border-[var(--border-hairline)]">
                        {task.changes.map((chg) => (
                          <button
                            key={chg.id}
                            type="button"
                            onClick={() => onOpenDiff(chg)}
                            className="w-full px-2 py-1 rounded-[3px] bg-[var(--surface-canvas)] hover:bg-[var(--surface-hover)] border border-[var(--border-hairline)] flex items-center justify-between gap-2 text-[11px] transition-colors"
                          >
                            <span className="inline-flex items-center gap-1.5 font-mono text-[var(--ink-primary)] truncate">
                              <FileDiff className="w-3 h-3 text-[var(--accent-primary)] shrink-0" />
                              {chg.filePath}
                            </span>
                            <span className="text-[10px] font-mono text-[var(--ink-muted)] shrink-0">
                              {chg.status}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Approval Checkpoint */}
                    {pendingApproval && (
                      <div className="px-3 py-2.5 bg-[var(--surface-subtle)] border-b border-[var(--border-hairline)] space-y-2">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--ink-primary)]">
                          <ShieldCheck className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                          {pendingApproval.title}
                        </div>
                        <p className="text-[11px] text-[var(--ink-secondary)] leading-relaxed">
                          {pendingApproval.summary}
                        </p>
                        <div className="flex items-center gap-2 pt-0.5">
                          <button
                            type="button"
                            disabled={actionBusyId !== null}
                            onClick={() => handleApproval(pendingApproval.id, 'approve')}
                            className="flex-1 h-7 px-2.5 text-xs font-medium rounded-[3px] bg-[var(--accent-primary)] text-[var(--accent-ink)] hover:bg-[var(--accent-hover)] disabled:opacity-40"
                          >
                            {actionBusyId === pendingApproval.id ? 'Applying...' : 'Approve & Apply'}
                          </button>
                          <button
                            type="button"
                            disabled={actionBusyId !== null}
                            onClick={() => handleApproval(pendingApproval.id, 'reject')}
                            className="h-7 px-2.5 text-xs font-medium rounded-[3px] border border-[var(--border-strong)] text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:bg-[var(--surface-hover)] disabled:opacity-40"
                          >
                            Reject
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Final Report / Rollback Actions */}
                    <div className="px-3 py-2 flex items-center justify-between gap-2 text-[11px]">
                      <span className="text-[var(--ink-secondary)] truncate">
                        {task.finalReport?.summary || task.errorMessage || 'Ready'}
                      </span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {task.rollbackSnapshot && !task.rollbackSnapshot.restored && (
                          <button
                            type="button"
                            disabled={actionBusyId !== null}
                            onClick={async () => {
                              setActionBusyId(task.id);
                              try {
                                await onRollbackTask(task.id);
                              } finally {
                                setActionBusyId(null);
                              }
                            }}
                            className="h-6 px-2 rounded-[3px] border border-[var(--border-strong)] text-[var(--ink-primary)] hover:bg-[var(--surface-hover)] inline-flex items-center gap-1"
                          >
                            <RotateCcw className="w-3 h-3" />
                            Rollback
                          </button>
                        )}
                        {task.status === 'awaiting_approval' && (
                          <button
                            type="button"
                            disabled={actionBusyId !== null}
                            onClick={() => onCancelTask(task.id)}
                            className="h-6 px-2 rounded-[3px] border border-[var(--border-hairline)] text-[var(--ink-muted)] hover:text-[var(--status-danger)]"
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Task Composer */}
          <form
            onSubmit={handleTaskSubmit}
            className="p-3 border-t border-[var(--border-hairline)] bg-[var(--surface-elevated)] space-y-2 shrink-0"
          >
            <textarea
              value={taskPrompt}
              onChange={(e) => setTaskPrompt(e.target.value)}
              rows={3}
              placeholder="Describe a code patch, bug fix, or security hardening task..."
              className="w-full p-2.5 text-xs rounded-[4px] bg-[var(--surface-canvas)] border border-[var(--border-hairline)] text-[var(--ink-primary)] placeholder:text-[var(--ink-muted)] resize-none focus:outline-none focus:border-[var(--accent-primary)]"
            />
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <select
                  aria-label="Task priority"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as TaskPriority)}
                  className="h-7 px-2 text-[11px] rounded-[3px] bg-[var(--surface-canvas)] border border-[var(--border-hairline)] text-[var(--ink-primary)] focus:outline-none"
                >
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
                <select
                  aria-label="Execution policy"
                  value={executionMode}
                  onChange={(e) => setExecutionMode(e.target.value as 'approval' | 'direct')}
                  className="h-7 px-2 text-[11px] rounded-[3px] bg-[var(--surface-canvas)] border border-[var(--border-hairline)] text-[var(--ink-primary)] focus:outline-none"
                >
                  <option value="approval">Approval Gate</option>
                  <option value="direct">Direct Apply</option>
                </select>
              </div>
              <button
                type="submit"
                disabled={submitting || !taskPrompt.trim()}
                className="h-7 px-3 text-xs font-medium rounded-[3px] bg-[var(--accent-primary)] text-[var(--accent-ink)] hover:bg-[var(--accent-hover)] disabled:opacity-40 inline-flex items-center gap-1.5"
              >
                {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3 h-3" />}
                Run Task
              </button>
            </div>
          </form>
        </>
      ) : (
        <>
          {/* Ask Repo Chat Thread */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {safeChat.length === 0 ? (
              <div className="py-8 px-3 text-center text-xs text-[var(--ink-muted)] border border-dashed border-[var(--border-hairline)] rounded-[4px]">
                Ask questions about symbols, routes, dependencies, or security controls in {activeProjectName}.
              </div>
            ) : (
              safeChat.map((msg) => (
                <div
                  key={msg.id}
                  className={`p-3 rounded-[4px] border text-xs leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-[var(--accent-soft)] border-[var(--accent-primary)]/30 text-[var(--ink-primary)] ml-4'
                      : 'bg-[var(--surface-elevated)] border-[var(--border-hairline)] text-[var(--ink-primary)] mr-2'
                  }`}
                >
                  <div className="text-[10px] font-mono uppercase text-[var(--ink-muted)] mb-1 flex items-center justify-between">
                    <span>{msg.role === 'user' ? session.displayName : msg.modelUsed || 'Workspace Assistant'}</span>
                    {msg.tokensUsed ? <span className="tabular-nums">{msg.tokensUsed} tok</span> : null}
                  </div>
                  <div className="whitespace-pre-wrap">{msg.content}</div>
                  {msg.citations && msg.citations.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-[var(--border-hairline)] flex flex-wrap gap-1.5">
                      {msg.citations.map((cit, i) => (
                        <button
                          key={`${cit.filePath}:${cit.startLine}:${i}`}
                          type="button"
                          onClick={() => onOpenCitation(cit)}
                          className="px-2 py-0.5 text-[11px] font-mono rounded-[3px] border border-[var(--border-hairline)] bg-[var(--surface-canvas)] text-[var(--accent-primary)] hover:border-[var(--accent-primary)]"
                        >
                          {cit.filePath}:{cit.startLine}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          <form
            onSubmit={handleChatSubmit}
            className="p-3 border-t border-[var(--border-hairline)] bg-[var(--surface-elevated)] flex items-center gap-2 shrink-0"
          >
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Ask about this repository..."
              className="flex-1 h-8 px-2.5 text-xs rounded-[4px] bg-[var(--surface-canvas)] border border-[var(--border-hairline)] text-[var(--ink-primary)] placeholder:text-[var(--ink-muted)] focus:outline-none focus:border-[var(--accent-primary)]"
            />
            <button
              type="submit"
              disabled={submitting || !chatInput.trim()}
              className="h-8 px-3 text-xs font-medium rounded-[4px] bg-[var(--accent-primary)] text-[var(--accent-ink)] hover:bg-[var(--accent-hover)] disabled:opacity-40 inline-flex items-center gap-1"
            >
              {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            </button>
          </form>
        </>
      )}
    </aside>
  );
};
