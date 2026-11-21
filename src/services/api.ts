import type {
  AgentTask,
  AiProvenance,
  AiRoutingMode,
  AuditLogEntry,
  ChatMessage,
  DebugAnalysis,
  ExtensionHostSnapshot,
  LlmProviderId,
  LocalAiConfig,
  LocalProfile,
  OllamaRuntimeStatus,
  PermissionLevel,
  PermissionPolicyRule,
  Project,
  PublicUserSession,
  SearchHit,
  SecurityFinding,
  TaskPriority,
  UsageLedger,
} from '../types/devmind';
import {
  cacheLocalProfiles,
  cacheProjects,
  cacheSingleProject,
  cacheTasks,
  getCachedLocalProfiles,
  getCachedProjectById,
  getCachedProjects,
  getCachedTasks,
  getPendingMutations,
  offlineCache,
  offlineCreateProject,
  offlineDeleteFile,
  offlineFormatFile,
  offlineSaveFile,
  offlineSearchRepo,
  offlineUpdateTaskPriority,
  rebuildProjectIndexLocally,
  removePendingMutation,
  scanOfflineSecurityFindings,
  updatePendingMutation,
} from './offlineStore';

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

function isNetworkFailure(err: unknown): boolean {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true;
  if (err instanceof TypeError) return true;
  const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  return (
    msg.includes('failed to fetch') ||
    msg.includes('networkerror') ||
    msg.includes('network request failed') ||
    msg.includes('load failed') ||
    msg.includes('offline')
  );
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const token = getStoredSessionToken();
  const isClientOffline = typeof navigator !== 'undefined' && !navigator.onLine;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-devmind-network': isClientOffline ? 'offline' : 'online',
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

export async function syncOfflineMutations(options?: {
  force?: boolean;
}): Promise<{ synced: number; remaining: number }> {
  const queue = await getPendingMutations();
  if (queue.length === 0) return { synced: 0, remaining: 0 };

  let synced = 0;
  const now = Date.now();
  const projectIdMap = new Map<string, string>();

  for (const item of queue) {
    if (item.id === undefined) continue;
    if (!options?.force && item.nextRetryAt && item.nextRetryAt > now) {
      continue;
    }

    try {
      if (item.type === 'createProject') {
        const res = await request<{ project: Project }>('/api/v1/projects', {
          method: 'POST',
          body: JSON.stringify(item.body),
        });
        projectIdMap.set(item.tempProjectId, res.project.id);
        await cacheSingleProject(res.project);
        await removePendingMutation(item.id);
        synced += 1;
      } else if (item.type === 'saveFile') {
        const resolvedProjectId = projectIdMap.get(item.projectId) ?? item.projectId;
        const res = await request<{ project: Project }>(
          `/api/v1/projects/${resolvedProjectId}/files`,
          {
            method: 'PUT',
            body: JSON.stringify({ path: item.path, content: item.content }),
          }
        );
        await cacheSingleProject(res.project);
        await removePendingMutation(item.id);
        synced += 1;
      } else if (item.type === 'deleteFile') {
        const resolvedProjectId = projectIdMap.get(item.projectId) ?? item.projectId;
        const res = await request<{ project: Project }>(
          `/api/v1/projects/${resolvedProjectId}/files`,
          {
            method: 'DELETE',
            body: JSON.stringify({ path: item.path }),
          }
        );
        await cacheSingleProject(res.project);
        await removePendingMutation(item.id);
        synced += 1;
      } else if (item.type === 'updateTaskPriority') {
        await request<{ task: AgentTask }>(`/api/v1/agent/tasks/${item.taskId}/priority`, {
          method: 'PATCH',
          body: JSON.stringify({ priority: item.priority }),
        });
        await removePendingMutation(item.id);
        synced += 1;
      }
    } catch (err) {
      const nextRetryCount = (item.retryCount ?? 0) + 1;
      const backoffMs = Math.min(60_000, 1_000 * Math.pow(2, Math.min(10, nextRetryCount)));
      const errMsg = err instanceof Error ? err.message : 'Mutation sync failed';
      if (isNetworkFailure(err) || nextRetryCount <= 5) {
        await updatePendingMutation({
          ...item,
          retryCount: nextRetryCount,
          nextRetryAt: Date.now() + backoffMs,
          lastError: errMsg,
        });
        if (isNetworkFailure(err)) {
          break;
        }
      } else {
        // Drop permanently invalid offline mutations after max retries so queue doesn't stall forever
        await removePendingMutation(item.id);
      }
    }
  }

  const remaining = (await getPendingMutations()).length;
  return { synced, remaining };
}

export const devmindApi = {
  getPresets: async () => {
    try {
      const res = await request<{ presets: ProviderPreset[] }>('/api/v1/providers');
      void offlineCache.savePresets(res.presets);
      return res;
    } catch (err) {
      if (isNetworkFailure(err)) {
        const cached = await offlineCache.getPresets();
        if (cached) return { presets: cached };
      }
      throw err;
    }
  },

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

  login: async (body: {
    displayName: string;
    email: string;
    provider: LlmProviderId;
    baseUrl: string;
    model: string;
    apiKey: string;
    localWorkspaceOnly?: boolean;
  }) => {
    try {
      const res = await request<{ token: string; session: PublicUserSession }>('/api/v1/auth/login', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      void offlineCache.saveSession(res.session);
      return res;
    } catch (err) {
      if (isNetworkFailure(err)) {
        const cachedSession = await offlineCache.getSession();
        const fallbackSession: PublicUserSession = cachedSession ?? {
          sessionId: 'offline_session',
          displayName: body.displayName || 'Developer',
          email: body.email || 'offline@workspace.local',
          llm: {
            provider: body.provider,
            baseUrl: body.baseUrl,
            model: body.model,
            hasApiKey: false,
            maskedKey: '',
            configured: false,
          },
          createdAt: new Date().toISOString(),
        };
        void offlineCache.saveSession(fallbackSession);
        return { token: 'offline_token', session: fallbackSession };
      }
      throw err;
    }
  },

  getSession: async () => {
    try {
      const res = await request<{ session: PublicUserSession }>('/api/v1/auth/session');
      void offlineCache.saveSession(res.session);
      return res;
    } catch (err) {
      if (isNetworkFailure(err)) {
        const cached = await offlineCache.getSession();
        if (cached) return { session: cached };
      }
      throw err;
    }
  },

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

  // Offline-First Local Profiles (works with zero internet/Firebase)
  listLocalProfiles: async () => {
    try {
      const res = await request<{ profiles: LocalProfile[] }>('/api/v1/local-profiles');
      void cacheLocalProfiles(res.profiles);
      return res;
    } catch (err) {
      if (isNetworkFailure(err)) {
        return { profiles: await getCachedLocalProfiles() };
      }
      throw err;
    }
  },

  createLocalProfile: async (body: {
    displayName: string;
    email?: string;
    passcode?: string;
    linkedFirebaseUid?: string;
    linkedFirebaseEmail?: string;
  }) => {
    const res = await request<{
      profile: LocalProfile;
      token: string;
      session: PublicUserSession;
    }>('/api/v1/local-profiles', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    void offlineCache.saveSession(res.session);
    return res;
  },

  unlockLocalProfile: async (profileId: string, passcode?: string) => {
    const res = await request<{
      profile: LocalProfile;
      token: string;
      session: PublicUserSession;
    }>(`/api/v1/local-profiles/${encodeURIComponent(profileId)}/unlock`, {
      method: 'POST',
      body: JSON.stringify({ passcode }),
    });
    void offlineCache.saveSession(res.session);
    return res;
  },

  linkProfileToFirebase: (
    profileId: string,
    firebaseUid: string | null,
    firebaseEmail?: string | null
  ) =>
    request<{ profile: LocalProfile; session: PublicUserSession }>(
      `/api/v1/local-profiles/${encodeURIComponent(profileId)}/link-cloud`,
      {
        method: 'PATCH',
        body: JSON.stringify({ firebaseUid, firebaseEmail }),
      }
    ),

  deleteLocalProfile: (profileId: string) =>
    request<{ ok: boolean; profiles: LocalProfile[] }>(
      `/api/v1/local-profiles/${encodeURIComponent(profileId)}`,
      { method: 'DELETE' }
    ),

  // Local AI (Ollama) Detection & Hybrid AI Routing
  getLocalAiStatus: (host?: string) =>
    request<{ status: OllamaRuntimeStatus }>(
      host ? `/api/v1/ai/local/status?host=${encodeURIComponent(host)}` : '/api/v1/ai/local/status'
    ),

  updateAiRouting: async (body: {
    aiRoutingMode?: AiRoutingMode;
    localAi?: Partial<LocalAiConfig>;
  }) => {
    const res = await request<{ session: PublicUserSession }>('/api/v1/ai/routing', {
      method: 'PUT',
      body: JSON.stringify(body),
    });
    void offlineCache.saveSession(res.session);
    return res;
  },

  listProjects: async () => {
    try {
      const res = await request<{ projects: Project[] }>('/api/v1/projects');
      void cacheProjects(res.projects);
      return res;
    } catch (err) {
      if (isNetworkFailure(err)) {
        const cached = await getCachedProjects();
        return { projects: cached };
      }
      throw err;
    }
  },

  createProject: async (body: {
    name: string;
    description?: string;
    localPath?: string;
    files: Array<{ path: string; content: string }>;
  }) => {
    try {
      const res = await request<{ project: Project }>('/api/v1/projects', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      void cacheSingleProject(res.project);
      return res;
    } catch (err) {
      if (isNetworkFailure(err)) {
        const project = await offlineCreateProject(body);
        return { project };
      }
      throw err;
    }
  },

  deleteProject: (projectId: string) =>
    request<{ ok: boolean; projects: Project[] }>(`/api/v1/projects/${projectId}`, {
      method: 'DELETE',
    }),

  reindexProject: async (projectId: string) => {
    try {
      const res = await request<{ project: Project }>(`/api/v1/projects/${projectId}/index`, {
        method: 'POST',
      });
      void cacheSingleProject(res.project);
      return res;
    } catch (err) {
      if (isNetworkFailure(err)) {
        const existing = await getCachedProjectById(projectId);
        if (existing) {
          const rebuilt = rebuildProjectIndexLocally(existing);
          await cacheSingleProject(rebuilt);
          await offlineCache.saveSecurity(projectId, scanOfflineSecurityFindings(rebuilt));
          return { project: rebuilt };
        }
      }
      throw err;
    }
  },

  saveFile: async (projectId: string, path: string, content: string) => {
    try {
      const res = await request<{ project: Project }>(`/api/v1/projects/${projectId}/files`, {
        method: 'PUT',
        body: JSON.stringify({ path, content }),
      });
      void cacheSingleProject(res.project);
      return res;
    } catch (err) {
      if (isNetworkFailure(err)) {
        const project = await offlineSaveFile(projectId, path, content);
        return { project };
      }
      throw err;
    }
  },

  deleteFile: async (projectId: string, path: string) => {
    try {
      const res = await request<{ project: Project }>(`/api/v1/projects/${projectId}/files`, {
        method: 'DELETE',
        body: JSON.stringify({ path }),
      });
      void cacheSingleProject(res.project);
      return res;
    } catch (err) {
      if (isNetworkFailure(err)) {
        const project = await offlineDeleteFile(projectId, path);
        return { project };
      }
      throw err;
    }
  },

  searchRepo: async (projectId: string, query: string) => {
    try {
      return await request<{ hits: SearchHit[] }>(`/api/v1/projects/${projectId}/search`, {
        method: 'POST',
        body: JSON.stringify({ query }),
      });
    } catch (err) {
      if (isNetworkFailure(err)) {
        const hits = await offlineSearchRepo(projectId, query);
        return { hits };
      }
      throw err;
    }
  },

  getSecurityFindings: async (projectId: string) => {
    try {
      const res = await request<{ findings: SecurityFinding[] }>(
        `/api/v1/projects/${projectId}/security`
      );
      void offlineCache.saveSecurity(projectId, res.findings);
      return res;
    } catch (err) {
      if (isNetworkFailure(err)) {
        const cached = await offlineCache.getSecurity(projectId);
        if (cached) return { findings: cached };
        const proj = await getCachedProjectById(projectId);
        return { findings: proj ? scanOfflineSecurityFindings(proj) : [] };
      }
      throw err;
    }
  },

  // Extensions Marketplace & Runtime Host
  getExtensionsHost: async (projectId?: string) => {
    try {
      const res = await request<{ host: ExtensionHostSnapshot }>(
        projectId
          ? `/api/v1/extensions?projectId=${encodeURIComponent(projectId)}`
          : '/api/v1/extensions'
      );
      void offlineCache.saveExtensionsHost(projectId, res.host);
      return res;
    } catch (err) {
      if (isNetworkFailure(err)) {
        const cached =
          (await offlineCache.getExtensionsHost(projectId)) ??
          (await offlineCache.getExtensionsHost(undefined));
        if (cached) return { host: cached };
      }
      throw err;
    }
  },

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

  executeExtensionCommand: async (commandId: string, projectId: string, filePath?: string) => {
    try {
      const res = await request<{
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
      });
      if (res.project) void cacheSingleProject(res.project);
      void offlineCache.saveExtensionsHost(projectId, res.host);
      return res;
    } catch (err) {
      if (isNetworkFailure(err) && filePath && commandId.toLowerCase().includes('format')) {
        const project = await offlineFormatFile(projectId, filePath);
        const host =
          (await offlineCache.getExtensionsHost(projectId)) ??
          (await offlineCache.getExtensionsHost(undefined));
        if (host) {
          return {
            ok: true,
            extensionId: 'offline-formatter',
            commandId,
            message: `Formatted ${filePath} locally (queued in IndexedDB).`,
            mutatedFilePath: filePath,
            project,
            host,
          };
        }
      }
      throw err;
    }
  },

  getChatHistory: async (projectId: string) => {
    try {
      const res = await request<{ messages: ChatMessage[] }>(`/api/v1/projects/${projectId}/chat`);
      void offlineCache.saveChat(projectId, res.messages);
      return res;
    } catch (err) {
      if (isNetworkFailure(err)) {
        const cached = await offlineCache.getChat(projectId);
        return { messages: cached ?? [] };
      }
      throw err;
    }
  },

  sendChatMessage: (projectId: string, message: string) =>
    request<{ reply: ChatMessage; messages: ChatMessage[] }>(`/api/v1/projects/${projectId}/chat`, {
      method: 'POST',
      body: JSON.stringify({ message }),
    }),

  streamChatMessage: async (
    projectId: string,
    message: string,
    onChunk: (chunk: { token: string; provenance: AiProvenance; modelUsed: string }) => void,
    signal?: AbortSignal
  ): Promise<{ reply: ChatMessage; messages: ChatMessage[] }> => {
    const token = getStoredSessionToken();
    const isClientOffline = typeof navigator !== 'undefined' && !navigator.onLine;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-devmind-network': isClientOffline ? 'offline' : 'online',
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`/api/v1/projects/${projectId}/chat/stream`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ message }),
      signal,
    });

    if (!res.ok || !res.body) {
      throw new Error(`Streaming chat failed (${res.status})`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let finalResult: { reply: ChatMessage; messages: ChatMessage[] } | null = null;

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split('\n\n');
      buffer = blocks.pop() ?? '';

      for (const block of blocks) {
        const line = block.trim();
        if (!line.startsWith('data:')) continue;
        const jsonStr = line.slice(5).trim();
        if (!jsonStr) continue;
        const evt = JSON.parse(jsonStr) as {
          type?: string;
          token?: string;
          provenance?: AiProvenance;
          modelUsed?: string;
          reply?: ChatMessage;
          messages?: ChatMessage[];
          error?: string;
        };
        if (evt.type === 'chunk' && typeof evt.token === 'string') {
          onChunk({
            token: evt.token,
            provenance: evt.provenance ?? 'local-rules',
            modelUsed: evt.modelUsed ?? 'local',
          });
        } else if (evt.type === 'done' && evt.reply && Array.isArray(evt.messages)) {
          finalResult = { reply: evt.reply, messages: evt.messages };
        } else if (evt.type === 'error') {
          throw new Error(evt.error || 'Streaming AI response failed');
        }
      }
    }

    if (!finalResult) {
      throw new Error('AI stream ended before completing response.');
    }
    void offlineCache.saveChat(projectId, finalResult.messages);
    return finalResult;
  },

  getDebugAnalyses: async (projectId: string) => {
    try {
      return await request<{ analyses: DebugAnalysis[] }>(`/api/v1/projects/${projectId}/debug`);
    } catch (err) {
      if (isNetworkFailure(err)) return { analyses: [] };
      throw err;
    }
  },

  runDebugAnalysis: (projectId: string, errorLog: string) =>
    request<{ analysis: DebugAnalysis }>(`/api/v1/projects/${projectId}/debug`, {
      method: 'POST',
      body: JSON.stringify({ errorLog }),
    }),

  listTasks: async (projectId?: string) => {
    try {
      const res = await request<{ tasks: AgentTask[] }>(
        projectId
          ? `/api/v1/agent/tasks?projectId=${encodeURIComponent(projectId)}`
          : '/api/v1/agent/tasks'
      );
      void cacheTasks(res.tasks);
      return res;
    } catch (err) {
      if (isNetworkFailure(err)) {
        const cached = await getCachedTasks(projectId);
        return { tasks: cached };
      }
      throw err;
    }
  },

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

  updateTaskPriority: async (taskId: string, priority: TaskPriority) => {
    try {
      const res = await request<{ task: AgentTask }>(`/api/v1/agent/tasks/${taskId}/priority`, {
        method: 'PATCH',
        body: JSON.stringify({ priority }),
      });
      void cacheTasks([res.task]);
      return res;
    } catch (err) {
      if (isNetworkFailure(err)) {
        const task = await offlineUpdateTaskPriority(taskId, priority);
        return { task };
      }
      throw err;
    }
  },

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

  getPolicies: async () => {
    try {
      const res = await request<{ policies: PermissionPolicyRule[]; presets: ProviderPreset[] }>(
        '/api/v1/policies'
      );
      void offlineCache.savePolicies(res.policies);
      void offlineCache.savePresets(res.presets);
      return res;
    } catch (err) {
      if (isNetworkFailure(err)) {
        const [policies, presets] = await Promise.all([
          offlineCache.getPolicies(),
          offlineCache.getPresets(),
        ]);
        return { policies: policies ?? [], presets: presets ?? [] };
      }
      throw err;
    }
  },

  updatePolicy: (actionType: string, level: PermissionLevel) =>
    request<{ policies: PermissionPolicyRule[] }>(`/api/v1/policies/${actionType}`, {
      method: 'PUT',
      body: JSON.stringify({ level }),
    }),

  getUsage: async () => {
    try {
      const res = await request<{ usage: UsageLedger; presets: ProviderPreset[] }>(
        '/api/v1/billing/usage'
      );
      void offlineCache.saveUsage(res.usage);
      return res;
    } catch (err) {
      if (isNetworkFailure(err)) {
        const [usage, presets] = await Promise.all([
          offlineCache.getUsage(),
          offlineCache.getPresets(),
        ]);
        if (usage) return { usage, presets: presets ?? [] };
      }
      throw err;
    }
  },

  updateBudget: (monthlyBudgetUsd: number, monthlyTokenLimit: number) =>
    request<{ usage: UsageLedger }>('/api/v1/billing/budget', {
      method: 'PUT',
      body: JSON.stringify({ monthlyBudgetUsd, monthlyTokenLimit }),
    }),

  getAuditLogs: async () => {
    try {
      const res = await request<{ auditLogs: AuditLogEntry[] }>('/api/v1/audit');
      void offlineCache.saveAuditLogs(res.auditLogs);
      return res;
    } catch (err) {
      if (isNetworkFailure(err)) {
        const auditLogs = await offlineCache.getAuditLogs();
        return { auditLogs: auditLogs ?? [] };
      }
      throw err;
    }
  },
};
