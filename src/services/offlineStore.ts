import type {
  AgentTask,
  ArchitectureSummary,
  AuditLogEntry,
  ChatMessage,
  CodeChunk,
  CodeSymbol,
  ExtensionHostSnapshot,
  GraphEdge,
  GraphNode,
  LocalProfile,
  PermissionPolicyRule,
  Project,
  PublicUserSession,
  RepoFile,
  SearchHit,
  SecurityFinding,
  SyncConflictRecord,
  TaskPriority,
  UsageLedger,
} from '../types/devmind';
import type { ProviderPreset } from './api';

const DB_NAME = 'devmind-studio-offline';
const DB_VERSION = 2;

const STORE_PROJECTS = 'projects';
const STORE_TASKS = 'tasks';
const STORE_KV = 'kv';
const STORE_QUEUE = 'mutationQueue';
const STORE_PROFILES = 'profiles';
const STORE_CHAT = 'chatHistory';
const STORE_EXTENSIONS = 'extensions';
const STORE_SETTINGS = 'settings';
const STORE_CONFLICTS = 'syncConflicts';
const STORE_SYNC_META = 'syncMeta';

export interface OfflineMutationMeta {
  id?: number;
  idempotencyKey?: string;
  status: 'pending-sync';
  createdAt: string;
  retryCount?: number;
  nextRetryAt?: number;
  lastError?: string;
  baseCloudUpdatedAtMs?: number;
}

export type OfflineMutation =
  | (OfflineMutationMeta & {
      type: 'saveFile';
      projectId: string;
      path: string;
      content: string;
    })
  | (OfflineMutationMeta & {
      type: 'deleteFile';
      projectId: string;
      path: string;
    })
  | (OfflineMutationMeta & {
      type: 'createProject';
      body: {
        name: string;
        description?: string;
        localPath?: string;
        files: Array<{ path: string; content: string }>;
      };
      tempProjectId: string;
    })
  | (OfflineMutationMeta & {
      type: 'updateTaskPriority';
      taskId: string;
      priority: TaskPriority;
    });

type QueueListener = (count: number) => void;
const queueListeners = new Set<QueueListener>();

type ConflictListener = (conflicts: SyncConflictRecord[]) => void;
const conflictListeners = new Set<ConflictListener>();

function notifyQueueListeners(count: number) {
  for (const listener of queueListeners) {
    try {
      listener(count);
    } catch {
      // Ignore subscriber errors
    }
  }
}

function notifyConflictListeners(conflicts: SyncConflictRecord[]) {
  for (const listener of conflictListeners) {
    try {
      listener(conflicts);
    } catch {
      // Ignore subscriber errors
    }
  }
}

export function subscribeOfflineQueueCount(listener: QueueListener): () => void {
  queueListeners.add(listener);
  void getPendingMutationCount().then(listener).catch(() => {});
  return () => {
    queueListeners.delete(listener);
  };
}

export function subscribeSyncConflicts(listener: ConflictListener): () => void {
  conflictListeners.add(listener);
  void getSyncConflicts().then(listener).catch(() => {});
  return () => {
    conflictListeners.delete(listener);
  };
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openOfflineDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB is not available in this environment.'));
  }
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = request.result;
      const oldVersion = event.oldVersion ?? 0;

      // Schema v1 base stores
      if (oldVersion < 1) {
        if (!db.objectStoreNames.contains(STORE_PROJECTS)) {
          db.createObjectStore(STORE_PROJECTS, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_TASKS)) {
          db.createObjectStore(STORE_TASKS, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_KV)) {
          db.createObjectStore(STORE_KV, { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains(STORE_QUEUE)) {
          db.createObjectStore(STORE_QUEUE, { keyPath: 'id', autoIncrement: true });
        }
      }

      // Schema v2 migration: dedicated stores for local profiles, chat, extensions, settings, conflicts, and sync metadata
      if (oldVersion < 2) {
        if (!db.objectStoreNames.contains(STORE_PROFILES)) {
          db.createObjectStore(STORE_PROFILES, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_CHAT)) {
          db.createObjectStore(STORE_CHAT, { keyPath: 'projectId' });
        }
        if (!db.objectStoreNames.contains(STORE_EXTENSIONS)) {
          db.createObjectStore(STORE_EXTENSIONS, { keyPath: 'scopeKey' });
        }
        if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
          db.createObjectStore(STORE_SETTINGS, { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains(STORE_CONFLICTS)) {
          db.createObjectStore(STORE_CONFLICTS, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_SYNC_META)) {
          db.createObjectStore(STORE_SYNC_META, { keyPath: 'key' });
        }
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      dbPromise = null;
      reject(request.error ?? new Error('Failed to open IndexedDB offline store.'));
    };
  });

  return dbPromise;
}

