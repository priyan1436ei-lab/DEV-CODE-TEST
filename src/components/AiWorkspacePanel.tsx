import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Clock,
  FileDiff,
  Lock,
  MessageSquare,
  Play,
  RotateCcw,
  Send,
  ShieldAlert,
  XCircle,
} from 'lucide-react';
import type { AgentTask, ChatMessage, CodeChange, Project, TaskStatus } from '../types/devmind';

interface AiWorkspacePanelProps {
  project: Project;
  activeTask: AgentTask | null;
  chatMessages: ChatMessage[];
  agentBusy: boolean;
  chatBusy: boolean;
  draftTaskPrompt: string;
  onDraftTaskPromptChange: (v: string) => void;
  onStartTask: (title: string, description: string, executionMode: 'approval' | 'strict_sandbox') => Promise<void>;
  onDecideApproval: (approvalId: string, decision: 'approve' | 'reject') => Promise<void>;
  onRollbackTask: (taskId: string) => Promise<void>;
  onSendChat: (message: string) => Promise<void>;
  onInspectDiff: (change: CodeChange) => void;
  onOpenFileAtLine: (filePath: string, line?: number) => void;
}

const STATUS_META: Record<TaskStatus, { label: string; color: string }> = {
  pending: { label: 'Pending', color: '#8A93AD' },
  planning: { label: 'Planning', color: '#4DB8FF' },
  awaiting_approval: { label: 'Awaiting Approval', color: '#F5B84B' },
  running: { label: 'Running', color: '#6C7BFF' },
  testing: { label: 'Testing', color: '#B38CFF' },
  completed: { label: 'Completed', color: '#3DD68C' },
  failed: { label: 'Failed', color: '#FF5C6C' },
  cancelled: { label: 'Cancelled', color: '#6B728A' },
};

