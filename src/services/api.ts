import type {
  AgentTask,
  AuditLogEntry,
  ChatMessage,
  DebugAnalysis,
  PermissionLevel,
  PermissionPolicyRule,
  Project,
  SearchHit,
  SecurityFinding,
  TestRun,
  UsageLedger,
} from '../types/devmind';

export interface ProviderInfo {
  id: string;
  name: string;
  status: 'active' | 'configured_adapter';
  models: Array<{
    id: string;
    tier: 'fast' | 'deep';
    contextWindow: string;
    inputPerMillionUsd: number;
    outputPerMillionUsd: number;
    toolCalling: boolean;
  }>;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(payload?.error || `Request failed (${res.status})`);
  }
  return payload as T;
}

export const devmindApi = {
  listProjects: () => request<{ projects: Project[] }>('/api/v1/projects'),

  createProject: (body: {
    name: string;
    description?: string;
    localPath?: string;
    files: Array<{ path: string; content: string }>;
  }) => request<{ project: Project }>('/api/v1/projects', { method: 'POST', body: JSON.stringify(body) }),

  reindexProject: (projectId: string) =>
    request<{ project: Project }>(`/api/v1/projects/${projectId}/index`, { method: 'POST' }),

  saveFile: (projectId: string, path: string, content: string) =>
    request<{ project: Project }>(`/api/v1/projects/${projectId}/files`, {
      method: 'PUT',
      body: JSON.stringify({ path, content }),
    }),

  searchRepo: (projectId: string, query: string) =>
    request<{ hits: SearchHit[] }>(`/api/v1/projects/${projectId}/search`, {
      method: 'POST',
      body: JSON.stringify({ query }),
    }),

  getSecurityFindings: (projectId: string) =>
    request<{ findings: SecurityFinding[] }>(`/api/v1/projects/${projectId}/security`),

  getTestRuns: (projectId: string) =>
    request<{ testRuns: TestRun[] }>(`/api/v1/projects/${projectId}/tests`),

  runSandboxTests: (projectId: string) =>
    request<{ testRun: TestRun }>(`/api/v1/projects/${projectId}/tests/run`, { method: 'POST' }),

  getChatHistory: (projectId: string) =>
    request<{ messages: ChatMessage[] }>(`/api/v1/projects/${projectId}/chat`),

  sendChatMessage: (projectId: string, message: string) =>
    request<{ reply: ChatMessage; messages: ChatMessage[] }>(`/api/v1/projects/${projectId}/chat`, {
      method: 'POST',
      body: JSON.stringify({ message }),
    }),

  getDebugAnalyses: (projectId: string) =>
    request<{ analyses: DebugAnalysis[] }>(`/api/v1/projects/${projectId}/debug`),

  runDebugAnalysis: (projectId: string, errorLog: string) =>
    request<{ analysis: DebugAnalysis }>(`/api/v1/projects/${projectId}/debug`, {
      method: 'POST',
      body: JSON.stringify({ errorLog }),
    }),

  listTasks: (projectId?: string) =>
    request<{ tasks: AgentTask[] }>(
      projectId ? `/api/v1/agent/tasks?projectId=${encodeURIComponent(projectId)}` : '/api/v1/agent/tasks'
    ),

  createAgentTask: (body: {
    projectId: string;
    title: string;
    description: string;
    executionMode?: 'approval' | 'strict_sandbox';
  }) =>
    request<{ task: AgentTask; project: Project }>('/api/v1/agent/tasks', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  decideApproval: (approvalId: string, decision: 'approve' | 'reject') =>
    request<{ task: AgentTask; project: Project; securityFindings: SecurityFinding[] }>(
      `/api/v1/approvals/${approvalId}/decision`,
      { method: 'POST', body: JSON.stringify({ decision }) }
    ),

  rollbackTask: (taskId: string) =>
    request<{ task: AgentTask; project: Project; securityFindings: SecurityFinding[] }>(
      `/api/v1/agent/tasks/${taskId}/rollback`,
      { method: 'POST' }
    ),

  cancelTask: (taskId: string) =>
    request<{ task: AgentTask }>(`/api/v1/agent/tasks/${taskId}/cancel`, { method: 'POST' }),

  getPolicies: () => request<{ policies: PermissionPolicyRule[]; providers: ProviderInfo[] }>('/api/v1/policies'),

  updatePolicy: (actionType: string, level: PermissionLevel) =>
    request<{ policies: PermissionPolicyRule[] }>(`/api/v1/policies/${actionType}`, {
      method: 'PUT',
      body: JSON.stringify({ level }),
    }),

  getUsage: () => request<{ usage: UsageLedger; providers: ProviderInfo[] }>('/api/v1/billing/usage'),

  updateBudget: (monthlyBudgetUsd: number, monthlyTokenLimit: number) =>
    request<{ usage: UsageLedger }>('/api/v1/billing/budget', {
      method: 'PUT',
      body: JSON.stringify({ monthlyBudgetUsd, monthlyTokenLimit }),
    }),

  getAuditLogs: () => request<{ auditLogs: AuditLogEntry[] }>('/api/v1/audit'),
};