function idbRequest<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed.'));
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed.'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted.'));
  });
}

/* ============================================================================
 * Generic KV & Snapshot Caching
 * ============================================================================ */

export async function cacheKvValue<T>(key: string, value: T): Promise<void> {
  try {
    const db = await openOfflineDb();
    const tx = db.transaction(STORE_KV, 'readwrite');
    tx.objectStore(STORE_KV).put({ key, value, updatedAt: new Date().toISOString() });
    await txDone(tx);
  } catch {
    // Non-fatal in private/restricted storage contexts
  }
}

export async function getCachedKvValue<T>(key: string): Promise<T | null> {
  try {
    const db = await openOfflineDb();
    const tx = db.transaction(STORE_KV, 'readonly');
    const row = (await idbRequest(tx.objectStore(STORE_KV).get(key))) as
      | { key: string; value: T }
      | undefined;
    return row ? row.value : null;
  } catch {
    return null;
  }
}

export async function cacheProjects(projects: Project[]): Promise<void> {
  try {
    const db = await openOfflineDb();
    const tx = db.transaction(STORE_PROJECTS, 'readwrite');
    const store = tx.objectStore(STORE_PROJECTS);
    store.clear();
    for (const proj of projects) {
      store.put(proj);
    }
    await txDone(tx);
  } catch {
    // Non-fatal
  }
}

export async function cacheSingleProject(project: Project): Promise<void> {
  try {
    const db = await openOfflineDb();
    const tx = db.transaction(STORE_PROJECTS, 'readwrite');
    tx.objectStore(STORE_PROJECTS).put(project);
    await txDone(tx);
  } catch {
    // Non-fatal
  }
}

