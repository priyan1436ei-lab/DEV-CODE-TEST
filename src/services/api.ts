import type {
  AgentTask,
  AuditLogEntry,
  ChatMessage,
  DebugAnalysis,
  ExtensionHostSnapshot,
  LlmProviderId,
  PermissionLevel,
  PermissionPolicyRule,
  Project,
  PublicUserSession,
  SearchHit,
  SecurityFinding,
  TaskPriority,
  UsageLedger,
} from '../types/devmind';

export interface ProviderPreset {
  id: LlmProviderId;
  name: string;
  protocol: 'openai_compatible' | 'anthropic';
  defaultBaseUrl: string;
  defaultModel: string;
  requiresKey: boolean;
  suggestedModels: string[];
  inputPerMillionUsd: number;
  outputPerMillionUsd: number;
}

let memorySessionToken: string | null = null;

export function getStoredSessionToken(): string | null {
  return memorySessionToken;
}

export function setStoredSessionToken(token: string | null): void {
  memorySessionToken = token;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const token = getStoredSessionToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init?.headers ? (init.headers as Record<string, string>) : {}),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(url, {
    ...init,
    headers,
  });

  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error(`Unexpected non-JSON response from ${url} (HTTP ${res.status}).`);
  }

  const payload = await res.json();
  if (!res.ok) {
    throw new Error(payload?.error || `Request failed (${res.status})`);
  }
  return payload as T;
}

export const devmindApi = {
  getPresets: () => request<{ presets: ProviderPreset[] }>('/api/v1/providers'),

  testLlmConnection: (body: {
    provider: LlmProviderId;
    baseUrl: string;
    model: string;
    apiKey: string;
  }) =>
    request<{ ok: boolean; latencyMs: number; model: string; replyPreview: string }>(
      '/api/v1/auth/test-llm',
      { method: 'POST', body: JSON.stringify(body) }
    ),

  login: (body: {
    displayName: string;
    email: string;
    provider: LlmProviderId;
    baseUrl: string;
    model: string;
    apiKey: string;
    localWorkspaceOnly?: boolean;
  }) =>
    request<{ token: string; session: PublicUserSession }>('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  getSession: () => request<{ session: PublicUserSession }>('/api/v1/auth/session'),

  updateLlmConfig: (body: {
    provider: LlmProviderId;
    baseUrl: string;
    model: string;
    apiKey: string;
  }) =>
    request<{ session: PublicUserSession }>('/api/v1/auth/llm-config', {
      method: 'PUT',
      body: JSON.stringify(body),
    }),

  logout: () => request<{ ok: boolean }>('/api/v1/auth/logout', { method: 'POST' }),

  listProjects: () => request<{ projects: Project[] }>('/api/v1/projects'),

  createProject: (body: {
    name: string;
    description?: string;
    localPath?: string;
    files: Array<{ path: string; content: string }>;
  }) => request<{ project: Project }>('/api/v1/projects', { method: 'POST', body: JSON.stringify(body) }),

  deleteProject: (projectId: string) =>
    request<{ ok: boolean; projects: Project[] }>(`/api/v1/projects/${projectId}`, {
      method: 'DELETE',
    }),

  reindexProject: (projectId: string) =>
    request<{ project: Project }>(`/api/v1/projects/${projectId}/index`, { method: 'POST' }),

  saveFile: (projectId: string, path: string, content: string) =>
    request<{ project: Project }>(`/api/v1/projects/${projectId}/files`, {
      method: 'PUT',
      body: JSON.stringify({ path, content }),
    }),

  deleteFile: (projectId: string, path: string) =>
    request<{ project: Project }>(`/api/v1/projects/${projectId}/files`, {
      method: 'DELETE',
      body: JSON.stringify({ path }),
    }),

  searchRepo: (projectId: string, query: string) =>
    request<{ hits: SearchHit[] }>(`/api/v1/projects/${projectId}/search`, {
      method: 'POST',
      body: JSON.stringify({ query }),
    }),

  getSecurityFindings: (projectId: string) =>
    request<{ findings: SecurityFinding[] }>(`/api/v1/projects/${projectId}/security`),

  // Extensions Marketplace & Runtime Host
  getExtensionsHost: (projectId?: string) =>
    request<{ host: ExtensionHostSnapshot }>(
      projectId ? `/api/v1/extensions?projectId=${encodeURIComponent(projectId)}` : '/api/v1/extensions'
    ),

  installExtension: (extensionId: string, projectId?: string) =>
    request<{ installedIds: string[]; host: ExtensionHostSnapshot }>(
      `/api/v1/extensions/${encodeURIComponent(extensionId)}/install`,
      { method: 'POST', body: JSON.stringify({ projectId }) }
    ),

  uninstallExtension: (extensionId: string, cascade = false, projectId?: string) =>
    request<{ uninstalledIds: string[]; host: ExtensionHostSnapshot }>(
      `/api/v1/extensions/${encodeURIComponent(extensionId)}/uninstall`,
      { method: 'POST', body: JSON.stringify({ cascade, projectId }) }
    ),

  toggleExtension: (extensionId: string, enabled: boolean, projectId?: string) =>
    request<{ host: ExtensionHostSnapshot }>(
      `/api/v1/extensions/${encodeURIComponent(extensionId)}/toggle`,
      { method: 'POST', body: JSON.stringify({ enabled, projectId }) }
    ),

  activateExtension: (extensionId: string, projectId?: string) =>
    request<{ host: ExtensionHostSnapshot }>(
      `/api/v1/extensions/${encodeURIComponent(extensionId)}/activate`,
      { method: 'POST', body: JSON.stringify({ projectId }) }
    ),

  executeExtensionCommand: (commandId: string, projectId: string, filePath?: string) =>
    request<{
      ok: boolean;
      extensionId: string;
      commandId: string;
      message: string;
      mutatedFilePath?: string;
      project?: Project;
      host: ExtensionHostSnapshot;
    }>('/api/v1/extensions/commands/execute', {
      method: 'POST',
      body: JSON.stringify({ commandId, projectId, filePath }),
    }),

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
    executionMode?: 'approval' | 'direct';
    priority?: TaskPriority;
  }) =>
    request<{ task: AgentTask; project: Project }>('/api/v1/agent/tasks', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  updateTaskPriority: (taskId: string, priority: TaskPriority) =>
    request<{ task: AgentTask }>(`/api/v1/agent/tasks/${taskId}/priority`, {
      method: 'PATCH',
      body: JSON.stringify({ priority }),
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

  getPolicies: () => request<{ policies: PermissionPolicyRule[]; presets: ProviderPreset[] }>('/api/v1/policies'),

  updatePolicy: (actionType: string, level: PermissionLevel) =>
    request<{ policies: PermissionPolicyRule[] }>(`/api/v1/policies/${actionType}`, {
      method: 'PUT',
      body: JSON.stringify({ level }),
    }),

  getUsage: () => request<{ usage: UsageLedger; presets: ProviderPreset[] }>('/api/v1/billing/usage'),

  updateBudget: (monthlyBudgetUsd: number, monthlyTokenLimit: number) =>
    request<{ usage: UsageLedger }>('/api/v1/billing/budget', {
      method: 'PUT',
      body: JSON.stringify({ monthlyBudgetUsd, monthlyTokenLimit }),
    }),

  getAuditLogs: () => request<{ auditLogs: AuditLogEntry[] }>('/api/v1/audit'),
};
