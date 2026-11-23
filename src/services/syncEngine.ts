import type { User } from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { db, isFirestoreOfflineError } from '../firebase';
import type {
  AgentTask,
  Project,
  SyncConflictRecord,
  SyncStateStatus,
} from '../types/devmind';
import { devmindApi, syncOfflineMutations } from './api';
import {
  sanitizeDocId,
  syncProjectSummaryToFirestore,
  syncTaskRecordToFirestore,
} from './firestoreSync';
import {
  getPendingMutationCount,
  getSyncConflicts,
  getSyncMetaValue,
  removeSyncConflict,
  saveSyncConflict,
  setSyncMetaValue,
} from './offlineStore';

export interface SyncEngineSnapshot {
  status: SyncStateStatus;
  pendingCount: number;
  conflicts: SyncConflictRecord[];
  lastSyncedAt: string | null;
  lastError: string | null;
  authExpired: boolean;
  isSyncing: boolean;
}

type SyncEngineListener = (snapshot: SyncEngineSnapshot) => void;

const listeners = new Set<SyncEngineListener>();

let state: SyncEngineSnapshot = {
  status: typeof navigator !== 'undefined' && !navigator.onLine ? 'Offline' : 'Synced',
  pendingCount: 0,
  conflicts: [],
  lastSyncedAt: null,
  lastError: null,
  authExpired: false,
  isSyncing: false,
};

let onlineFlag = typeof navigator !== 'undefined' ? navigator.onLine : true;
let activeSyncPromise: Promise<SyncEngineSnapshot> | null = null;

function emit() {
  const copy: SyncEngineSnapshot = { ...state, conflicts: [...state.conflicts] };
  for (const listener of listeners) {
    try {
      listener(copy);
    } catch {
      // ignore subscriber errors
    }
  }
}

export function computeBackoffMs(retryCount: number): number {
  const safeRetries = Math.max(0, Math.min(10, Math.floor(retryCount)));
  return Math.min(60_000, 1_000 * Math.pow(2, safeRetries));
}

export function isFirebaseAuthExpiredError(err: unknown): boolean {
  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code?: unknown }).code || '').toLowerCase()
      : '';
  const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  return (
    code.includes('auth/user-token-expired') ||
    code.includes('auth/id-token-expired') ||
    code.includes('unauthenticated') ||
    msg.includes('token-expired') ||
    msg.includes('unauthenticated') ||
    msg.includes('missing or insufficient permissions')
  );
}

/**
 * Pure conflict detector: never silently overwrites newer cloud data.
 * A conflict occurs when the remote Firestore document has a newer server timestamp
 * than our last synced baseline AND key semantic fields diverge.
 */
export function detectCloudConflict(params: {
  entityType: SyncConflictRecord['entityType'];
  entityId: string;
  title: string;
  localUpdatedAt: string;
  localBaseCloudUpdatedAtMs: number | null;
  cloudUpdatedAtMs: number | null;
  localSnapshot: Record<string, unknown>;
  cloudSnapshot: Record<string, unknown>;
  compareFields: string[];
}): SyncConflictRecord | null {
  if (!params.cloudUpdatedAtMs) return null;

  const diverged = params.compareFields.some(
    (field) =>
      JSON.stringify(params.localSnapshot[field] ?? null) !==
      JSON.stringify(params.cloudSnapshot[field] ?? null)
  );
  if (!diverged) return null;

  const baselineMs = params.localBaseCloudUpdatedAtMs ?? 0;
  // Remote cloud record advanced after our last known sync baseline -> explicit conflict!
  if (baselineMs > 0 && params.cloudUpdatedAtMs > baselineMs) {
    return {
      id: `conf_${params.entityType}_${params.entityId}`,
      entityType: params.entityType,
      entityId: params.entityId,
      title: params.title,
      localUpdatedAt: params.localUpdatedAt,
      cloudUpdatedAt: new Date(params.cloudUpdatedAtMs).toISOString(),
      localSummary: params.compareFields
        .map((k) => `${k}: ${String(params.localSnapshot[k] ?? '')}`)
        .join(' · '),
      cloudSummary: params.compareFields
        .map((k) => `${k}: ${String(params.cloudSnapshot[k] ?? '')}`)
        .join(' · '),
      localSnapshot: params.localSnapshot,
      cloudSnapshot: params.cloudSnapshot,
      detectedAt: new Date().toISOString(),
    };
  }

  return null;
}

