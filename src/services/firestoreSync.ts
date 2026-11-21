import type { User } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import type {
  AgentTask,
  ExtensionRecord,
  LlmProviderId,
  Project,
  TaskPriority,
  TaskStatus,
} from '../types/devmind';

const VALID_PROVIDERS: ReadonlySet<LlmProviderId> = new Set([
  'openai',
  'openrouter',
  'anthropic',
  'groq',
  'deepseek',
  'ollama',
  'custom',
]);

const VALID_PRIORITIES: ReadonlySet<TaskPriority> = new Set(['high', 'medium', 'low']);

const VALID_STATUSES: ReadonlySet<TaskStatus> = new Set([
  'pending',
  'planning',
  'awaiting_approval',
  'running',
  'completed',
  'failed',
  'cancelled',
]);

const TERMINAL_STATUSES: ReadonlySet<TaskStatus> = new Set(['completed', 'failed', 'cancelled']);

export interface FirestoreUserProfile {
  uid: string;
  displayName: string;
  email: string;
  photoURL: string;
  theme: 'dark' | 'light';
  preferredProvider: LlmProviderId;
  preferredModel: string;
  preferredBaseUrl: string;
  monthlyBudgetUsd: number;
  monthlyTokenLimit: number;
  activeProjectId: string;
}

export interface FirestoreExtensionPref {
  docId: string;
  ownerId: string;
  extensionId: string;
  displayName: string;
  version: string;
  installed: boolean;
  enabled: boolean;
}

export interface FirestoreTaskRecord {
  id: string;
  ownerId: string;
  projectId: string;
  projectName: string;
  title: string;
  description: string;
  priority: TaskPriority;
  status: TaskStatus;
  executionMode: 'approval' | 'direct';
  modelName: string;
  actualCostUsd: number;
}

export interface FirestoreProjectSummary {
  id: string;
  ownerId: string;
  name: string;
  description: string;
  localPath: string;
  framework: string;
  primaryLanguage: string;
  fileCount: number;
  symbolCount: number;
}

export function sanitizeDocId(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 128);
  return cleaned.length > 0 ? cleaned : 'doc_default';
}

function clampString(value: string | null | undefined, maxLength: number, fallback = ''): string {
  const text = (value ?? '').trim();
  if (!text) return fallback.slice(0, maxLength);
  return text.slice(0, maxLength);
}

