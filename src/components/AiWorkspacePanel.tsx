import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Clock,
  FileDiff,
  KeyRound,
  Lock,
  MessageSquare,
  Play,
  RotateCcw,
  Send,
  ShieldAlert,
  XCircle,
} from 'lucide-react';
import type {
  AgentTask,
  ChatMessage,
  CodeChange,
  Project,
  PublicUserSession,
  TaskPriority,
  TaskStatus,
} from '../types/devmind';

interface AiWorkspacePanelProps {
  project: Project;
  session: PublicUserSession;
  activeTask: AgentTask | null;
  chatMessages: ChatMessage[];
  agentBusy: boolean;
  chatBusy: boolean;
  draftTaskPrompt: string;
  onDraftTaskPromptChange: (v: string) => void;
  onStartTask: (
    title: string,
    description: string,
    executionMode: 'approval' | 'strict_sandbox',
    priority: TaskPriority
  ) => Promise<void>;
  onDecideApproval: (approvalId: string, decision: 'approve' | 'reject') => Promise<void>;
  onRollbackTask: (taskId: string) => Promise<void>;
  onSendChat: (message: string) => Promise<void>;
  onInspectDiff: (change: CodeChange) => void;
  onOpenFileAtLine: (filePath: string, line?: number) => void;
  onOpenLlmSettings: () => void;
}

const STATUS_META: Record<TaskStatus, { label: string; color: string }> = {
  pending: { label: 'Pending', color: '#8A93AD' },
  planning: { label: 'Planning', color: '#4DB8FF' },
  awaiting_approval: { label: 'Awaiting Approval', color: '#F5B642' },
  running: { label: 'Running', color: '#5B7CFF' },
  testing: { label: 'Testing', color: '#B38CFF' },
  completed: { label: 'Completed', color: '#2FD68B' },
  failed: { label: 'Failed', color: '#FF5468' },
  cancelled: { label: 'Cancelled', color: '#6B728A' },
};

const PRIORITY_COLORS: Record<TaskPriority, { label: string; color: string }> = {
  high: { label: 'High', color: '#FF5468' },
  medium: { label: 'Medium', color: '#F5B642' },
  low: { label: 'Low', color: '#4DB8FF' },
};