function deriveStatus(params: {
  online: boolean;
  isSyncing: boolean;
  pendingCount: number;
  conflictCount: number;
  lastError: string | null;
}): SyncStateStatus {
  if (!params.online) return 'Offline';
  if (params.isSyncing) return 'Syncing';
  if (params.conflictCount > 0) return 'Conflict';
  if (params.lastError) return 'Error';
  if (params.pendingCount > 0) return 'Pending';
  return 'Synced';
}

export function getSyncEngineSnapshot(): SyncEngineSnapshot {
  return { ...state, conflicts: [...state.conflicts] };
}

export function subscribeSyncEngine(listener: SyncEngineListener): () => void {
  listeners.add(listener);
  listener(getSyncEngineSnapshot());
  void refreshSyncEngineState();
  return () => {
    listeners.delete(listener);
  };
}

export function setSyncOnlineStatus(online: boolean): void {
  onlineFlag = online;
  state = {
    ...state,
    lastError: online ? state.lastError : null,
    status: deriveStatus({
      online: onlineFlag,
      isSyncing: state.isSyncing,
      pendingCount: state.pendingCount,
      conflictCount: state.conflicts.length,
      lastError: online ? state.lastError : null,
    }),
  };
  emit();
}

export async function refreshSyncEngineState(): Promise<SyncEngineSnapshot> {
  const [pendingCount, conflicts, lastSyncedAt] = await Promise.all([
    getPendingMutationCount(),
    getSyncConflicts(),
    getSyncMetaValue<string>('lastSyncedAt'),
  ]);

  state = {
    ...state,
    pendingCount,
    conflicts,
    lastSyncedAt: lastSyncedAt ?? state.lastSyncedAt,
    status: deriveStatus({
      online: onlineFlag,
      isSyncing: state.isSyncing,
      pendingCount,
      conflictCount: conflicts.length,
      lastError: state.lastError,
    }),
  };
  emit();
  return getSyncEngineSnapshot();
}

async function syncProjectsWithConflictCheck(uid: string, projects: Project[]): Promise<void> {
  const safeUid = sanitizeDocId(uid);
  for (const project of projects) {
    const safeProjectId = sanitizeDocId(project.id);
    const metaKey = `cloudTs:project:${safeUid}:${safeProjectId}`;
    const baselineMs = await getSyncMetaValue<number>(metaKey);

    const ref = doc(db, 'users', safeUid, 'savedProjects', safeProjectId);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const data = snap.data();
      const cloudUpdatedAtMs =
        typeof data.updatedAt?.toMillis === 'function' ? data.updatedAt.toMillis() : null;

      const localSnapshot = {
        name: project.name,
        description: project.description,
        fileCount: project.files.length,
        symbolCount: project.symbols.length,
      };
      const cloudSnapshot = {
        name: String(data.name || ''),
        description: String(data.description || ''),
        fileCount: Number(data.fileCount || 0),
        symbolCount: Number(data.symbolCount || 0),
      };

      const conflict = detectCloudConflict({
        entityType: 'project',
        entityId: project.id,
        title: `Project: ${project.name}`,
        localUpdatedAt: project.updatedAt,
        localBaseCloudUpdatedAtMs: baselineMs,
        cloudUpdatedAtMs,
        localSnapshot,
        cloudSnapshot,
        compareFields: ['name', 'description', 'fileCount'],
      });

      if (conflict) {
        await saveSyncConflict(conflict);
        continue;
      }
    }

    await syncProjectSummaryToFirestore(safeUid, project);
    const freshSnap = await getDoc(ref);
    const freshTs =
      freshSnap.exists() && typeof freshSnap.data().updatedAt?.toMillis === 'function'
        ? freshSnap.data().updatedAt.toMillis()
        : Date.now();
    await setSyncMetaValue(metaKey, freshTs);
  }
}