export async function getCachedProjects(): Promise<Project[]> {
  try {
    const db = await openOfflineDb();
    const tx = db.transaction(STORE_PROJECTS, 'readonly');
    const rows = (await idbRequest(tx.objectStore(STORE_PROJECTS).getAll())) as Project[];
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

export async function getCachedProjectById(projectId: string): Promise<Project | null> {
  try {
    const db = await openOfflineDb();
    const tx = db.transaction(STORE_PROJECTS, 'readonly');
    const row = (await idbRequest(tx.objectStore(STORE_PROJECTS).get(projectId))) as Project | undefined;
    return row ?? null;
  } catch {
    return null;
  }
}

export async function cacheTasks(tasks: AgentTask[]): Promise<void> {
  try {
    const db = await openOfflineDb();
    const tx = db.transaction(STORE_TASKS, 'readwrite');
    const store = tx.objectStore(STORE_TASKS);
    for (const task of tasks) {
      store.put(task);
    }
    await txDone(tx);
  } catch {
    // Non-fatal
  }
}

export async function getCachedTasks(projectId?: string): Promise<AgentTask[]> {
  try {
    const db = await openOfflineDb();
    const tx = db.transaction(STORE_TASKS, 'readonly');
    const rows = (await idbRequest(tx.objectStore(STORE_TASKS).getAll())) as AgentTask[];
    const list = Array.isArray(rows) ? rows : [];
    const filtered = projectId ? list.filter((t) => t.projectId === projectId) : list;
    return filtered.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    return [];
  }
}

/* ============================================================================
 * Offline Mutation Sync Queue (IndexedDB Outbox)
 * ============================================================================ */

export async function enqueueOfflineMutation(mutation: OfflineMutation): Promise<number> {
  const db = await openOfflineDb();
  const tx = db.transaction(STORE_QUEUE, 'readwrite');
  const store = tx.objectStore(STORE_QUEUE);
  const all = (await idbRequest(store.getAll())) as OfflineMutation[];

  const idempotencyKey =
    mutation.idempotencyKey ||
    (mutation.type === 'saveFile'
      ? `saveFile:${mutation.projectId}:${mutation.path}`
      : mutation.type === 'deleteFile'
      ? `deleteFile:${mutation.projectId}:${mutation.path}`
      : mutation.type === 'updateTaskPriority'
      ? `updateTaskPriority:${mutation.taskId}`
      : `createProject:${mutation.tempProjectId}`);

  // Prevent duplicate writes & coalesce consecutive edits to the same resource
  for (const existing of all) {
    if (existing.id === undefined) continue;
    const sameIdempotency = existing.idempotencyKey && existing.idempotencyKey === idempotencyKey;
    const sameSave =
      mutation.type === 'saveFile' &&
      existing.type === 'saveFile' &&
      existing.projectId === mutation.projectId &&
      existing.path === mutation.path;
    const samePriority =
      mutation.type === 'updateTaskPriority' &&
      existing.type === 'updateTaskPriority' &&
      existing.taskId === mutation.taskId;
    if (sameIdempotency || sameSave || samePriority) {
      store.delete(existing.id);
    }
  }

  store.add({
    ...mutation,
    idempotencyKey,
    retryCount: mutation.retryCount ?? 0,
  });
  await txDone(tx);
  const count = await getPendingMutationCount();
  notifyQueueListeners(count);
  return count;
}

export async function updatePendingMutation(mutation: OfflineMutation): Promise<void> {
  if (mutation.id === undefined) return;
  const db = await openOfflineDb();
  const tx = db.transaction(STORE_QUEUE, 'readwrite');
  tx.objectStore(STORE_QUEUE).put(mutation);
  await txDone(tx);
}

export async function getPendingMutations(): Promise<OfflineMutation[]> {
  try {
    const db = await openOfflineDb();
    const tx = db.transaction(STORE_QUEUE, 'readonly');
    const rows = (await idbRequest(tx.objectStore(STORE_QUEUE).getAll())) as OfflineMutation[];
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

export async function getPendingMutationCount(): Promise<number> {
  const items = await getPendingMutations();
  return items.length;
}

export async function getPendingSyncFileKeys(): Promise<Set<string>> {
  const items = await getPendingMutations();
  const keys = new Set<string>();
  for (const item of items) {
    if (item.type === 'saveFile') {
      keys.add(`${item.projectId}:${item.path}`);
    }
  }
  return keys;
}

export async function removePendingMutation(id: number): Promise<void> {
  const db = await openOfflineDb();
  const tx = db.transaction(STORE_QUEUE, 'readwrite');
  tx.objectStore(STORE_QUEUE).delete(id);
  await txDone(tx);
  const count = await getPendingMutationCount();
  notifyQueueListeners(count);
}

/* ============================================================================
 * Schema v2 Dedicated Stores: Profiles, Conflicts, Sync Meta & Auto-Save Drafts
 * ============================================================================ */

export async function cacheLocalProfiles(profiles: LocalProfile[]): Promise<void> {
  try {
    const db = await openOfflineDb();
    const tx = db.transaction(STORE_PROFILES, 'readwrite');
    const store = tx.objectStore(STORE_PROFILES);
    store.clear();
    for (const p of profiles) {
      if (p && typeof p.id === 'string' && p.id.length > 0) {
        store.put(p);
      }
    }
    await txDone(tx);
  } catch {
    // Non-fatal
  }
}

export async function getCachedLocalProfiles(): Promise<LocalProfile[]> {
  try {
    const db = await openOfflineDb();
    const tx = db.transaction(STORE_PROFILES, 'readonly');
    const rows = (await idbRequest(tx.objectStore(STORE_PROFILES).getAll())) as LocalProfile[];
    return Array.isArray(rows)
      ? rows.sort((a, b) => b.lastActiveAt.localeCompare(a.lastActiveAt))
      : [];
  } catch {
    return [];
  }
}

export async function saveSyncConflict(conflict: SyncConflictRecord): Promise<void> {
  if (!conflict?.id) return;
  const db = await openOfflineDb();
  const tx = db.transaction(STORE_CONFLICTS, 'readwrite');
  tx.objectStore(STORE_CONFLICTS).put(conflict);
  await txDone(tx);
  notifyConflictListeners(await getSyncConflicts());
}

export async function getSyncConflicts(): Promise<SyncConflictRecord[]> {
  try {
    const db = await openOfflineDb();
    const tx = db.transaction(STORE_CONFLICTS, 'readonly');
    const rows = (await idbRequest(tx.objectStore(STORE_CONFLICTS).getAll())) as SyncConflictRecord[];
    return Array.isArray(rows)
      ? rows.sort((a, b) => b.detectedAt.localeCompare(a.detectedAt))
      : [];
  } catch {
    return [];
  }
}

export async function removeSyncConflict(id: string): Promise<void> {
  const db = await openOfflineDb();
  const tx = db.transaction(STORE_CONFLICTS, 'readwrite');
  tx.objectStore(STORE_CONFLICTS).delete(id);
  await txDone(tx);
  notifyConflictListeners(await getSyncConflicts());
}

export async function setSyncMetaValue<T>(key: string, value: T): Promise<void> {
  try {
    const db = await openOfflineDb();
    const tx = db.transaction(STORE_SYNC_META, 'readwrite');
    tx.objectStore(STORE_SYNC_META).put({ key, value, updatedAt: new Date().toISOString() });
    await txDone(tx);
  } catch {
    // Non-fatal
  }
}

export async function getSyncMetaValue<T>(key: string): Promise<T | null> {
  try {
    const db = await openOfflineDb();
    const tx = db.transaction(STORE_SYNC_META, 'readonly');
    const row = (await idbRequest(tx.objectStore(STORE_SYNC_META).get(key))) as
      | { key: string; value: T }
      | undefined;
    return row ? row.value : null;
  } catch {
    return null;
  }
}

export async function saveEditorDraft(
  projectId: string,
  filePath: string,
  content: string
): Promise<void> {
  try {
    const db = await openOfflineDb();
    const tx = db.transaction(STORE_SETTINGS, 'readwrite');
    tx.objectStore(STORE_SETTINGS).put({
      key: `draft:${projectId}:${filePath}`,
      value: { projectId, filePath, content, savedAt: new Date().toISOString() },
    });
    await txDone(tx);
  } catch {
    // Non-fatal
  }
}

export async function getEditorDraft(
  projectId: string,
  filePath: string
): Promise<{ content: string; savedAt: string } | null> {
  try {
    const db = await openOfflineDb();
    const tx = db.transaction(STORE_SETTINGS, 'readonly');
    const row = (await idbRequest(
      tx.objectStore(STORE_SETTINGS).get(`draft:${projectId}:${filePath}`)
    )) as { value?: { content: string; savedAt: string } } | undefined;
    return row?.value ?? null;
  } catch {
    return null;
  }
}

export async function clearEditorDraft(projectId: string, filePath: string): Promise<void> {
  try {
    const db = await openOfflineDb();
    const tx = db.transaction(STORE_SETTINGS, 'readwrite');
    tx.objectStore(STORE_SETTINGS).delete(`draft:${projectId}:${filePath}`);
    await txDone(tx);
  } catch {
    // Non-fatal
  }
}

/* ============================================================================
 * Local Offline Code Intelligence & Deterministic Code Operations
 * ============================================================================ */

function inferLanguage(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  switch (ext) {
    case 'ts':
    case 'tsx':
      return 'TypeScript';
    case 'js':
    case 'jsx':
    case 'mjs':
    case 'cjs':
      return 'JavaScript';
    case 'json':
      return 'JSON';
    case 'css':
    case 'scss':
      return 'CSS';
    case 'html':
      return 'HTML';
    case 'py':
      return 'Python';
    case 'md':
      return 'Markdown';
    case 'yml':
    case 'yaml':
      return 'YAML';
    case 'sql':
      return 'SQL';
    default:
      return 'Plain Text';
  }
}

function simpleHash(input: string): string {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function classifyLayer(filePath: string): GraphNode['layer'] {
  const p = filePath.toLowerCase();
  if (p.includes('route') || p.includes('controller') || p.includes('api')) return 'route';
  if (p.includes('service') || p.includes('engine') || p.includes('orchestrator')) return 'service';
  if (p.includes('model') || p.includes('schema') || p.includes('db') || p.includes('store')) return 'data';
  if (p.includes('config') || p.endsWith('.json') || p.endsWith('.yml')) return 'config';
  return 'entry';
}

function extractSymbolsFromFile(file: RepoFile): CodeSymbol[] {
  const symbols: CodeSymbol[] = [];
  const lines = file.content.split('\n');
  const patterns: Array<{ regex: RegExp; kind: CodeSymbol['kind'] }> = [
    { regex: /^(export\s+)?(async\s+)?function\s+([A-Za-z0-9_$]+)/, kind: 'function' },
    { regex: /^(export\s+)?class\s+([A-Za-z0-9_$]+)/, kind: 'class' },
    { regex: /^(export\s+)?interface\s+([A-Za-z0-9_$]+)/, kind: 'interface' },
    { regex: /^(export\s+)?const\s+([A-Za-z0-9_$]+)\s*=/, kind: 'const' },
    { regex: /^\s*(app|router)\.(get|post|put|patch|delete)\(\s*['"]([^'"]+)['"]/, kind: 'route' },
  ];

  lines.forEach((rawLine, idx) => {
    const trimmed = rawLine.trim();
    for (const { regex, kind } of patterns) {
      const m = trimmed.match(regex);
      if (m) {
        const name = kind === 'route' ? `${m[2].toUpperCase()} ${m[3]}` : m[m.length - 1];
        symbols.push({
          id: `sym_off_${simpleHash(`${file.path}:${idx + 1}:${name}`)}`,
          filePath: file.path,
          name,
          kind,
          startLine: idx + 1,
          endLine: Math.min(lines.length, idx + 12),
          signature: trimmed.slice(0, 120),
          exported: trimmed.startsWith('export '),
        });
        break;
      }
    }
  });

  return symbols;
}

export function scanOfflineSecurityFindings(project: Project): SecurityFinding[] {
  const findings: SecurityFinding[] = [];
  const rules: Array<{
    ruleId: string;
    cwe: string;
    title: string;
    severity: SecurityFinding['severity'];
    regex: RegExp;
    description: string;
    remediation: string;
  }> = [
    {
      ruleId: 'SEC-EVAL',
      cwe: 'CWE-95',
      title: 'Dynamic code evaluation detected',
      severity: 'high',
      regex: /\beval\s*\(/,
      description: 'Using eval() executes arbitrary strings as code and opens injection risks.',
      remediation: 'Replace eval() with safe JSON parsing or structured lookup functions.',
    },
    {
      ruleId: 'SEC-HTML',
      cwe: 'CWE-79',
      title: 'Unsanitized HTML injection sink',
      severity: 'medium',
      regex: /dangerouslySetInnerHTML|\.innerHTML\s*=/,
      description: 'Direct HTML insertion can allow cross-site scripting if input is untrusted.',
      remediation: 'Use React text rendering or sanitize HTML with DOMPurify before rendering.',
    },
    {
      ruleId: 'SEC-SECRET',
      cwe: 'CWE-798',
      title: 'Potential hardcoded API secret',
      severity: 'critical',
      regex: /(?:sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16})/,
      description: 'Hardcoded credentials in source files risk accidental exposure in version control.',
      remediation: 'Move credentials to environment variables or secure secret storage.',
    },
  ];

  for (const file of project.files) {
    const lines = file.content.split('\n');
    lines.forEach((line, idx) => {
      for (const rule of rules) {
        if (rule.regex.test(line)) {
          findings.push({
            id: `sec_off_${simpleHash(`${project.id}:${file.path}:${idx + 1}:${rule.ruleId}`)}`,
            projectId: project.id,
            ruleId: rule.ruleId,
            cwe: rule.cwe,
            title: rule.title,
            severity: rule.severity,
            filePath: file.path,
            line: idx + 1,
            snippet: line.trim().slice(0, 140),
            description: rule.description,
            remediation: rule.remediation,
            status: 'open',
          });
        }
      }
    });
  }

  return findings;
}

export function rebuildProjectIndexLocally(project: Project): Project {
  const started = performance.now();
  const now = new Date().toISOString();
  const symbols: CodeSymbol[] = [];
  const chunks: CodeChunk[] = [];
  const edges: GraphEdge[] = [];
  const filePaths = new Set(project.files.map((f) => f.path));

  const normalizedFiles: RepoFile[] = project.files.map((f) => {
    const lines = f.content.split('\n');
    return {
      ...f,
      language: f.language || inferLanguage(f.path),
      sizeBytes: new Blob([f.content]).size,
      lineCount: lines.length,
      contentHash: simpleHash(f.content),
      lastIndexedAt: now,
    };
  });

  for (const file of normalizedFiles) {
    const fileSyms = extractSymbolsFromFile(file);
    symbols.push(...fileSyms);

    const importMatches = [...file.content.matchAll(/import\s+.*?\s+from\s+['"]([^'"]+)['"]/g)].map(
      (m) => m[1]
    );

    for (const imp of importMatches) {
      const cleaned = imp.replace(/^\.\//, '').replace(/^\.\.\//, '');
      const target = [...filePaths].find(
        (fp) =>
          fp !== file.path &&
          (fp.endsWith(cleaned) ||
            fp.endsWith(`${cleaned}.ts`) ||
            fp.endsWith(`${cleaned}.tsx`) ||
            fp.endsWith(`${cleaned}.js`))
      );
      if (target) {
        edges.push({
          id: `edge_off_${simpleHash(`${file.path}->${target}`)}`,
          source: file.path,
          target,
          type: 'IMPORTS',
        });
      }
    }

    chunks.push({
      chunkId: `chk_off_${simpleHash(`${project.id}:${file.path}`)}`,
      projectId: project.id,
      filePath: file.path,
      language: file.language,
      symbolName: fileSyms[0]?.name || file.path.split('/').pop() || file.path,
      symbolType: fileSyms[0]?.kind || 'file',
      startLine: 1,
      endLine: file.lineCount,
      contentHash: file.contentHash,
      content: file.content.slice(0, 4000),
      dependencies: importMatches,
    });
  }

  const totalLines = normalizedFiles.reduce((sum, f) => sum + f.lineCount, 0);
  const nodes: GraphNode[] = normalizedFiles.map((f) => ({
    id: f.path,
    label: f.path.split('/').pop() || f.path,
    filePath: f.path,
    layer: classifyLayer(f.path),
    symbolCount: symbols.filter((s) => s.filePath === f.path).length,
    lineCount: f.lineCount,
    issueCount: 0,
  }));

  const durationMs = Math.max(1, Math.round(performance.now() - started));
  const architecture: ArchitectureSummary = {
    ...project.architecture,
    projectId: project.id,
    totalFiles: normalizedFiles.length,
    totalLines,
    totalSymbols: symbols.length,
    totalChunks: chunks.length,
    indexingDurationMs: durationMs,
    nodes,
    edges,
    lastIndexedAt: now,
  };

  return {
    ...project,
    indexingStatus: 'indexed',
    indexingDurationMs: durationMs,
    files: normalizedFiles,
    symbols,
    chunks,
    architecture,
    updatedAt: now,
  };
}

export async function offlineSaveFile(
  projectId: string,
  filePath: string,
  content: string,
  fallbackProject?: Project
): Promise<Project> {
  const existing = (await getCachedProjectById(projectId)) ?? fallbackProject ?? null;
  if (!existing) {
    throw new Error('Project is not available in local offline cache yet.');
  }
  const now = new Date().toISOString();
  const hasFile = existing.files.some((f) => f.path === filePath);
  const nextFiles: RepoFile[] = hasFile
    ? existing.files.map((f) =>
        f.path === filePath
          ? {
              ...f,
              content,
              sizeBytes: new Blob([content]).size,
              lineCount: content.split('\n').length,
              contentHash: simpleHash(content),
              gitStatus: 'modified',
              syncStatus: 'pending-sync',
              lastIndexedAt: now,
            }
          : f
      )
    : [
        ...existing.files,
        {
          path: filePath,
          content,
          language: inferLanguage(filePath),
          sizeBytes: new Blob([content]).size,
          lineCount: content.split('\n').length,
          contentHash: simpleHash(content),
          gitStatus: 'added',
          syncStatus: 'pending-sync',
          lastIndexedAt: now,
        },
      ];

  const rebuilt = rebuildProjectIndexLocally({ ...existing, files: nextFiles });
  await cacheSingleProject(rebuilt);
  await cacheKvValue(`security:${projectId}`, scanOfflineSecurityFindings(rebuilt));
  await enqueueOfflineMutation({
    type: 'saveFile',
    projectId,
    path: filePath,
    content,
    status: 'pending-sync',
    createdAt: now,
  });
  return rebuilt;
}

export async function offlineDeleteFile(projectId: string, filePath: string): Promise<Project> {
  const existing = await getCachedProjectById(projectId);
  if (!existing) {
    throw new Error('Project is not available in local offline cache yet.');
  }
  const nextFiles = existing.files.filter((f) => f.path !== filePath);
  const rebuilt = rebuildProjectIndexLocally({ ...existing, files: nextFiles });
  await cacheSingleProject(rebuilt);
  await cacheKvValue(`security:${projectId}`, scanOfflineSecurityFindings(rebuilt));
  await enqueueOfflineMutation({
    type: 'deleteFile',
    projectId,
    path: filePath,
    status: 'pending-sync',
    createdAt: new Date().toISOString(),
  });
  return rebuilt;
}

export async function offlineCreateProject(body: {
  name: string;
  description?: string;
  localPath?: string;
  files: Array<{ path: string; content: string }>;
}): Promise<Project> {
  const now = new Date().toISOString();
  const id = `proj_offline_${Date.now().toString(36)}`;
  const files: RepoFile[] = body.files.map((f) => ({
    path: f.path,
    content: f.content,
    language: inferLanguage(f.path),
    sizeBytes: new Blob([f.content]).size,
    lineCount: f.content.split('\n').length,
    contentHash: simpleHash(f.content),
    gitStatus: 'added',
    lastIndexedAt: now,
  }));

  const draft: Project = {
    id,
    workspaceId: 'offline-local',
    name: body.name,
    description: body.description || 'Created offline in IndexedDB workspace.',
    localPath: body.localPath || `C:\\Workspaces\\${body.name.replace(/[^a-zA-Z0-9_-]/g, '-')}`,
    defaultBranch: 'main',
    primaryLanguage: files[0]?.language || 'TypeScript',
    framework: 'Node.js',
    packageManager: 'npm',
    indexingStatus: 'indexed',
    indexingDurationMs: 1,
    files,
    symbols: [],
    chunks: [],
    architecture: {
      projectId: id,
      framework: 'Node.js',
      primaryLanguage: files[0]?.language || 'TypeScript',
      packageManager: 'npm',
      entryPoints: files.slice(0, 1).map((f) => f.path),
      totalFiles: files.length,
      totalLines: 0,
      totalSymbols: 0,
      totalChunks: 0,
      indexingDurationMs: 1,
      nodes: [],
      edges: [],
      lastIndexedAt: now,
    },
    createdAt: now,
    updatedAt: now,
  };

  const rebuilt = rebuildProjectIndexLocally(draft);
  await cacheSingleProject(rebuilt);
  await cacheKvValue(`security:${id}`, scanOfflineSecurityFindings(rebuilt));
  await enqueueOfflineMutation({
    type: 'createProject',
    body,
    tempProjectId: id,
    status: 'pending-sync',
    createdAt: now,
  });
  return rebuilt;
}

export async function offlineSearchRepo(projectId: string, queryText: string): Promise<SearchHit[]> {
  const project = await getCachedProjectById(projectId);
  if (!project) return [];
  const q = queryText.trim().toLowerCase();
  if (!q) return [];
  const terms = q.split(/\s+/).filter(Boolean);
  const hits: SearchHit[] = [];

  for (const sym of project.symbols) {
    const hay = `${sym.name} ${sym.signature} ${sym.filePath}`.toLowerCase();
    if (terms.every((t) => hay.includes(t))) {
      hits.push({
        chunkId: `off_sym_${sym.id}`,
        filePath: sym.filePath,
        symbolName: sym.name,
        symbolType: sym.kind,
        startLine: sym.startLine,
        endLine: sym.endLine,
        score: sym.name.toLowerCase().includes(q) ? 0.96 : 0.84,
        matchReason: 'Offline IndexedDB symbol match',
        preview: sym.signature,
      });
    }
  }

  for (const file of project.files) {
    const lines = file.content.split('\n');
    lines.forEach((line, idx) => {
      const lower = line.toLowerCase();
      if (terms.every((t) => lower.includes(t))) {
        hits.push({
          chunkId: `off_line_${simpleHash(`${file.path}:${idx + 1}`)}`,
          filePath: file.path,
          symbolName: file.path.split('/').pop() || file.path,
          symbolType: 'line',
          startLine: idx + 1,
          endLine: idx + 1,
          score: 0.78,
          matchReason: 'Offline IndexedDB full-text match',
          preview: line.trim().slice(0, 160),
        });
      }
    });
  }

  return hits.sort((a, b) => b.score - a.score).slice(0, 25);
}

export async function offlineFormatFile(projectId: string, filePath: string): Promise<Project> {
  const project = await getCachedProjectById(projectId);
  if (!project) throw new Error('Project not cached offline.');
  const target = project.files.find((f) => f.path === filePath);
  if (!target) throw new Error(`File ${filePath} not found in offline cache.`);

  let formatted = target.content;
  if (filePath.endsWith('.json')) {
    try {
      formatted = `${JSON.stringify(JSON.parse(target.content), null, 2)}\n`;
    } catch {
      // Fall back to standard whitespace normalization if JSON has syntax errors
    }
  }
  if (formatted === target.content) {
    formatted =
      target.content
        .replace(/\r\n/g, '\n')
        .split('\n')
        .map((line) => line.replace(/[ \t]+$/g, ''))
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trimEnd() + '\n';
  }

  return offlineSaveFile(projectId, filePath, formatted);
}

export async function offlineUpdateTaskPriority(
  taskId: string,
  priority: TaskPriority
): Promise<AgentTask> {
  const db = await openOfflineDb();
  const tx = db.transaction(STORE_TASKS, 'readwrite');
  const store = tx.objectStore(STORE_TASKS);
  const existing = (await idbRequest(store.get(taskId))) as AgentTask | undefined;
  if (!existing) {
    throw new Error('Task not found in local offline cache.');
  }
  const updated: AgentTask = { ...existing, priority };
  store.put(updated);
  await txDone(tx);
  await enqueueOfflineMutation({
    type: 'updateTaskPriority',
    taskId,
    priority,
    status: 'pending-sync',
    createdAt: new Date().toISOString(),
  });
  return updated;
}

/* ============================================================================
 * Typed KV Helpers for Offline Workspace Hydration
 * ============================================================================ */

export const offlineCache = {
  saveSession: (session: PublicUserSession) => cacheKvValue('session', session),
  getSession: () => getCachedKvValue<PublicUserSession>('session'),
  savePresets: (presets: ProviderPreset[]) => cacheKvValue('presets', presets),
  getPresets: () => getCachedKvValue<ProviderPreset[]>('presets'),
  saveExtensionsHost: async (projectId: string | undefined, host: ExtensionHostSnapshot) => {
    try {
      const db = await openOfflineDb();
      const tx = db.transaction(STORE_EXTENSIONS, 'readwrite');
      tx.objectStore(STORE_EXTENSIONS).put({
        scopeKey: projectId || 'global',
        host,
        updatedAt: new Date().toISOString(),
      });
      await txDone(tx);
    } catch {
      await cacheKvValue(`ext:${projectId || 'global'}`, host);
    }
  },
  getExtensionsHost: async (projectId?: string) => {
    try {
      const db = await openOfflineDb();
      const tx = db.transaction(STORE_EXTENSIONS, 'readonly');
      const row = (await idbRequest(
        tx.objectStore(STORE_EXTENSIONS).get(projectId || 'global')
      )) as { host?: ExtensionHostSnapshot } | undefined;
      if (row?.host) return row.host;
    } catch {
      // Fallback to v1 kv store
    }
    return getCachedKvValue<ExtensionHostSnapshot>(`ext:${projectId || 'global'}`);
  },
  savePolicies: (policies: PermissionPolicyRule[]) => cacheKvValue('policies', policies),
  getPolicies: () => getCachedKvValue<PermissionPolicyRule[]>('policies'),
  saveUsage: (usage: UsageLedger) => cacheKvValue('usage', usage),
  getUsage: () => getCachedKvValue<UsageLedger>('usage'),
  saveSecurity: (projectId: string, findings: SecurityFinding[]) =>
    cacheKvValue(`security:${projectId}`, findings),
  getSecurity: (projectId: string) => getCachedKvValue<SecurityFinding[]>(`security:${projectId}`),
  saveChat: async (projectId: string, messages: ChatMessage[]) => {
    try {
      const db = await openOfflineDb();
      const tx = db.transaction(STORE_CHAT, 'readwrite');
      tx.objectStore(STORE_CHAT).put({
        projectId,
        messages,
        updatedAt: new Date().toISOString(),
      });
      await txDone(tx);
    } catch {
      await cacheKvValue(`chat:${projectId}`, messages);
    }
  },
  getChat: async (projectId: string) => {
    try {
      const db = await openOfflineDb();
      const tx = db.transaction(STORE_CHAT, 'readonly');
      const row = (await idbRequest(tx.objectStore(STORE_CHAT).get(projectId))) as
        | { messages?: ChatMessage[] }
        | undefined;
      if (Array.isArray(row?.messages)) return row.messages;
    } catch {
      // Fallback to v1 kv store
    }
    return getCachedKvValue<ChatMessage[]>(`chat:${projectId}`);
  },
  saveAuditLogs: (logs: AuditLogEntry[]) => cacheKvValue('auditLogs', logs),
  getAuditLogs: () => getCachedKvValue<AuditLogEntry[]>('auditLogs'),
};