function formatCountdown(expiresAt: string): string {
  const diff = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
  const mins = Math.floor(diff / 60);
  const secs = diff % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export const AiWorkspacePanel: React.FC<AiWorkspacePanelProps> = ({
  project,
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
}) => {
  const [tab, setTab] = useState<'agent' | 'chat'>('agent');
  const [executionMode, setExecutionMode] = useState<'approval' | 'strict_sandbox'>('approval');
  const [chatInput, setChatInput] = useState('');
  const [decidingId, setDecidingId] = useState<string | null>(null);
  const [rollingBack, setRollingBack] = useState(false);
  const [, setTick] = useState(0);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  // Refresh pending approval countdown every second
  useEffect(() => {
    const hasPending = activeTask?.approvals.some((a) => a.status === 'pending');
    if (!hasPending) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [activeTask]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages.length, chatBusy]);

  const handleTaskSubmit = async () => {
    const trimmed = draftTaskPrompt.trim();
    if (!trimmed || agentBusy) return;
    const title = trimmed.length > 64 ? `${trimmed.slice(0, 61)}...` : trimmed;
    await onStartTask(title, trimmed, executionMode);
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

  const pendingApprovals = activeTask?.approvals.filter((a) => a.status === 'pending') ?? [];

  return (
    <aside className="flex flex-col h-full bg-[#151821] border-l border-[#262B3A]">
      {/* Top Mode Switch */}
      <div className="flex items-center justify-between px-3 h-10 border-b border-[#262B3A] shrink-0">
        <div className="flex items-center gap-1 bg-[#0D0F14] p-0.5 rounded-[6px] border border-[#262B3A]">
          <button
            onClick={() => setTab('agent')}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-[12px] font-medium rounded-[5px] transition-colors duration-120 whitespace-nowrap ${
              tab === 'agent'
                ? 'bg-[#1C2030] text-[#E6E9F2]'
                : 'text-[#A3AABF] hover:text-[#E6E9F2]'
            }`}
          >
            <Bot className="w-3.5 h-3.5 text-[#6C7BFF]" />
            <span>Autonomous Agent</span>
          </button>
          <button
            onClick={() => setTab('chat')}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-[12px] font-medium rounded-[5px] transition-colors duration-120 whitespace-nowrap ${
              tab === 'chat'
                ? 'bg-[#1C2030] text-[#E6E9F2]'
                : 'text-[#A3AABF] hover:text-[#E6E9F2]'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5 text-[#4DB8FF]" />
            <span>Repo Chat</span>
          </button>
        </div>

        <span className="text-[11px] font-mono text-[#6B728A] whitespace-nowrap">
          gemini-4-hydrogen
        </span>
      </div>

      {tab === 'agent' ? (
        <div className="flex-1 flex flex-col min-h-0">
          {/* Task Composer */}
          <div className="p-3 border-b border-[#262B3A] space-y-2.5 shrink-0">
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
              placeholder="Describe the engineering objective (Ctrl+Enter to run)..."
              className="w-full bg-[#0F1117] border border-[#262B3A] focus:border-[#6C7BFF] rounded-[6px] p-2.5 text-[12px] text-[#E6E9F2] placeholder-[#6B728A] resize-none outline-none leading-relaxed"
            />

            <div className="flex items-center justify-between gap-2">
              <select
                aria-label="Execution mode"
                value={executionMode}
                onChange={(e) => setExecutionMode(e.target.value as 'approval' | 'strict_sandbox')}
                className="bg-[#0F1117] border border-[#262B3A] text-[#A3AABF] text-[11px] rounded-[6px] px-2 py-1.5 outline-none"
              >
                <option value="approval">Approval Checkpoint (Recommended)</option>
                <option value="strict_sandbox">Policy-Gated Sandbox</option>
              </select>

              <button
                onClick={() => void handleTaskSubmit()}
                disabled={agentBusy || !draftTaskPrompt.trim()}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold bg-[#6C7BFF] hover:bg-[#8793FF] disabled:opacity-50 text-[#0D0F14] rounded-[6px] transition-colors duration-120 whitespace-nowrap"
              >
                <Play className="w-3.5 h-3.5" />
                <span>{agentBusy ? 'Running Agent...' : 'Run Task'}</span>
              </button>
            </div>

            {/* Quick Milestone Preset */}
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
                className="text-[11px] text-[#8793FF] hover:text-[#E6E9F2] underline underline-offset-2 text-left"
              >
                Load Milestone End-to-End Task
              </button>
            </div>
          </div>

          {/* Active Task Stream & Approval Checkpoint */}
          <div className="flex-1 overflow-y-auto p-3 space-y-4">
            {agentBusy && (
              <div className="p-3 rounded-[10px] bg-[#1C2030] border border-[#262B3A] space-y-2">
                <div className="flex items-center justify-between text-[12px]">
                  <span className="text-[#4DB8FF] font-medium">
                    Planning, indexing & synthesizing patches
                    <span className="streaming-cursor" />
                  </span>
                </div>
                <div className="h-2 rounded skeleton-shimmer" />
                <div className="h-2 w-3/4 rounded skeleton-shimmer" />
              </div>
            )}

            {!activeTask && !agentBusy && (
              <div className="py-10 px-4 text-center space-y-2">
                <Lock className="w-6 h-6 mx-auto text-[#353B50]" />
                <p className="text-[13px] font-medium text-[#E6E9F2]">
                  Permission-Controlled Autonomous Agent
                </p>
                <p className="text-[12px] text-[#6B728A] leading-relaxed">
                  Every proposed workspace edit pauses at an approval checkpoint with unified diffs,
                  automatic rollback snapshots, and real sandbox test verification.
                </p>
              </div>
            )}

            {activeTask && (
              <div className="space-y-4">
                {/* Task Summary Header */}
                <div className="pb-3 border-b border-[#262B3A] space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className="text-[12px] font-semibold"
                      style={{ color: STATUS_META[activeTask.status].color }}
                    >
                      {STATUS_META[activeTask.status].label}
                    </span>
                    <span className="font-mono text-[11px] text-[#6B728A] tabular-nums">
                      est ${activeTask.estimatedCostUsd.toFixed(5)} · actual ${activeTask.actualCostUsd.toFixed(5)}
                    </span>
                  </div>
                  <p className="text-[13px] font-medium text-[#E6E9F2] leading-snug">
                    {activeTask.title}
                  </p>
                  <p className="text-[11px] text-[#A3AABF] font-mono tabular-nums">
                    {(activeTask.promptTokens + activeTask.completionTokens).toLocaleString()} tokens · retries {activeTask.retryCount}/{activeTask.maxRetries}
                  </p>
                </div>

                {/* Pulsing Pending Approval Checkpoint (Section 5 & Section 10) */}
                {pendingApprovals.map((apr) => (
                  <div
                    key={apr.id}
                    className="approval-card-pulse p-3.5 rounded-[10px] bg-[#1C2030] border border-[#F5B84B]/60 space-y-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 text-[#F5B84B] font-semibold text-[12px]">
                        <ShieldAlert className="w-4 h-4 shrink-0" />
                        <span>Approval Checkpoint Required</span>
                      </div>
                      <span className="flex items-center gap-1 font-mono text-[11px] text-[#F5B84B] tabular-nums shrink-0">
                        <Clock className="w-3 h-3" />
                        {formatCountdown(apr.expiresAt)}
                      </span>
                    </div>

                    <p className="text-[12px] text-[#E6E9F2] leading-relaxed">{apr.summary}</p>

                    <div className="space-y-1">
                      <div className="text-[11px] text-[#6B728A] font-medium">
                        Staged file patches (click to review unified diff):
                      </div>
                      {activeTask.changes.map((chg) => (
                        <button
                          key={chg.id}
                          onClick={() => onInspectDiff(chg)}
                          className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-[6px] bg-[#0F1117] hover:bg-[#262B3A]/70 border border-[#262B3A] text-left transition-colors duration-120"
                        >
                          <span className="flex items-center gap-2 font-mono text-[12px] text-[#8793FF] truncate">
                            <FileDiff className="w-3.5 h-3.5 shrink-0" />
                            {chg.filePath}
                          </span>
                          <span className="text-[11px] text-[#A3AABF] shrink-0">Inspect diff</span>
                        </button>
                      ))}
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <button
                        onClick={() => void handleApproval(apr.id, 'approve')}
                        disabled={decidingId === apr.id}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-[12px] font-semibold bg-[#3DD68C] hover:bg-[#5ae09f] disabled:opacity-60 text-[#0D0F14] rounded-[6px] transition-colors duration-120 whitespace-nowrap"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>{decidingId === apr.id ? 'Verifying in Sandbox...' : 'Approve & Run Tests'}</span>
                      </button>
                      <button
                        onClick={() => void handleApproval(apr.id, 'reject')}
                        disabled={decidingId === apr.id}
                        className="px-3 py-2 text-[12px] font-medium bg-[#151821] hover:bg-[#FF5C6C]/20 text-[#FF5C6C] border border-[#FF5C6C]/40 rounded-[6px] transition-colors duration-120 whitespace-nowrap"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                ))}

                {/* Execution Step Graph */}
                <div className="space-y-2">
                  <h3 className="text-[12px] font-semibold text-[#A3AABF]">Execution Steps</h3>
                  <div className="space-y-2">
                    {activeTask.steps.map((step) => (
                      <div
                        key={step.id}
                        className="p-2.5 rounded-[8px] bg-[#0F1117] border border-[#262B3A] space-y-1 transition-colors duration-250"
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

                {/* Proposed / Applied Patch List (post-decision) */}
                {pendingApprovals.length === 0 && activeTask.changes.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h3 className="text-[12px] font-semibold text-[#A3AABF]">File Changes</h3>
                      {activeTask.rollbackSnapshot && !activeTask.rollbackSnapshot.restored && (
                        <button
                          onClick={() => void handleRollback(activeTask.id)}
                          disabled={rollingBack}
                          className="flex items-center gap-1 text-[11px] text-[#F5B84B] hover:underline whitespace-nowrap"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>{rollingBack ? 'Rolling back...' : 'Rollback Snapshot'}</span>
                        </button>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      {activeTask.changes.map((chg) => (
                        <button
                          key={chg.id}
                          onClick={() => onInspectDiff(chg)}
                          className="w-full flex items-center justify-between px-2.5 py-2 rounded-[6px] bg-[#0F1117] hover:bg-[#1C2030] border border-[#262B3A] text-left"
                        >
                          <span className="font-mono text-[12px] text-[#8793FF] truncate">
                            {chg.filePath}
                          </span>
                          <span className="text-[11px] text-[#A3AABF] shrink-0">{chg.status}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Verified Final Engineering Report */}
                {activeTask.finalReport && activeTask.status !== 'awaiting_approval' && (
                  <div
                    className={`p-3 rounded-[10px] border space-y-2 ${
                      activeTask.finalReport.verificationPassed
                        ? 'bg-[#3DD68C]/10 border-[#3DD68C]/35'
                        : 'bg-[#FF5C6C]/10 border-[#FF5C6C]/35'
                    }`}
                  >
                    <div className="flex items-center gap-2 text-[12px] font-semibold text-[#E6E9F2]">
                      {activeTask.finalReport.verificationPassed ? (
                        <CheckCircle2 className="w-4 h-4 text-[#3DD68C]" />
                      ) : (
                        <XCircle className="w-4 h-4 text-[#FF5C6C]" />
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
                    {activeTask.finalReport.rootCauses.length > 0 && (
                      <div className="text-[11px] text-[#A3AABF] space-y-0.5">
                        <div className="font-semibold text-[#E6E9F2]">Root Causes Addressed:</div>
                        {activeTask.finalReport.rootCauses.map((rc, i) => (
                          <div key={i}>• {rc}</div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {activeTask.errorMessage && !activeTask.finalReport && (
                  <div className="p-3 rounded-[8px] bg-[#FF5C6C]/10 border border-[#FF5C6C]/40 text-[12px] text-[#FF5C6C] flex items-start gap-2">
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
            {chatMessages.length === 0 && (
              <div className="py-8 px-3 space-y-3">
                <p className="text-[13px] font-medium text-[#E6E9F2]">
                  Repository-Aware Engineering Chat
                </p>
                <p className="text-[12px] text-[#A3AABF] leading-relaxed">
                  Ask questions grounded in <span className="font-mono text-[#E6E9F2]">{project.name}</span>.
                  Answers include clickable file and line citations. Secrets are redacted before model calls.
                </p>
                <div className="space-y-1.5 pt-2">
                  {[
                    'Explain the architecture and authentication request flow.',
                    'Why are valid lowercase bearer tokens returning 401?',
                    'Which files contain critical security vulnerabilities?',
                  ].map((sample) => (
                    <button
                      key={sample}
                      onClick={() => void onSendChat(sample)}
                      className="block w-full text-left px-3 py-2 rounded-[6px] bg-[#0F1117] hover:bg-[#1C2030] border border-[#262B3A] text-[12px] text-[#A3AABF] hover:text-[#E6E9F2] transition-colors duration-120"
                    >
                      {sample}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {chatMessages.map((msg) => (
              <div
                key={msg.id}
                className={`p-3 rounded-[10px] text-[12px] leading-relaxed space-y-2 ${
                  msg.role === 'user'
                    ? 'bg-[#1C2030] text-[#E6E9F2] ml-6 border border-[#353B50]'
                    : 'bg-[#0F1117] text-[#E6E9F2] border border-[#262B3A]'
                }`}
              >
                <div className="whitespace-pre-wrap">{msg.content}</div>

                {msg.citations && msg.citations.length > 0 && (
                  <div className="pt-2 border-t border-[#262B3A] space-y-1">
                    <div className="text-[11px] text-[#6B728A]">Evidence citations:</div>
                    <div className="flex flex-wrap gap-2">
                      {msg.citations.map((c, idx) => (
                        <button
                          key={`${c.filePath}:${c.startLine}:${idx}`}
                          onClick={() => onOpenFileAtLine(c.filePath, c.startLine)}
                          className="font-mono text-[11px] text-[#8793FF] hover:underline"
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
                      {msg.tokensUsed?.toLocaleString() ?? 0} tok · ${(msg.costUsd ?? 0).toFixed(5)}
                    </span>
                    {(msg.redactedSecretsCount ?? 0) > 0 && (
                      <span className="text-[#F5B84B]">
                        {msg.redactedSecretsCount} secret redacted
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))}

            {chatBusy && (
              <div className="p-3 rounded-[10px] bg-[#0F1117] border border-[#262B3A] text-[12px] text-[#4DB8FF]">
                Retrieving repo context & generating cited answer
                <span className="streaming-cursor" />
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          <div className="p-3 border-t border-[#262B3A] shrink-0">
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
                className="flex-1 bg-[#0F1117] border border-[#262B3A] focus:border-[#6C7BFF] rounded-[6px] px-3 py-2 text-[12px] text-[#E6E9F2] placeholder-[#6B728A] outline-none"
              />
              <button
                onClick={() => void handleChatSubmit()}
                disabled={chatBusy || !chatInput.trim()}
                aria-label="Send message"
                className="p-2 bg-[#6C7BFF] hover:bg-[#8793FF] disabled:opacity-50 text-[#0D0F14] rounded-[6px] transition-colors duration-120"
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