async function syncTasksWithConflictCheck(
  uid: string,
  tasks: AgentTask[],
  projects: Project[]
): Promise<void> {
  const safeUid = sanitizeDocId(uid);
  const projectMap = new Map(projects.map((p) => [p.id, p.name]));

  for (const task of tasks.slice(0, 25)) {
    const safeTaskId = sanitizeDocId(task.id);
    const metaKey = `cloudTs:task:${safeUid}:${safeTaskId}`;
    const baselineMs = await getSyncMetaValue<number>(metaKey);

    const ref = doc(db, 'users', safeUid, 'taskRecords', safeTaskId);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const data = snap.data();
      const cloudUpdatedAtMs =
        typeof data.updatedAt?.toMillis === 'function' ? data.updatedAt.toMillis() : null;

      const localSnapshot = {
        title: task.title,
        priority: task.priority,
        status: task.status,
      };
      const cloudSnapshot = {
        title: String(data.title || ''),
        priority: String(data.priority || 'medium'),
        status: String(data.status || 'pending'),
      };

      const conflict = detectCloudConflict({
        entityType: 'task',
        entityId: task.id,
        title: `Task: ${task.title}`,
        localUpdatedAt: task.completedAt || task.createdAt,
        localBaseCloudUpdatedAtMs: baselineMs,
        cloudUpdatedAtMs,
        localSnapshot,
        cloudSnapshot,
        compareFields: ['priority', 'status'],
      });

      if (conflict) {
        await saveSyncConflict(conflict);
        continue;
      }
    }

    await syncTaskRecordToFirestore(safeUid, task, projectMap.get(task.projectId) || 'Workspace');
    const freshSnap = await getDoc(ref);
    const freshTs =
      freshSnap.exists() && typeof freshSnap.data().updatedAt?.toMillis === 'function'
        ? freshSnap.data().updatedAt.toMillis()
        : Date.now();
    await setSyncMetaValue(metaKey, freshTs);
  }
}

export async function runHybridSync(options: {
  firebaseUser: User | null;
  projects: Project[];
  tasks: AgentTask[];
  force?: boolean;
}): Promise<SyncEngineSnapshot> {
  if (!onlineFlag) {
    setSyncOnlineStatus(false);
    return refreshSyncEngineState();
  }

  if (activeSyncPromise) {
    return activeSyncPromise;
  }

  activeSyncPromise = (async () => {
    state = {
      ...state,
      isSyncing: true,
      lastError: null,
      authExpired: false,
      status: 'Syncing',
    };
    emit();

    try {
      // 1. Replay queued local IndexedDB mutations idempotently to backend
      await syncOfflineMutations({ force: options.force });

      // 2. If authenticated with Firebase Cloud Account, run conflict-checked Firestore sync
      if (options.firebaseUser) {
        await syncProjectsWithConflictCheck(options.firebaseUser.uid, options.projects);
        await syncTasksWithConflictCheck(
          options.firebaseUser.uid,
          options.tasks,
          options.projects
        );
      }

      const now = new Date().toISOString();
      await setSyncMetaValue('lastSyncedAt', now);
      const [pendingCount, conflicts] = await Promise.all([
        getPendingMutationCount(),
        getSyncConflicts(),
      ]);

      state = {
        ...state,
        isSyncing: false,
        pendingCount,
        conflicts,
        lastSyncedAt: now,
        lastError: null,
        authExpired: false,
        status: deriveStatus({
          online: onlineFlag,
          isSyncing: false,
          pendingCount,
          conflictCount: conflicts.length,
          lastError: null,
        }),
      };
      emit();
      return getSyncEngineSnapshot();
    } catch (err) {
      if (isFirestoreOfflineError(err)) {
        state = { ...state, isSyncing: false, status: 'Offline' };
        emit();
        return getSyncEngineSnapshot();
      }

      const authExpired = isFirebaseAuthExpiredError(err);
      const msg = authExpired
        ? 'Firebase session expired — reconnect your Google account to resume cloud sync. Local queue is safely preserved.'
        : err instanceof Error
        ? err.message
        : 'Synchronization failed';

      const [pendingCount, conflicts] = await Promise.all([
        getPendingMutationCount(),
        getSyncConflicts(),
      ]);

      state = {
        ...state,
        isSyncing: false,
        pendingCount,
        conflicts,
        lastError: msg,
        authExpired,
        status: 'Error',
      };
      emit();
      return getSyncEngineSnapshot();
    } finally {
      activeSyncPromise = null;
    }
  })();

  return activeSyncPromise;
}