function formatCountdown(expiresAt: string): string {
  const diff = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
  const mins = Math.floor(diff / 60);
  const secs = diff % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export const AiWorkspacePanel: React.FC<AiWorkspacePanelProps> = ({
  project,
  session,
  activeTask,
  chatMessages,
  agentBusy,
  chatBusy,
  draftTaskPrompt,
  onDraftTaskPromptChange,
  onStartTask,
  onDecideApproval,
  onRollbackTask,
  onSendChat,
  onInspectDiff,
  onOpenFileAtLine,
  onOpenLlmSettings,
}) => {
  const safeMessages = Array.isArray(chatMessages) ? chatMessages : [];
  const safeApprovals = Array.isArray(activeTask?.approvals) ? activeTask.approvals : [];
  const safeSteps = Array.isArray(activeTask?.steps) ? activeTask.steps : [];
  const safeChanges = Array.isArray(activeTask?.changes) ? activeTask.changes : [];
  const llmConfigured = Boolean(session?.llm?.configured);

  const [tab, setTab] = useState<'agent' | 'chat'>('agent');
  const [executionMode, setExecutionMode] = useState<'approval' | 'strict_sandbox'>('approval');
  const [taskPriority, setTaskPriority] = useState<TaskPriority>('medium');
  const [chatInput, setChatInput] = useState('');
  const [decidingId, setDecidingId] = useState<string | null>(null);
  const [rollingBack, setRollingBack] = useState(false);
  const [, setTick] = useState(0);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const hasPending = safeApprovals.some((a) => a.status === 'pending');
    if (!hasPending) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [safeApprovals]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [safeMessages.length, chatBusy]);

  const handleTaskSubmit = async () => {
    const trimmed = draftTaskPrompt.trim();
    if (!trimmed || agentBusy) return;
    const title = trimmed.length > 64 ? `${trimmed.slice(0, 61)}...` : trimmed;
    await onStartTask(title, trimmed, executionMode, taskPriority);
  };

  const handleChatSubmit = async () => {
    const trimmed = chatInput.trim();
    if (!trimmed || chatBusy) return;
    setChatInput('');
    await onSendChat(trimmed);
  };

  const handleApproval = async (approvalId: string, decision: 'approve' | 'reject') => {
    setDecidingId(approvalId);
    try {
      await onDecideApproval(approvalId, decision);
    } finally {
      setDecidingId(null);
    }
  };

  const handleRollback = async (taskId: string) => {
    setRollingBack(true);
    try {
      await onRollbackTask(taskId);
    } finally {
      setRollingBack(false);
    }
  };

  const pendingApprovals = safeApprovals.filter((a) => a.status === 'pending');

  return (
    <aside className="flex flex-col h-full bg-[#10131C] border-l border-[#1E2433]">
      {/* Mode Switch + Active User BYOK Model */}
      <div className="flex items-center justify-between px-3 h-10 border-b border-[#1E2433] shrink-0 gap-2">
        <div className="flex items-center gap-1 bg-[#090B10] p-0.5 rounded-[6px] border border-[#1E2433]">
          <button
            type="button"
            onClick={() => setTab('agent')}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-[12px] font-medium rounded-[5px] transition-colors whitespace-nowrap ${
              tab === 'agent'
                ? 'bg-[#161A26] text-[#E6E9F2]'
                : 'text-[#A3AABF] hover:text-[#E6E9F2]'
            }`}
          >
            <Bot className="w-3.5 h-3.5 text-[#5B7CFF]" />
            <span>Agent</span>
          </button>
          <button
            type="button"
            onClick={() => setTab('chat')}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-[12px] font-medium rounded-[5px] transition-colors whitespace-nowrap ${
              tab === 'chat'
                ? 'bg-[#161A26] text-[#E6E9F2]'
                : 'text-[#A3AABF] hover:text-[#E6E9F2]'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5 text-[#4DB8FF]" />
            <span>Repo Chat</span>
          </button>
        </div>

        <button
          type="button"
          onClick={onOpenLlmSettings}
          title="Configure your BYOK LLM provider & model"
          className="font-mono text-[11px] text-[#A3AABF] hover:text-[#E6E9F2] truncate max-w-[140px]"
        >
          {llmConfigured ? session.llm.model : 'Connect LLM'}
        </button>
      </div>

      {/* Notice if user entered Sandbox Mode without configuring BYOK LLM */}
      {!llmConfigured && (
        <div className="px-3 py-2.5 bg-[#F5B642]/10 border-b border-[#F5B642]/30 flex items-center justify-between gap-2 text-[12px] shrink-0">
          <div className="flex items-center gap-2 text-[#F5B642] min-w-0">
            <KeyRound className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Connect your LLM API to run AI agent & chat</span>
          </div>
          <button
            type="button"
            onClick={onOpenLlmSettings}
            className="text-[11px] font-semibold text-[#E6E9F2] hover:underline whitespace-nowrap shrink-0"
          >
            Configure
          </button>
        </div>
      )}

      {tab === 'agent' ? (
        <div className="flex-1 flex flex-col min-h-0">
          {/* Task Composer */}
          <div className="p-3 border-b border-[#1E2433] space-y-2.5 shrink-0">
            <label htmlFor="agent-objective" className="block text-[12px] font-medium text-[#E6E9F2]">
              Engineering Objective
            </label>
            <textarea
              id="agent-objective"
              rows={3}
              value={draftTaskPrompt}
              onChange={(e) => onDraftTaskPromptChange(e.target.value)}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                  e.preventDefault();
                  void handleTaskSubmit();
                }
              }}
              placeholder="Describe the bug fix, refactor, or security task (Ctrl+Enter to run)..."
              className="w-full bg-[#090B10] border border-[#262E42] focus:border-[#5B7CFF] rounded-[7px] p-2.5 text-[12px] text-[#E6E9F2] placeholder-[#6B728A] resize-none outline-none leading-relaxed"
            />

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <select
                  aria-label="Execution mode"
                  value={executionMode}
                  onChange={(e) => setExecutionMode(e.target.value as 'approval' | 'strict_sandbox')}
                  className="bg-[#090B10] border border-[#262E42] text-[#A3AABF] text-[11px] rounded-[6px] px-2 py-1.5 outline-none"
                >
                  <option value="approval">Approval</option>
                  <option value="strict_sandbox">Sandbox</option>
                </select>

                <select
                  aria-label="Task priority"
                  value={taskPriority}
                  onChange={(e) => setTaskPriority(e.target.value as TaskPriority)}
                  className="bg-[#090B10] border border-[#262E42] text-[#E6E9F2] text-[11px] rounded-[6px] px-2 py-1.5 outline-none"
                >
                  <option value="high">High Priority</option>
                  <option value="medium">Medium Priority</option>
                  <option value="low">Low Priority</option>
                </select>
              </div>

              <button
                type="button"
                onClick={() => void handleTaskSubmit()}
                disabled={agentBusy || !draftTaskPrompt.trim()}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold bg-[#5B7CFF] hover:bg-[#7C96FF] disabled:opacity-50 text-[#090B10] rounded-[6px] transition-colors whitespace-nowrap"
              >
                <Play className="w-3.5 h-3.5" />
                <span>{agentBusy ? 'Running...' : 'Run Task'}</span>
              </button>
            </div>

            <div className="flex flex-wrap gap-1.5 pt-0.5">
              <button
                type="button"
                onClick={() =>
                  onDraftTaskPromptChange(
                    project.id === 'proj-sentinel-auth'
                      ? 'Analyze the entire authentication project, identify all security vulnerabilities and failing auth bugs (alg: none, timing comparison, exp=0, unsalted SHA-1, case-insensitive bearer header, token revocation, SQL interpolation, token logging), fix them, and verify all tests pass in the sandbox.'
                      : 'Analyze tokenLedger.ts, fix the micro-dollar rounding precision bug and implement the 80% warning and 100% blocking budget guards so all unit tests pass in the sandbox.'
                  )
                }
                className="text-[11px] text-[#7C96FF] hover:text-[#E6E9F2] underline underline-offset-2 text-left"
              >
                Load End-to-End Security & Test Fix Prompt
              </button>
            </div>
          </div>

          {/* Active Task Stream & Approval Checkpoint */}
          <div className="flex-1 overflow-y-auto p-3 space-y-4">
            {agentBusy && (
              <div className="p-3 rounded-[10px] bg-[#161A26] border border-[#262E42] space-y-2">
                <div className="text-[12px] text-[#4DB8FF] font-medium">
                  Querying {session.llm.provider}/{session.llm.model} & synthesizing patches
                  <span className="streaming-cursor" />
                </div>
                <div className="h-2 rounded skeleton-shimmer" />
                <div className="h-2 w-3/4 rounded skeleton-shimmer" />
              </div>
            )}

            {!activeTask && !agentBusy && (
              <div className="py-10 px-4 text-center space-y-2">
                <Lock className="w-6 h-6 mx-auto text-[#2B3347]" />
                <p className="text-[13px] font-medium text-[#E6E9F2]">
                  Permission-Controlled Autonomous Agent
                </p>
                <p className="text-[12px] text-[#6B728A] leading-relaxed">
                  Powered by your connected LLM API. Every proposed workspace edit pauses at an
                  approval checkpoint with unified diffs, rollback snapshots, and real sandbox V8
                  test verification.
                </p>
              </div>
            )}

            {activeTask && (
              <div className="space-y-4">
                <div className="pb-3 border-b border-[#1E2433] space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span
                        className="text-[12px] font-semibold"
                        style={{ color: STATUS_META[activeTask.status]?.color ?? '#A3AABF' }}
                      >
                        {STATUS_META[activeTask.status]?.label ?? activeTask.status}
                      </span>
                      <span className="text-[#6B728A]" aria-hidden="true">·</span>
                      <span
                        className="inline-flex items-center gap-1 font-mono text-[10px] font-semibold uppercase"
                        style={{
                          color: PRIORITY_COLORS[activeTask.priority ?? 'medium']?.color ?? '#F5B642',
                        }}
                      >
                        <span
                          className="w-1.5 h-1.5 rounded-full"
                          style={{
                            backgroundColor:
                              PRIORITY_COLORS[activeTask.priority ?? 'medium']?.color ?? '#F5B642',
                          }}
                        />
                        {PRIORITY_COLORS[activeTask.priority ?? 'medium']?.label ?? 'Medium'}
                      </span>
                    </div>
                    <span className="font-mono text-[11px] text-[#6B728A] tabular-nums">
                      actual ${(activeTask.actualCostUsd ?? 0).toFixed(5)}
                    </span>
                  </div>
                  <p className="text-[13px] font-medium text-[#E6E9F2] leading-snug">
                    {activeTask.title}
                  </p>
                  <p className="text-[11px] text-[#A3AABF] font-mono tabular-nums">
                    {activeTask.modelProvider}/{activeTask.modelName} ·{' '}
                    {((activeTask.promptTokens ?? 0) + (activeTask.completionTokens ?? 0)).toLocaleString()} tok
                  </p>
                </div>

                {/* Pulsing Approval Checkpoint */}
                {pendingApprovals.map((apr) => (
                  <div
                    key={apr.id}
                    className="approval-card-pulse p-3.5 rounded-[10px] bg-[#161A26] border border-[#F5B642]/60 space-y-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 text-[#F5B642] font-semibold text-[12px]">
                        <ShieldAlert className="w-4 h-4 shrink-0" />
                        <span>Approval Checkpoint Required</span>
                      </div>
                      <span className="flex items-center gap-1 font-mono text-[11px] text-[#F5B642] tabular-nums shrink-0">
                        <Clock className="w-3 h-3" />
                        {formatCountdown(apr.expiresAt)}
                      </span>
                    </div>

                    <p className="text-[12px] text-[#E6E9F2] leading-relaxed">{apr.summary}</p>

                    <div className="space-y-1">
                      <div className="text-[11px] text-[#6B728A] font-medium">
                        Staged file patches (click to inspect diff):
                      </div>
                      {safeChanges.map((chg) => (
                        <button
                          key={chg.id}
                          type="button"
                          onClick={() => onInspectDiff(chg)}
                          className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-[6px] bg-[#090B10] hover:bg-[#1E2433] border border-[#262E42] text-left transition-colors"
                        >
                          <span className="flex items-center gap-2 font-mono text-[12px] text-[#7C96FF] truncate">
                            <FileDiff className="w-3.5 h-3.5 shrink-0" />
                            {chg.filePath}
                          </span>
                          <span className="text-[11px] text-[#A3AABF] shrink-0">Review</span>
                        </button>
                      ))}
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => void handleApproval(apr.id, 'approve')}
                        disabled={decidingId === apr.id}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-[12px] font-semibold bg-[#2FD68B] hover:bg-[#49e39e] disabled:opacity-60 text-[#090B10] rounded-[6px] transition-colors whitespace-nowrap"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>{decidingId === apr.id ? 'Verifying...' : 'Approve & Run Tests'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleApproval(apr.id, 'reject')}
                        disabled={decidingId === apr.id}
                        className="px-3 py-2 text-[12px] font-medium bg-[#090B10] hover:bg-[#FF5468]/20 text-[#FF5468] border border-[#FF5468]/40 rounded-[6px] transition-colors whitespace-nowrap"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                ))}

                {/* Execution Steps */}
                <div className="space-y-2">
                  <h3 className="text-[12px] font-semibold text-[#A3AABF]">Execution Steps</h3>
                  <div className="space-y-2">
                    {safeSteps.map((step) => (
                      <div
                        key={step.id}
                        className="p-2.5 rounded-[8px] bg-[#0B0E14] border border-[#1E2433] space-y-1"
                      >
                        <div className="flex items-center justify-between gap-2 text-[12px]">
                          <span className="font-medium text-[#E6E9F2]">
                            {step.stepNumber}. {step.action}
                          </span>
                          <span className="font-mono text-[11px] text-[#6B728A] tabular-nums shrink-0">
                            {step.agentType}
                            {step.durationMs ? ` · ${step.durationMs}ms` : ''}
                          </span>
                        </div>
                        <p className="text-[11px] text-[#A3AABF] leading-relaxed">
                          {step.outputSummary}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Applied Patch List */}
                {pendingApprovals.length === 0 && safeChanges.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h3 className="text-[12px] font-semibold text-[#A3AABF]">File Changes</h3>
                      {activeTask.rollbackSnapshot && !activeTask.rollbackSnapshot.restored && (
                        <button
                          type="button"
                          onClick={() => void handleRollback(activeTask.id)}
                          disabled={rollingBack}
                          className="flex items-center gap-1 text-[11px] text-[#F5B642] hover:underline whitespace-nowrap"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>{rollingBack ? 'Rolling back...' : 'Rollback Snapshot'}</span>
                        </button>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      {safeChanges.map((chg) => (
                        <button
                          key={chg.id}
                          type="button"
                          onClick={() => onInspectDiff(chg)}
                          className="w-full flex items-center justify-between px-2.5 py-2 rounded-[6px] bg-[#0B0E14] hover:bg-[#161A26] border border-[#1E2433] text-left"
                        >
                          <span className="font-mono text-[12px] text-[#7C96FF] truncate">
                            {chg.filePath}
                          </span>
                          <span className="text-[11px] text-[#A3AABF] shrink-0">{chg.status}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Final Report */}
                {activeTask.finalReport && activeTask.status !== 'awaiting_approval' && (
                  <div
                    className={`p-3 rounded-[10px] border space-y-2 ${
                      activeTask.finalReport.verificationPassed
                        ? 'bg-[#2FD68B]/10 border-[#2FD68B]/35'
                        : 'bg-[#FF5468]/10 border-[#FF5468]/35'
                    }`}
                  >
                    <div className="flex items-center gap-2 text-[12px] font-semibold text-[#E6E9F2]">
                      {activeTask.finalReport.verificationPassed ? (
                        <CheckCircle2 className="w-4 h-4 text-[#2FD68B]" />
                      ) : (
                        <XCircle className="w-4 h-4 text-[#FF5468]" />
                      )}
                      <span>
                        {activeTask.finalReport.verificationPassed
                          ? 'Verified Engineering Report'
                          : 'Verification Gate Failed'}
                      </span>
                    </div>
                    <p className="text-[12px] text-[#E6E9F2] leading-relaxed">
                      {activeTask.finalReport.summary}
                    </p>
                  </div>
                )}

                {activeTask.errorMessage && !activeTask.finalReport && (
                  <div className="p-3 rounded-[8px] bg-[#FF5468]/10 border border-[#FF5468]/40 text-[12px] text-[#FF5468] flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{activeTask.errorMessage}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Repository-Aware RAG Chat */
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {safeMessages.length === 0 && (
              <div className="py-8 px-3 space-y-3">
                <p className="text-[13px] font-medium text-[#E6E9F2]">
                  Repository-Aware Engineering Chat
                </p>
                <p className="text-[12px] text-[#A3AABF] leading-relaxed">
                  Ask questions grounded in <span className="font-mono text-[#E6E9F2]">{project.name}</span>.
                  Responses route through your connected BYOK LLM with clickable file:line citations.
                </p>
                <div className="space-y-1.5 pt-2">
                  {[
                    'Explain the architecture and authentication request flow.',
                    'Why are lowercase bearer tokens returning 401?',
                    'List the critical security vulnerabilities in this repository.',
                  ].map((sample) => (
                    <button
                      key={sample}
                      type="button"
                      onClick={() => void onSendChat(sample)}
                      className="block w-full text-left px-3 py-2 rounded-[6px] bg-[#0B0E14] hover:bg-[#161A26] border border-[#1E2433] text-[12px] text-[#A3AABF] hover:text-[#E6E9F2] transition-colors"
                    >
                      {sample}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {safeMessages.map((msg) => (
              <div
                key={msg.id}
                className={`p-3 rounded-[10px] text-[12px] leading-relaxed space-y-2 ${
                  msg.role === 'user'
                    ? 'bg-[#161A26] text-[#E6E9F2] ml-6 border border-[#2B3347]'
                    : 'bg-[#0B0E14] text-[#E6E9F2] border border-[#1E2433]'
                }`}
              >
                <div className="whitespace-pre-wrap">{msg.content}</div>

                {Array.isArray(msg.citations) && msg.citations.length > 0 && (
                  <div className="pt-2 border-t border-[#1E2433] space-y-1">
                    <div className="text-[11px] text-[#6B728A]">Evidence citations:</div>
                    <div className="flex flex-wrap gap-2">
                      {msg.citations.map((c, idx) => (
                        <button
                          key={`${c.filePath}:${c.startLine}:${idx}`}
                          type="button"
                          onClick={() => onOpenFileAtLine(c.filePath, c.startLine)}
                          className="font-mono text-[11px] text-[#7C96FF] hover:underline"
                        >
                          {c.filePath}:{c.startLine}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {msg.role === 'assistant' && (
                  <div className="flex items-center justify-between text-[11px] text-[#6B728A] font-mono tabular-nums pt-1">
                    <span>
                      {(msg.tokensUsed ?? 0).toLocaleString()} tok · ${(msg.costUsd ?? 0).toFixed(5)}
                    </span>
                    {(msg.redactedSecretsCount ?? 0) > 0 && (
                      <span className="text-[#F5B642]">
                        {msg.redactedSecretsCount} secret redacted
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))}

            {chatBusy && (
              <div className="p-3 rounded-[10px] bg-[#0B0E14] border border-[#1E2433] text-[12px] text-[#4DB8FF]">
                Querying {session.llm.provider}/{session.llm.model}
                <span className="streaming-cursor" />
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          <div className="p-3 border-t border-[#1E2433] shrink-0">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void handleChatSubmit();
                  }
                }}
                placeholder="Ask about architecture, bugs, symbols..."
                className="flex-1 bg-[#090B10] border border-[#262E42] focus:border-[#5B7CFF] rounded-[7px] px-3 py-2 text-[12px] text-[#E6E9F2] placeholder-[#6B728A] outline-none"
              />
              <button
                type="button"
                onClick={() => void handleChatSubmit()}
                disabled={chatBusy || !chatInput.trim()}
                aria-label="Send message"
                className="p-2 bg-[#5B7CFF] hover:bg-[#7C96FF] disabled:opacity-50 text-[#090B10] rounded-[7px] transition-colors"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
};