function clampNumber(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

function sanitizeProvider(raw?: string): LlmProviderId {
  if (raw && VALID_PROVIDERS.has(raw as LlmProviderId)) {
    return raw as LlmProviderId;
  }
  return 'openai';
}

function sanitizePriority(raw?: string): TaskPriority {
  if (raw && VALID_PRIORITIES.has(raw as TaskPriority)) {
    return raw as TaskPriority;
  }
  return 'medium';
}

function sanitizeStatus(raw?: string): TaskStatus {
  if (raw && VALID_STATUSES.has(raw as TaskStatus)) {
    return raw as TaskStatus;
  }
  return 'pending';
}

/**
 * Ensures the signed-in Google user's private profile document exists at /users/{uid}.
 * Adheres strictly to firebase-blueprint.json field constraints and server timestamps.
 */
export async function ensureUserProfile(
  user: User,
  defaults?: {
    theme?: 'dark' | 'light';
    preferredProvider?: LlmProviderId;
    preferredModel?: string;
    preferredBaseUrl?: string;
  }
): Promise<FirestoreUserProfile> {
  const uid = sanitizeDocId(user.uid);
  const path = `users/${uid}`;
  const ref = doc(db, 'users', uid);

  let existingSnap;
  try {
    existingSnap = await getDoc(ref);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }

  if (existingSnap.exists()) {
    const data = existingSnap.data();
    return {
      uid,
      displayName: clampString(data.displayName, 120, user.displayName || 'Developer'),
      email: clampString(data.email, 254, user.email || 'user@workspace.local'),
      photoURL: clampString(data.photoURL, 512, user.photoURL || ''),
      theme: data.theme === 'light' ? 'light' : 'dark',
      preferredProvider: sanitizeProvider(data.preferredProvider),
      preferredModel: clampString(data.preferredModel, 120, 'gpt-4o-mini'),
      preferredBaseUrl: clampString(data.preferredBaseUrl, 256, 'https://api.openai.com/v1'),
      monthlyBudgetUsd: clampNumber(Number(data.monthlyBudgetUsd), 1, 100000, 25),
      monthlyTokenLimit: clampNumber(Number(data.monthlyTokenLimit), 10000, 1000000000, 5000000),
      activeProjectId: clampString(data.activeProjectId, 128, '').replace(/[^a-zA-Z0-9_\-]/g, ''),
    };
  }

  const resolvedTheme: 'dark' | 'light' = defaults?.theme === 'light' ? 'light' : 'dark';

  const profilePayload = {
    uid,
    displayName: clampString(user.displayName, 120, 'Developer'),
    email: clampString(user.email, 254, 'user@workspace.local'),
    photoURL: clampString(user.photoURL, 512, ''),
    theme: resolvedTheme,
    preferredProvider: sanitizeProvider(defaults?.preferredProvider),
    preferredModel: clampString(defaults?.preferredModel, 120, 'gpt-4o-mini'),
    preferredBaseUrl: clampString(defaults?.preferredBaseUrl, 256, 'https://api.openai.com/v1'),
    monthlyBudgetUsd: 25,
    monthlyTokenLimit: 5000000,
    activeProjectId: '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(ref, profilePayload);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }

  return {
    uid: profilePayload.uid,
    displayName: profilePayload.displayName,
    email: profilePayload.email,
    photoURL: profilePayload.photoURL,
    theme: resolvedTheme,
    preferredProvider: profilePayload.preferredProvider,
    preferredModel: profilePayload.preferredModel,
    preferredBaseUrl: profilePayload.preferredBaseUrl,
    monthlyBudgetUsd: profilePayload.monthlyBudgetUsd,
    monthlyTokenLimit: profilePayload.monthlyTokenLimit,
    activeProjectId: profilePayload.activeProjectId,
  };
}

export function subscribeUserProfile(
  uid: string,
  onData: (profile: FirestoreUserProfile) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const safeUid = sanitizeDocId(uid);
  const path = `users/${safeUid}`;
  return onSnapshot(
    doc(db, 'users', safeUid),
    (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      onData({
        uid: safeUid,
        displayName: clampString(data.displayName, 120, 'Developer'),
        email: clampString(data.email, 254, 'user@workspace.local'),
        photoURL: clampString(data.photoURL, 512, ''),
        theme: data.theme === 'light' ? 'light' : 'dark',
        preferredProvider: sanitizeProvider(data.preferredProvider),
        preferredModel: clampString(data.preferredModel, 120, 'gpt-4o-mini'),
        preferredBaseUrl: clampString(data.preferredBaseUrl, 256, 'https://api.openai.com/v1'),
        monthlyBudgetUsd: clampNumber(Number(data.monthlyBudgetUsd), 1, 100000, 25),
        monthlyTokenLimit: clampNumber(Number(data.monthlyTokenLimit), 10000, 1000000000, 5000000),
        activeProjectId: clampString(data.activeProjectId, 128, '').replace(/[^a-zA-Z0-9_\-]/g, ''),
      });
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.GET, path);
      } catch (wrapped) {
        onError?.(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

export async function updateUserProfilePrefs(
  uid: string,
  patch: Partial<{
    displayName: string;
    theme: 'dark' | 'light';
    preferredProvider: LlmProviderId;
    preferredModel: string;
    preferredBaseUrl: string;
    monthlyBudgetUsd: number;
    monthlyTokenLimit: number;
    activeProjectId: string;
  }>
): Promise<void> {
  const safeUid = sanitizeDocId(uid);
  const path = `users/${safeUid}`;
  const ref = doc(db, 'users', safeUid);

  const sanitized: Record<string, unknown> = {
    updatedAt: serverTimestamp(),
  };

  if (patch.displayName !== undefined) {
    sanitized.displayName = clampString(patch.displayName, 120, 'Developer');
  }
  if (patch.theme !== undefined) {
    sanitized.theme = patch.theme === 'light' ? 'light' : 'dark';
  }
  if (patch.preferredProvider !== undefined) {
    sanitized.preferredProvider = sanitizeProvider(patch.preferredProvider);
  }
  if (patch.preferredModel !== undefined) {
    sanitized.preferredModel = clampString(patch.preferredModel, 120, 'gpt-4o-mini');
  }
  if (patch.preferredBaseUrl !== undefined) {
    sanitized.preferredBaseUrl = clampString(patch.preferredBaseUrl, 256, 'https://api.openai.com/v1');
  }
  if (patch.monthlyBudgetUsd !== undefined) {
    sanitized.monthlyBudgetUsd = clampNumber(patch.monthlyBudgetUsd, 1, 100000, 25);
  }
  if (patch.monthlyTokenLimit !== undefined) {
    sanitized.monthlyTokenLimit = clampNumber(patch.monthlyTokenLimit, 10000, 1000000000, 5000000);
  }
  if (patch.activeProjectId !== undefined) {
    sanitized.activeProjectId = clampString(patch.activeProjectId, 128, '').replace(/[^a-zA-Z0-9_\-]/g, '');
  }

  try {
    await updateDoc(ref, sanitized);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function syncExtensionPrefToFirestore(
  uid: string,
  ext: ExtensionRecord
): Promise<void> {
  const safeUid = sanitizeDocId(uid);
  const docId = sanitizeDocId(ext.manifest.id);
  const path = `users/${safeUid}/extensions/${docId}`;
  const ref = doc(db, 'users', safeUid, 'extensions', docId);

  let snap;
  try {
    snap = await getDoc(ref);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }

  const safeExtId = clampString(ext.manifest.id, 128, docId).replace(/[^a-zA-Z0-9._\-]/g, '_');
  const displayName = clampString(ext.manifest.displayName, 120, safeExtId);
  const version = clampString(ext.manifest.version, 32, '1.0.0');

  if (snap.exists()) {
    try {
      await updateDoc(ref, {
        displayName,
        version,
        installed: Boolean(ext.installed),
        enabled: Boolean(ext.enabled),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
    return;
  }

  try {
    await setDoc(ref, {
      ownerId: safeUid,
      extensionId: safeExtId,
      displayName,
      version,
      installed: Boolean(ext.installed),
      enabled: Boolean(ext.enabled),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export function subscribeUserExtensions(
  uid: string,
  onData: (items: FirestoreExtensionPref[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const safeUid = sanitizeDocId(uid);
  const path = `users/${safeUid}/extensions`;
  const q = query(collection(db, 'users', safeUid, 'extensions'), where('ownerId', '==', safeUid));
  return onSnapshot(
    q,
    (snapshot) => {
      const list: FirestoreExtensionPref[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          docId: d.id,
          ownerId: safeUid,
          extensionId: String(data.extensionId || d.id),
          displayName: String(data.displayName || d.id),
          version: String(data.version || '1.0.0'),
          installed: Boolean(data.installed),
          enabled: Boolean(data.enabled),
        };
      });
      onData(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        onError?.(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

export async function syncTaskRecordToFirestore(
  uid: string,
  task: AgentTask,
  projectName: string
): Promise<void> {
  const safeUid = sanitizeDocId(uid);
  const safeTaskId = sanitizeDocId(task.id);
  const safeProjectId = sanitizeDocId(task.projectId);
  const path = `users/${safeUid}/taskRecords/${safeTaskId}`;
  const ref = doc(db, 'users', safeUid, 'taskRecords', safeTaskId);

  let snap;
  try {
    snap = await getDoc(ref);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }

  const priority = sanitizePriority(task.priority);
  const status = sanitizeStatus(task.status);
  const actualCostUsd = clampNumber(task.actualCostUsd ?? 0, 0, 100000, 0);
  const modelName = clampString(task.modelName, 120, 'local');

  if (snap.exists()) {
    const existingData = snap.data();
    const existingStatus = sanitizeStatus(existingData.status);

    // Respect Terminal State Locking in firestore.rules
    if (TERMINAL_STATUSES.has(existingStatus)) {
      if (existingData.priority !== priority) {
        try {
          await updateDoc(ref, {
            priority,
            updatedAt: serverTimestamp(),
          });
        } catch (error) {
          handleFirestoreError(error, OperationType.UPDATE, path);
        }
      }
      return;
    }

    try {
      await updateDoc(ref, {
        status,
        priority,
        actualCostUsd,
        modelName,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
    return;
  }

  try {
    await setDoc(ref, {
      ownerId: safeUid,
      projectId: safeProjectId,
      projectName: clampString(projectName, 120, 'workspace'),
      title: clampString(task.title, 200, 'Engineering Task'),
      description: clampString(task.description, 4000, ''),
      priority,
      status,
      executionMode: task.executionMode === 'direct' ? 'direct' : 'approval',
      modelName,
      actualCostUsd,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateTaskPriorityInFirestore(
  uid: string,
  taskId: string,
  priority: TaskPriority
): Promise<void> {
  const safeUid = sanitizeDocId(uid);
  const safeTaskId = sanitizeDocId(taskId);
  const path = `users/${safeUid}/taskRecords/${safeTaskId}`;
  const ref = doc(db, 'users', safeUid, 'taskRecords', safeTaskId);

  let snap;
  try {
    snap = await getDoc(ref);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
  if (!snap.exists()) return;

  try {
    await updateDoc(ref, {
      priority: sanitizePriority(priority),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export function subscribeUserTaskRecords(
  uid: string,
  onData: (items: FirestoreTaskRecord[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const safeUid = sanitizeDocId(uid);
  const path = `users/${safeUid}/taskRecords`;
  const q = query(collection(db, 'users', safeUid, 'taskRecords'), where('ownerId', '==', safeUid));
  return onSnapshot(
    q,
    (snapshot) => {
      const list: FirestoreTaskRecord[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          ownerId: safeUid,
          projectId: String(data.projectId || ''),
          projectName: String(data.projectName || 'Workspace'),
          title: String(data.title || 'Task'),
          description: String(data.description || ''),
          priority: sanitizePriority(data.priority),
          status: sanitizeStatus(data.status),
          executionMode: data.executionMode === 'direct' ? 'direct' : 'approval',
          modelName: String(data.modelName || 'local'),
          actualCostUsd: Number(data.actualCostUsd || 0),
        };
      });
      onData(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        onError?.(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

export async function syncProjectSummaryToFirestore(
  uid: string,
  project: Project
): Promise<void> {
  const safeUid = sanitizeDocId(uid);
  const safeProjectId = sanitizeDocId(project.id);
  const path = `users/${safeUid}/savedProjects/${safeProjectId}`;
  const ref = doc(db, 'users', safeUid, 'savedProjects', safeProjectId);

  let snap;
  try {
    snap = await getDoc(ref);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }

  const fields = {
    name: clampString(project.name, 120, 'workspace'),
    description: clampString(project.description, 500, ''),
    localPath: clampString(project.localPath, 260, 'C:\\Workspaces\\repo'),
    framework: clampString(project.framework, 80, 'Node.js'),
    primaryLanguage: clampString(project.primaryLanguage, 40, 'TypeScript'),
    fileCount: clampNumber(project.files.length, 0, 100000, 0),
    symbolCount: clampNumber(project.symbols.length, 0, 1000000, 0),
  };

  if (snap.exists()) {
    try {
      await updateDoc(ref, {
        ...fields,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
    return;
  }

  try {
    await setDoc(ref, {
      ownerId: safeUid,
      ...fields,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export function subscribeUserProjects(
  uid: string,
  onData: (items: FirestoreProjectSummary[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const safeUid = sanitizeDocId(uid);
  const path = `users/${safeUid}/savedProjects`;
  const q = query(collection(db, 'users', safeUid, 'savedProjects'), where('ownerId', '==', safeUid));
  return onSnapshot(
    q,
    (snapshot) => {
      const list: FirestoreProjectSummary[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          ownerId: safeUid,
          name: String(data.name || d.id),
          description: String(data.description || ''),
          localPath: String(data.localPath || ''),
          framework: String(data.framework || 'Node.js'),
          primaryLanguage: String(data.primaryLanguage || 'TypeScript'),
          fileCount: Number(data.fileCount || 0),
          symbolCount: Number(data.symbolCount || 0),
        };
      });
      onData(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        onError?.(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}