export async function resolveSyncConflict(
  conflict: SyncConflictRecord,
  resolution: 'keep-local' | 'keep-cloud',
  firebaseUser: User | null
): Promise<SyncEngineSnapshot> {
  if (firebaseUser) {
    const safeUid = sanitizeDocId(firebaseUser.uid);
    const safeEntityId = sanitizeDocId(conflict.entityId);

    if (resolution === 'keep-local') {
      if (conflict.entityType === 'project') {
        const ref = doc(db, 'users', safeUid, 'savedProjects', safeEntityId);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          await updateDoc(ref, {
            name: String(conflict.localSnapshot.name || 'workspace').slice(0, 120),
            description: String(conflict.localSnapshot.description || '').slice(0, 500),
            fileCount: Number(conflict.localSnapshot.fileCount || 0),
            symbolCount: Number(conflict.localSnapshot.symbolCount || 0),
            updatedAt: serverTimestamp(),
          });
        } else {
          await setDoc(ref, {
            ownerId: safeUid,
            name: String(conflict.localSnapshot.name || 'workspace').slice(0, 120),
            description: String(conflict.localSnapshot.description || '').slice(0, 500),
            localPath: 'C:\\Workspaces\\repo',
            framework: 'Node.js',
            primaryLanguage: 'TypeScript',
            fileCount: Number(conflict.localSnapshot.fileCount || 0),
            symbolCount: Number(conflict.localSnapshot.symbolCount || 0),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
        await setSyncMetaValue(`cloudTs:project:${safeUid}:${safeEntityId}`, Date.now());
      } else if (conflict.entityType === 'task') {
        const ref = doc(db, 'users', safeUid, 'taskRecords', safeEntityId);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          await updateDoc(ref, {
            priority: String(conflict.localSnapshot.priority || 'medium'),
            updatedAt: serverTimestamp(),
          });
        }
        await setSyncMetaValue(`cloudTs:task:${safeUid}:${safeEntityId}`, Date.now());
      }
    } else {
      // Accept cloud values: apply priority locally if task conflict and advance baseline timestamp
      if (conflict.entityType === 'task') {
        const cloudPriority = conflict.cloudSnapshot.priority;
        if (cloudPriority === 'high' || cloudPriority === 'medium' || cloudPriority === 'low') {
          try {
            await devmindApi.updateTaskPriority(conflict.entityId, cloudPriority);
          } catch {
            // Non-fatal if task no longer exists in local backend
          }
        }
        await setSyncMetaValue(
          `cloudTs:task:${safeUid}:${safeEntityId}`,
          new Date(conflict.cloudUpdatedAt).getTime()
        );
      } else if (conflict.entityType === 'project') {
        await setSyncMetaValue(
          `cloudTs:project:${safeUid}:${safeEntityId}`,
          new Date(conflict.cloudUpdatedAt).getTime()
        );
      }
    }
  }

  await removeSyncConflict(conflict.id);
  return refreshSyncEngineState();
}
