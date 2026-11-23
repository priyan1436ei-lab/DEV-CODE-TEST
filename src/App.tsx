import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import {
  AlertCircle,
  AlertTriangle,
  Blocks,
  Bug,
  Cloud,
  CloudOff,
  Code2,
  Cpu,
  FileCode2,
  FolderGit2,
  GitBranch,
  GitFork,
  HardDrive,
  HelpCircle,
  History,
  LayoutDashboard,
  LogOut,
  Maximize2,
  Minimize2,
  Minus,
  Moon,
  PanelBottom,
  PanelLeft,
  PanelRight,
  RefreshCw,
  Search,
  Settings,
  ShieldAlert,
  Sun,
  UserCheck,
  X,
} from 'lucide-react';
import { AiWorkspacePanel } from './components/AiWorkspacePanel';
import { BottomWorkbenchPanel } from './components/BottomWorkbenchPanel';
import { CodeEditorView } from './components/CodeEditorView';
import { CommandPalette } from './components/CommandPalette';
import { ConflictResolutionModal } from './components/ConflictResolutionModal';
import { DashboardView } from './components/DashboardView';
import { DebuggingCenterView } from './components/DebuggingCenterView';
import { ExecutionHistoryView } from './components/ExecutionHistoryView';
import { ExtensionsView } from './components/ExtensionsView';
import { ImportRepoModal } from './components/ImportRepoModal';
import { KeyboardShortcutsModal } from './components/KeyboardShortcutsModal';
import { LoginGate } from './components/LoginGate';
import { OfflineIndicator } from './components/OfflineIndicator';
import { PWAInstallButton } from './components/PWAInstallButton';
import { RepoBrainView } from './components/RepoBrainView';
import { SecurityCenterView } from './components/SecurityCenterView';
import { SettingsPolicyView } from './components/SettingsPolicyView';
import { auth, isFirestoreOfflineError, signInWithGoogle, signOutFirebase } from './firebase';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import {
  devmindApi,
  getStoredSessionToken,
  setStoredSessionToken,
  type ProviderPreset,
} from './services/api';
import {
  ensureUserProfile,
  subscribeUserExtensions,
  subscribeUserProfile,
  subscribeUserProjects,
  subscribeUserTaskRecords,
  syncExtensionPrefToFirestore,
  syncProjectSummaryToFirestore,
  syncTaskRecordToFirestore,
  updateTaskPriorityInFirestore,
  updateUserProfilePrefs,
  type FirestoreExtensionPref,
  type FirestoreProjectSummary,
  type FirestoreTaskRecord,
  type FirestoreUserProfile,
} from './services/firestoreSync';
import {
  getPendingSyncFileKeys,
  offlineSaveFile,
  scanOfflineSecurityFindings,
} from './services/offlineStore';
import {
  resolveSyncConflict,
  runHybridSync,
  subscribeSyncEngine,
  type SyncEngineSnapshot,
} from './services/syncEngine';
import type {
  AgentTask,
  AiProvenance,
  AiRoutingMode,
  AuditLogEntry,
  ChatMessage,
  CodeChange,
  CodeCitation,
  DebugAnalysis,
  ExtensionHostSnapshot,
  FirebaseConnectionStatus,
  PermissionLevel,
  PermissionPolicyRule,
  Project,
  PublicUserSession,
  ScreenId,
  SecurityFinding,
  SyncConflictRecord,
  TaskPriority,
  UsageLedger,
} from './types/devmind';

function dedupeById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    if (!item || !item.id || seen.has(item.id)) continue;
    seen.add(item.id);
    result.push(item);
  }
  return result;
}

type MenuId = 'file' | 'view' | 'extensions' | 'help' | null;

export function App() {
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    try {
      const saved = window.localStorage.getItem('devmind_theme');
      return saved === 'light' ? 'light' : 'dark';
    } catch {
      return 'dark';
    }
  });

  // Firebase Auth & Firestore Cloud State
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [firebaseAuthReady, setFirebaseAuthReady] = useState(false);
  const [cloudProfile, setCloudProfile] = useState<FirestoreUserProfile | null>(null);
  const [loadingCloudProfile, setLoadingCloudProfile] = useState(false);
  const [cloudExtensions, setCloudExtensions] = useState<FirestoreExtensionPref[]>([]);
  const [cloudTasks, setCloudTasks] = useState<FirestoreTaskRecord[]>([]);
  const [cloudProjects, setCloudProjects] = useState<FirestoreProjectSummary[]>([]);
  const [firestoreError, setFirestoreError] = useState<Error | null>(null);

  const [session, setSession] = useState<PublicUserSession | null>(null);
  const [booting, setBooting] = useState(true);

  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string>('');
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null);
  const [highlightLine, setHighlightLine] = useState<number | null>(null);
  const [pendingDiff, setPendingDiff] = useState<CodeChange | null>(null);
  const [cursorPos, setCursorPos] = useState<{ line: number; col: number }>({ line: 1, col: 1 });

  const [tasks, setTasks] = useState<AgentTask[]>([]);
  const [securityFindings, setSecurityFindings] = useState<SecurityFinding[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [debugAnalyses, setDebugAnalyses] = useState<DebugAnalysis[]>([]);
  const [policies, setPolicies] = useState<PermissionPolicyRule[]>([]);
  const [presets, setPresets] = useState<ProviderPreset[]>([]);
  const [usage, setUsage] = useState<UsageLedger | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [extensionHost, setExtensionHost] = useState<ExtensionHostSnapshot | null>(null);

  const [screen, setScreen] = useState<ScreenId>('explorer');
  const [explorerOpen, setExplorerOpen] = useState(true);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [bottomPanelCollapsed, setBottomPanelCollapsed] = useState(false);
  const [bottomTab, setBottomTab] = useState<'problems' | 'extensions' | 'audit'>('problems');
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [shortcutsHelpOpen, setShortcutsHelpOpen] = useState(false);
  const [conflictModalOpen, setConflictModalOpen] = useState(false);
  const [openMenu, setOpenMenu] = useState<MenuId>(null);
  const [isMaximized, setIsMaximized] = useState(false);
  const [sseConnected, setSseConnected] = useState(false);
  const [syncingOffline, setSyncingOffline] = useState(false);
  const [pendingSyncFiles, setPendingSyncFiles] = useState<Set<string>>(() => new Set());
  const [streamingReply, setStreamingReply] = useState<{
    content: string;
    provenance: AiProvenance;
    modelUsed: string;
  } | null>(null);
  const [pulsingFiles, setPulsingFiles] = useState<Set<string>>(() => new Set());
  const [toast, setToast] = useState<{ tone: 'info' | 'error'; text: string } | null>(null);

  const { isOnline } = useOnlineStatus();
  const [syncSnapshot, setSyncSnapshot] = useState<SyncEngineSnapshot>({
    status: typeof navigator !== 'undefined' && !navigator.onLine ? 'Offline' : 'Synced',
    pendingCount: 0,
    conflicts: [],
    lastSyncedAt: null,
    lastError: null,
    authExpired: false,
    isSyncing: false,
  });

  const activeProjectIdRef = useRef(activeProjectId);
  activeProjectIdRef.current = activeProjectId;
  const firebaseUidRef = useRef<string | null>(null);
  firebaseUidRef.current = firebaseUser?.uid ?? null;
  const sessionRef = useRef<PublicUserSession | null>(null);
  sessionRef.current = session;
  const projectsRef = useRef<Project[]>(projects);
  projectsRef.current = projects;
  const tasksRef = useRef<AgentTask[]>(tasks);
  tasksRef.current = tasks;
  const prevGitStatusRef = useRef<{ projectId: string; statuses: Map<string, string> }>({
    projectId: '',
    statuses: new Map(),
  });
  const wasOnlineRef = useRef<boolean>(isOnline);

  // Propagate critical Firestore permission/quota errors to ErrorBoundary
  if (firestoreError) {
    throw firestoreError;
  }

  const showToast = useCallback((text: string, tone: 'info' | 'error' = 'info') => {
    setToast({ text, tone });
  }, []);

  const handleCloudError = useCallback((err: unknown) => {
    if (isFirestoreOfflineError(err)) {
      console.warn('Firestore temporarily unreachable; continuing in local mode until reconnected.');
      return;
    }
    setFirestoreError(err instanceof Error ? err : new Error(String(err)));
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  // Subscribe to offline-first sync engine state
  useEffect(() => {
    return subscribeSyncEngine(setSyncSnapshot);
  }, []);

  const handleSyncOfflineQueue = useCallback(
    async (force = false) => {
      if (syncingOffline || !isOnline) return;
      setSyncingOffline(true);
      try {
        const snap = await runHybridSync({
          firebaseUser,
          projects: projectsRef.current,
          tasks: tasksRef.current,
          force,
        });
        const remainingKeys = await getPendingSyncFileKeys();
        setPendingSyncFiles(remainingKeys);
        if (sessionRef.current) {
          try {
            const projRes = await devmindApi.listProjects();
            setProjects(dedupeById(projRes.projects));
          } catch {
            // Keep local project state intact if backend refresh fails
          }
        }
        if (snap.conflicts.length > 0) {
          showToast(
            `${snap.conflicts.length} cloud sync conflict${snap.conflicts.length === 1 ? '' : 's'} detected — review required before overwriting cloud data.`,
            'error'
          );
        } else if (snap.status === 'Synced' && force) {
          showToast('Workspace synchronized cleanly.');
        } else if (snap.lastError) {
          showToast(snap.lastError, 'error');
        }
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Synchronization failed.', 'error');
      } finally {
        setSyncingOffline(false);
      }
    },
    [firebaseUser, isOnline, showToast, syncingOffline]
  );

  // Automatic sync recovery when connectivity transitions from offline -> online
  useEffect(() => {
    void getPendingSyncFileKeys().then(setPendingSyncFiles).catch(() => {});
    if (!wasOnlineRef.current && isOnline && sessionRef.current) {
      showToast('Connectivity restored — synchronizing offline queue...');
      void handleSyncOfflineQueue(false);
    }
    wasOnlineRef.current = isOnline;
  }, [isOnline, handleSyncOfflineQueue, showToast]);

  // Listen to Firebase Auth state changes (never block offline startup or destroy local sessions)
  useEffect(() => {
    const offlineFallbackTimer = window.setTimeout(() => {
      setFirebaseAuthReady(true);
    }, 1800);

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      window.clearTimeout(offlineFallbackTimer);
      setFirebaseUser(user);
      setFirebaseAuthReady(true);
      if (!user) {
        setCloudProfile(null);
        setCloudExtensions([]);
        setCloudTasks([]);
        setCloudProjects([]);
        // Only clear session if it was a cloud-only session; preserve active Local Profile sessions!
        if (sessionRef.current && sessionRef.current.authMode !== 'local') {
          setStoredSessionToken(null);
          setSession(null);
        }
      }
    });
    return () => {
      window.clearTimeout(offlineFallbackTimer);
      unsubscribe();
    };
  }, []);

  // Attach Firestore real-time listeners ONLY when Firebase auth is ready and user is authenticated
  useEffect(() => {
    if (!firebaseAuthReady || !firebaseUser) return;

    let cancelled = false;
    let unsubProfile: (() => void) | undefined;
    let unsubExtensions: (() => void) | undefined;
    let unsubTasks: (() => void) | undefined;
    let unsubProjects: (() => void) | undefined;

    setLoadingCloudProfile(true);
    ensureUserProfile(firebaseUser, { theme })
      .then((profile) => {
        if (cancelled) return;
        setCloudProfile(profile);
        setLoadingCloudProfile(false);
        setTheme(profile.theme);

        unsubProfile = subscribeUserProfile(
          firebaseUser.uid,
          (nextProfile) => {
            setCloudProfile(nextProfile);
          },
          handleCloudError
        );
        unsubExtensions = subscribeUserExtensions(
          firebaseUser.uid,
          (items) => setCloudExtensions(items),
          handleCloudError
        );
        unsubTasks = subscribeUserTaskRecords(
          firebaseUser.uid,
          (items) => setCloudTasks(items),
          handleCloudError
        );
        unsubProjects = subscribeUserProjects(
          firebaseUser.uid,
          (items) => setCloudProjects(items),
          handleCloudError
        );
      })
      .catch((err) => {
        if (!cancelled) {
          setLoadingCloudProfile(false);
          handleCloudError(err);
        }
      });

    return () => {
      cancelled = true;
      unsubProfile?.();
      unsubExtensions?.();
      unsubTasks?.();
      unsubProjects?.();
    };
  }, [firebaseAuthReady, firebaseUser, handleCloudError]);

  // Apply Fluent Dark/Light class on root element
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    try {
      window.localStorage.setItem('devmind_theme', theme);
    } catch {
      // Ignore storage failures
    }
  }, [theme]);

  const handleThemeChange = useCallback((nextTheme: 'dark' | 'light') => {
    setTheme(nextTheme);
    if (firebaseUidRef.current) {
      updateUserProfilePrefs(firebaseUidRef.current, { theme: nextTheme }).catch(handleCloudError);
    }
  }, [handleCloudError]);

  // Track Electron window maximize state
  useEffect(() => {
    if (!window.devmindDesktop) return;
    window.devmindDesktop.isMaximized().then(setIsMaximized).catch(() => {});
    const unsubscribe = window.devmindDesktop.onMaximizedChanged((max) => {
      setIsMaximized(max);
    });
    return () => unsubscribe();
  }, []);

  // Global keyboard shortcuts matching KeyboardShortcutsModal cheat sheet
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isEditableTarget = Boolean(
        target &&
          (target.tagName === 'INPUT' ||
            target.tagName === 'TEXTAREA' ||
            target.tagName === 'SELECT' ||
            target.isContentEditable)
      );
      const hasMod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      if (hasMod && key === 'k') {
        e.preventDefault();
        setShortcutsHelpOpen(false);
        setCommandPaletteOpen((v) => !v);
      } else if (hasMod && e.key === '/') {
        e.preventDefault();
        setCommandPaletteOpen(false);
        setOpenMenu(null);
        setShortcutsHelpOpen((v) => !v);
      } else if ((e.key === '?' && !hasMod && !e.altKey && !isEditableTarget) || e.key === 'F1') {
        e.preventDefault();
        setCommandPaletteOpen(false);
        setOpenMenu(null);
        setShortcutsHelpOpen((v) => !v);
      } else if (hasMod && key === 'b') {
        e.preventDefault();
        setExplorerOpen((v) => !v);
      } else if (hasMod && key === 'j') {
        e.preventDefault();
        setBottomPanelCollapsed((v) => !v);
      } else if (hasMod && e.key === '.') {
        e.preventDefault();
        setRightPanelOpen((v) => !v);
      } else if (hasMod && e.shiftKey && key === 'l') {
        e.preventDefault();
        handleThemeChange(theme === 'dark' ? 'light' : 'dark');
      } else if (hasMod && !e.shiftKey && !e.altKey && e.key === ',') {
        e.preventDefault();
        setScreen('settings');
      } else if (hasMod && !e.shiftKey && !e.altKey && ['1', '2', '3', '4', '5', '6', '7'].includes(e.key)) {
        const screenMap: Record<string, ScreenId> = {
          '1': 'explorer',
          '2': 'dashboard',
          '3': 'brain',
          '4': 'extensions',
          '5': 'debugging',
          '6': 'security',
          '7': 'history',
        };
        const nextScreen = screenMap[e.key];
        if (nextScreen) {
          e.preventDefault();
          setScreen(nextScreen);
        }
      } else if (e.key === 'Escape') {
        setOpenMenu(null);
        setShortcutsHelpOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [theme, handleThemeChange]);

  // Close desktop menus when clicking outside
  useEffect(() => {
    if (!openMenu) return;
    const close = () => setOpenMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [openMenu]);

  // Restore existing backend session or OS-encrypted desktop local profile on boot (works offline)
  useEffect(() => {
    let cancelled = false;

    const restoreSession = async () => {
      try {
        const token = getStoredSessionToken();
        if (token) {
          try {
            const res = await devmindApi.getSession();
            if (!cancelled) {
              setSession(res.session);
              setBooting(false);
              return;
            }
          } catch {
            setStoredSessionToken(null);
          }
        }

        // In Electron desktop, check OS-backed safeStorage vault for last passwordless local profile
        if (window.devmindDesktop?.vaultGet) {
          const savedProfileId = await window.devmindDesktop
            .vaultGet('active_local_profile_id')
            .catch(() => null);
          if (savedProfileId) {
            try {
              const unlocked = await devmindApi.unlockLocalProfile(savedProfileId);
              if (!cancelled) {
                setStoredSessionToken(unlocked.token);
                setSession(unlocked.session);
                setBooting(false);
                return;
              }
            } catch {
              // Profile may require passcode or was deleted; fall through to LoginGate
            }
          }
        }
      } finally {
        if (!cancelled) setBooting(false);
      }
    };

    void restoreSession();
    return () => {
      cancelled = true;
    };
  }, []);

  const refreshProjectData = useCallback(async (projectId: string) => {
    if (!projectId) return;
    const [secRes, chatRes, debugRes, taskRes, extRes] = await Promise.all([
      devmindApi.getSecurityFindings(projectId),
      devmindApi.getChatHistory(projectId),
      devmindApi.getDebugAnalyses(projectId),
      devmindApi.listTasks(projectId),
      devmindApi.getExtensionsHost(projectId),
    ]);
    setSecurityFindings(dedupeById(secRes.findings));
    setChatMessages(dedupeById(chatRes.messages));
    setDebugAnalyses(dedupeById(debugRes.analyses));
    setTasks(dedupeById(taskRes.tasks));
    setExtensionHost(extRes.host);
  }, []);

  const refreshGlobalData = useCallback(async () => {
    const [projRes, polRes, usageRes, auditRes] = await Promise.all([
      devmindApi.listProjects(),
      devmindApi.getPolicies(),
      devmindApi.getUsage(),
      devmindApi.getAuditLogs(),
    ]);
    const uniqueProjects = dedupeById(projRes.projects);
    setProjects(uniqueProjects);
    setPolicies(polRes.policies);
    setPresets(polRes.presets);
    setUsage(usageRes.usage);
    setAuditLogs(dedupeById(auditRes.auditLogs));

    const preferredProjId = activeProjectIdRef.current || cloudProfile?.activeProjectId || '';
    const targetProject =
      uniqueProjects.find((p) => p.id === preferredProjId) || uniqueProjects[0] || null;
    if (targetProject) {
      if (targetProject.id !== activeProjectIdRef.current) {
        setActiveProjectId(targetProject.id);
        setActiveFilePath(targetProject.files[0]?.path ?? null);
      }
      await refreshProjectData(targetProject.id);
      if (firebaseUidRef.current) {
        syncProjectSummaryToFirestore(firebaseUidRef.current, targetProject).catch(() => {});
      }
    }
  }, [refreshProjectData, cloudProfile?.activeProjectId]);

  useEffect(() => {
    if (!session) return;
    refreshGlobalData().catch((err) => {
      showToast(err instanceof Error ? err.message : 'Failed to load workspace data.', 'error');
    });
  }, [session, refreshGlobalData, showToast]);

  // Real-Time Server-Sent Events Sync
  useEffect(() => {
    const token = getStoredSessionToken();
    if (!session || !token) return;

    const es = new EventSource(`/api/v1/events?token=${encodeURIComponent(token)}`);
    es.onopen = () => setSseConnected(true);
    es.onerror = () => setSseConnected(false);

    es.onmessage = async (event) => {
      try {
        const msg = JSON.parse(event.data) as { type: string; payload?: Record<string, unknown> };
        const currentId = activeProjectIdRef.current;

        if (msg.type === 'project_updated' || msg.type === 'project_deleted') {
          const projRes = await devmindApi.listProjects();
          setProjects(dedupeById(projRes.projects));
          if (currentId) {
            const [secRes, extRes] = await Promise.all([
              devmindApi.getSecurityFindings(currentId),
              devmindApi.getExtensionsHost(currentId),
            ]);
            setSecurityFindings(dedupeById(secRes.findings));
            setExtensionHost(extRes.host);
          }
        } else if (msg.type === 'task_updated' && currentId) {
          const [taskRes, usageRes, auditRes] = await Promise.all([
            devmindApi.listTasks(currentId),
            devmindApi.getUsage(),
            devmindApi.getAuditLogs(),
          ]);
          setTasks(dedupeById(taskRes.tasks));
          setUsage(usageRes.usage);
          setAuditLogs(dedupeById(auditRes.auditLogs));
        } else if (msg.type === 'extensions_updated') {
          const [extRes, auditRes] = await Promise.all([
            devmindApi.getExtensionsHost(currentId || undefined),
            devmindApi.getAuditLogs(),
          ]);
          setExtensionHost(extRes.host);
          setAuditLogs(dedupeById(auditRes.auditLogs));
        } else if (msg.type === 'chat_updated' && currentId) {
          const chatRes = await devmindApi.getChatHistory(currentId);
          setChatMessages(dedupeById(chatRes.messages));
        } else if (msg.type === 'debug_updated' && currentId) {
          const debugRes = await devmindApi.getDebugAnalyses(currentId);
          setDebugAnalyses(dedupeById(debugRes.analyses));
        } else if (msg.type === 'policy_updated') {
          const polRes = await devmindApi.getPolicies();
          setPolicies(polRes.policies);
        } else if (msg.type === 'usage_updated') {
          const usageRes = await devmindApi.getUsage();
          setUsage(usageRes.usage);
        }
      } catch {
        // Ignore malformed heartbeat events
      }
    };

    return () => {
      es.close();
      setSseConnected(false);
    };
  }, [session]);

  const activeProject = useMemo(
    () => projects.find((p) => p.id === activeProjectId) || projects[0] || null,
    [projects, activeProjectId]
  );

  const activeFile = useMemo(
    () => activeProject?.files.find((f) => f.path === activeFilePath) || activeProject?.files[0] || null,
    [activeProject, activeFilePath]
  );

  useEffect(() => {
    if (!activeProject) return;
    if (!activeFilePath || !activeProject.files.some((f) => f.path === activeFilePath)) {
      setActiveFilePath(activeProject.files[0]?.path ?? null);
    }
  }, [activeProject, activeFilePath]);

  // Track gitStatus / syncStatus transitions per file to trigger subtle pulse animation in sidebar tree
  useEffect(() => {
    if (!activeProject) return;
    const prev = prevGitStatusRef.current;
    const nextMap = new Map<string, string>();
    const changedPaths: string[] = [];

    for (const file of activeProject.files) {
      const isPending =
        pendingSyncFiles.has(`${activeProject.id}:${file.path}`) ||
        file.syncStatus === 'pending-sync';
      const sig = `${file.gitStatus}:${isPending ? 'pending' : 'synced'}`;
      nextMap.set(file.path, sig);

      if (prev.projectId === activeProject.id) {
        const oldSig = prev.statuses.get(file.path);
        if (oldSig !== undefined && oldSig !== sig) {
          changedPaths.push(file.path);
        } else if (oldSig === undefined && prev.statuses.size > 0) {
          changedPaths.push(file.path);
        }
      }
    }

    prevGitStatusRef.current = { projectId: activeProject.id, statuses: nextMap };

    if (changedPaths.length > 0) {
      setPulsingFiles((curr) => {
        const updated = new Set(curr);
        for (const p of changedPaths) updated.add(p);
        return updated;
      });
      const timer = window.setTimeout(() => {
        setPulsingFiles((curr) => {
          const updated = new Set(curr);
          for (const p of changedPaths) updated.delete(p);
          return updated;
        });
      }, 950);
      return () => window.clearTimeout(timer);
    }
  }, [activeProject, pendingSyncFiles]);

  const handleSelectProject = async (projectId: string) => {
    setActiveProjectId(projectId);
    setPendingDiff(null);
    setHighlightLine(null);
    const found = projects.find((p) => p.id === projectId);
    setActiveFilePath(found?.files[0]?.path ?? null);
    await refreshProjectData(projectId);
    if (firebaseUidRef.current) {
      updateUserProfilePrefs(firebaseUidRef.current, { activeProjectId: projectId }).catch(() => {});
      if (found) {
        syncProjectSummaryToFirestore(firebaseUidRef.current, found).catch(() => {});
      }
    }
  };

  const handleOpenFileLine = (filePath: string, line = 1) => {
    setActiveFilePath(filePath);
    setHighlightLine(line);
    setScreen('explorer');
  };

  const handleOpenCitation = (citation: CodeCitation) => {
    handleOpenFileLine(citation.filePath, citation.startLine);
  };

  const handleOpenDiff = (change: CodeChange) => {
    setActiveFilePath(change.filePath);
    setPendingDiff(change);
    setScreen('explorer');
  };

  const handleSaveFile = useCallback(
    async (filePath: string, content: string) => {
      if (!activeProject) return;

      // Intercept local code save operations when offline and route through IndexedDB
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        const updatedProject = await offlineSaveFile(
          activeProject.id,
          filePath,
          content,
          activeProject
        );
        const localFindings = scanOfflineSecurityFindings(updatedProject);
        setProjects((prev) =>
          dedupeById(prev.map((p) => (p.id === updatedProject.id ? updatedProject : p)))
        );
        setSecurityFindings(dedupeById(localFindings));
        setPendingSyncFiles((prev) => {
          const next = new Set(prev);
          next.add(`${activeProject.id}:${filePath}`);
          return next;
        });
        showToast(`Saved ${filePath} offline (pending-sync).`);
        return;
      }

      const res = await devmindApi.saveFile(activeProject.id, filePath, content);
      setProjects((prev) => dedupeById(prev.map((p) => (p.id === res.project.id ? res.project : p))));
      setPendingSyncFiles((prev) => {
        const key = `${activeProject.id}:${filePath}`;
        if (!prev.has(key)) return prev;
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
      const [secRes, extRes] = await Promise.all([
        devmindApi.getSecurityFindings(activeProject.id),
        devmindApi.getExtensionsHost(activeProject.id),
      ]);
      setSecurityFindings(dedupeById(secRes.findings));
      setExtensionHost(extRes.host);
      if (firebaseUidRef.current) {
        syncProjectSummaryToFirestore(firebaseUidRef.current, res.project).catch(() => {});
      }
    },
    [activeProject, showToast]
  );

  const handleCreateFile = async (filePath: string, content: string) => {
    if (!activeProject) return;
    await handleSaveFile(filePath, content);
    setActiveFilePath(filePath);
    showToast(`Created ${filePath}`);
  };

  const handleDeleteFile = async (filePath: string) => {
    if (!activeProject) return;
    const res = await devmindApi.deleteFile(activeProject.id, filePath);
    setProjects((prev) => dedupeById(prev.map((p) => (p.id === res.project.id ? res.project : p))));
    setActiveFilePath(res.project.files[0]?.path ?? null);
    const extRes = await devmindApi.getExtensionsHost(activeProject.id);
    setExtensionHost(extRes.host);
    showToast(`Deleted ${filePath}`);
  };

  const handleReindex = async () => {
    if (!activeProject) return;
    const res = await devmindApi.reindexProject(activeProject.id);
    setProjects((prev) => dedupeById(prev.map((p) => (p.id === res.project.id ? res.project : p))));
    const extRes = await devmindApi.getExtensionsHost(activeProject.id);
    setExtensionHost(extRes.host);
    if (firebaseUidRef.current) {
      syncProjectSummaryToFirestore(firebaseUidRef.current, res.project).catch(() => {});
    }
    showToast(`Re-indexed ${res.project.architecture.totalSymbols} symbols.`);
  };

  const handleCreateProject = async (body: {
    name: string;
    description: string;
    localPath: string;
    files: Array<{ path: string; content: string }>;
  }) => {
    const res = await devmindApi.createProject(body);
    setProjects((prev) => dedupeById([res.project, ...prev]));
    setActiveProjectId(res.project.id);
    setActiveFilePath(res.project.files[0]?.path ?? null);
    await refreshProjectData(res.project.id);
    if (firebaseUidRef.current) {
      syncProjectSummaryToFirestore(firebaseUidRef.current, res.project).catch(handleCloudError);
      updateUserProfilePrefs(firebaseUidRef.current, { activeProjectId: res.project.id }).catch(() => {});
    }
    setScreen('explorer');
    showToast(`Imported repository "${res.project.name}" and synced to Firestore.`);
  };

  // Extension Host Handlers (synced to Firestore per user)
  const persistExtSnapshot = (host: ExtensionHostSnapshot, ids: string[]) => {
    const uid = firebaseUidRef.current;
    if (!uid) return;
    for (const id of ids) {
      const rec = host.extensions.find((e) => e.manifest.id === id);
      if (rec) {
        syncExtensionPrefToFirestore(uid, rec).catch(handleCloudError);
      }
    }
  };

  const handleInstallExtension = async (extensionId: string) => {
    const res = await devmindApi.installExtension(extensionId, activeProject?.id);
    setExtensionHost(res.host);
    persistExtSnapshot(res.host, res.installedIds.length ? res.installedIds : [extensionId]);
    showToast(`Installed ${res.installedIds.join(', ')}`);
  };

  const handleUninstallExtension = async (extensionId: string, cascade = false) => {
    const res = await devmindApi.uninstallExtension(extensionId, cascade, activeProject?.id);
    setExtensionHost(res.host);
    persistExtSnapshot(res.host, res.uninstalledIds.length ? res.uninstalledIds : [extensionId]);
    showToast(`Uninstalled ${res.uninstalledIds.join(', ')}`);
  };

  const handleToggleExtension = async (extensionId: string, enabled: boolean) => {
    const res = await devmindApi.toggleExtension(extensionId, enabled, activeProject?.id);
    setExtensionHost(res.host);
    persistExtSnapshot(res.host, [extensionId]);
    showToast(`${enabled ? 'Enabled' : 'Disabled'} ${extensionId}`);
  };

  const handleActivateExtension = async (extensionId: string) => {
    const res = await devmindApi.activateExtension(extensionId, activeProject?.id);
    setExtensionHost(res.host);
    persistExtSnapshot(res.host, [extensionId]);
    showToast(`Activated ${extensionId}`);
  };

  const handleExecuteExtensionCommand = async (commandId: string, filePath?: string) => {
    if (!activeProject) return;
    const res = await devmindApi.executeExtensionCommand(
      commandId,
      activeProject.id,
      filePath || activeFile?.path
    );
    setExtensionHost(res.host);
    if (res.project) {
      setProjects((prev) => dedupeById(prev.map((p) => (p.id === res.project!.id ? res.project! : p))));
      const secRes = await devmindApi.getSecurityFindings(activeProject.id);
      setSecurityFindings(dedupeById(secRes.findings));
    }
    showToast(res.message);
  };

  // Tasks, Approvals, Debugging, Chat, Policy (with Firestore persistence)
  const handleCreateTask = async (
    title: string,
    description: string,
    executionMode: 'approval' | 'direct',
    priority: TaskPriority
  ) => {
    if (!activeProject) return;
    const res = await devmindApi.createAgentTask({
      projectId: activeProject.id,
      title,
      description,
      executionMode,
      priority,
    });
    setTasks((prev) => dedupeById([res.task, ...prev]));
    setProjects((prev) => dedupeById(prev.map((p) => (p.id === res.project.id ? res.project : p))));
    if (firebaseUidRef.current) {
      syncTaskRecordToFirestore(firebaseUidRef.current, res.task, activeProject.name).catch(handleCloudError);
    }
    const [usageRes, secRes, extRes] = await Promise.all([
      devmindApi.getUsage(),
      devmindApi.getSecurityFindings(activeProject.id),
      devmindApi.getExtensionsHost(activeProject.id),
    ]);
    setUsage(usageRes.usage);
    setSecurityFindings(dedupeById(secRes.findings));
    setExtensionHost(extRes.host);
  };

  const handleDecideApproval = async (approvalId: string, decision: 'approve' | 'reject') => {
    const res = await devmindApi.decideApproval(approvalId, decision);
    setTasks((prev) => dedupeById(prev.map((t) => (t.id === res.task.id ? res.task : t))));
    setProjects((prev) => dedupeById(prev.map((p) => (p.id === res.project.id ? res.project : p))));
    setSecurityFindings(dedupeById(res.securityFindings));
    if (firebaseUidRef.current) {
      syncTaskRecordToFirestore(firebaseUidRef.current, res.task, res.project.name).catch(() => {});
    }
    if (activeProject) {
      const extRes = await devmindApi.getExtensionsHost(activeProject.id);
      setExtensionHost(extRes.host);
    }
    showToast(decision === 'approve' ? 'Patches applied to workspace.' : 'Patch proposal rejected.');
  };

  const handleRollbackTask = async (taskId: string) => {
    const res = await devmindApi.rollbackTask(taskId);
    setTasks((prev) => dedupeById(prev.map((t) => (t.id === res.task.id ? res.task : t))));
    setProjects((prev) => dedupeById(prev.map((p) => (p.id === res.project.id ? res.project : p))));
    setSecurityFindings(dedupeById(res.securityFindings));
    if (activeProject) {
      const extRes = await devmindApi.getExtensionsHost(activeProject.id);
      setExtensionHost(extRes.host);
    }
    showToast('Restored workspace files from rollback snapshot.');
  };

  const handleCancelTask = async (taskId: string) => {
    const res = await devmindApi.cancelTask(taskId);
    setTasks((prev) => dedupeById(prev.map((t) => (t.id === res.task.id ? res.task : t))));
    if (firebaseUidRef.current && activeProject) {
      syncTaskRecordToFirestore(firebaseUidRef.current, res.task, activeProject.name).catch(() => {});
    }
  };

  const handleUpdateTaskPriority = async (taskId: string, priority: TaskPriority) => {
    const res = await devmindApi.updateTaskPriority(taskId, priority);
    setTasks((prev) => dedupeById(prev.map((t) => (t.id === res.task.id ? res.task : t))));
    if (firebaseUidRef.current) {
      updateTaskPriorityInFirestore(firebaseUidRef.current, taskId, priority).catch(handleCloudError);
    }
  };

  const handleSendChat = async (message: string) => {
    if (!activeProject) return;
    setStreamingReply(null);
    try {
      const res = await devmindApi.streamChatMessage(activeProject.id, message, (chunk) => {
        setStreamingReply((prev) => ({
          content: (prev?.content ?? '') + chunk.token,
          provenance: chunk.provenance,
          modelUsed: chunk.modelUsed,
        }));
      });
      setChatMessages(dedupeById(res.messages));
    } catch {
      // Fallback to non-streaming endpoint if SSE stream is interrupted
      const res = await devmindApi.sendChatMessage(activeProject.id, message);
      setChatMessages(dedupeById(res.messages));
    } finally {
      setStreamingReply(null);
      try {
        const usageRes = await devmindApi.getUsage();
        setUsage(usageRes.usage);
      } catch {
        // Ignore offline usage refresh failure
      }
    }
  };

  const handleChangeAiRoutingMode = async (mode: AiRoutingMode) => {
    try {
      const res = await devmindApi.updateAiRouting({ aiRoutingMode: mode });
      setSession(res.session);
      showToast(
        mode === 'local'
          ? `AI routing switched to Local Ollama (${res.session.localAi.model}).`
          : mode === 'online'
          ? `AI routing switched to Online Cloud (${res.session.llm.model}).`
          : 'AI routing switched to Auto (Online when connected, Local Ollama when offline).'
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to update AI routing mode.', 'error');
    }
  };

  const handleAnalyzeError = async (errorLog: string) => {
    if (!activeProject) return;
    const res = await devmindApi.runDebugAnalysis(activeProject.id, errorLog);
    setDebugAnalyses((prev) => dedupeById([res.analysis, ...prev]));
  };

  const handleRemediateSecurity = async (finding: SecurityFinding) => {
    if (!activeProject) return;
    await handleCreateTask(
      `Remediate ${finding.cwe} in ${finding.filePath}`,
      `Fix security finding "${finding.title}" (${finding.cwe}) at ${finding.filePath}:${finding.line}. ${finding.remediation}`,
      'approval',
      finding.severity === 'critical' || finding.severity === 'high' ? 'high' : 'medium'
    );
    setRightPanelOpen(true);
    showToast(`Created remediation task for ${finding.cwe}.`);
  };

  const handleConnectFirebase = async () => {
    if (!isOnline) {
      showToast('Internet connection is required to sign in to Firebase Cloud.', 'error');
      return;
    }
    try {
      const user = await signInWithGoogle();
      setFirebaseUser(user);
      if (session?.localProfileId) {
        const linked = await devmindApi.linkProfileToFirebase(
          session.localProfileId,
          user.uid,
          user.email ?? null
        );
        setSession(linked.session);
      }
      showToast(`Connected Firebase Cloud account (${user.email ?? user.uid}).`);
      void handleSyncOfflineQueue(true);
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Firebase Google sign-in failed or was cancelled.',
        'error'
      );
    }
  };

  const handleDisconnectFirebase = async () => {
    try {
      await signOutFirebase();
    } catch {
      // Ignore Firebase sign-out errors
    }
    setFirebaseUser(null);
    setCloudProfile(null);
    setCloudExtensions([]);
    setCloudTasks([]);
    setCloudProjects([]);
    if (session?.localProfileId) {
      try {
        const unlinked = await devmindApi.linkProfileToFirebase(
          session.localProfileId,
          null,
          null
        );
        setSession(unlinked.session);
      } catch {
        // Non-fatal
      }
    }
    showToast('Disconnected Firebase Cloud account. Continuing with Local Profile.');
  };

  const handleSwitchProfile = async () => {
    try {
      await devmindApi.logout();
    } catch {
      // Ignore logout errors
    }
    try {
      await window.devmindDesktop?.vaultDelete('active_local_profile_id');
    } catch {
      // Ignore vault deletion errors
    }
    setStoredSessionToken(null);
    setSession(null);
  };

  const handleResolveConflict = async (
    conflict: SyncConflictRecord,
    resolution: 'keep-local' | 'keep-cloud'
  ) => {
    const snap = await resolveSyncConflict(conflict, resolution, firebaseUser);
    if (activeProjectIdRef.current) {
      try {
        const taskRes = await devmindApi.listTasks(activeProjectIdRef.current);
        setTasks(dedupeById(taskRes.tasks));
      } catch {
        // Keep local tasks
      }
    }
    showToast(
      resolution === 'keep-local'
        ? `Kept local changes for "${conflict.title}" and pushed to cloud.`
        : `Accepted newer cloud version for "${conflict.title}".`
    );
    if (snap.conflicts.length === 0) {
      setConflictModalOpen(false);
    }
  };

  const handleLogout = async () => {
    try {
      await devmindApi.logout();
    } catch {
      // Ignore backend logout errors
    }
    try {
      await window.devmindDesktop?.vaultDelete('active_local_profile_id');
    } catch {
      // Ignore vault deletion errors
    }
    try {
      await signOutFirebase();
    } catch {
      // Ignore Firebase sign-out errors
    }
    setStoredSessionToken(null);
    setSession(null);
  };

  const handleToggleMaximize = async () => {
    if (window.devmindDesktop) {
      const max = await window.devmindDesktop.toggleMaximize();
      setIsMaximized(max);
      return;
    }
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
      setIsMaximized(true);
    } else {
      document.exitFullscreen?.().catch(() => {});
      setIsMaximized(false);
    }
  };

  if (booting) {
    return (
      <div className="h-screen w-screen bg-[var(--surface-chrome)] flex items-center justify-center text-xs text-[var(--ink-secondary)]">
        Starting DevMind Studio...
      </div>
    );
  }

  if (!session) {
    return (
      <LoginGate
        firebaseUser={firebaseUser}
        firebaseAuthReady={firebaseAuthReady}
        cloudProfile={cloudProfile}
        loadingProfile={loadingCloudProfile}
        onAuthenticated={(token, nextSession, profile, localProfile) => {
          setStoredSessionToken(token);
          setSession(nextSession);
          if (localProfile && !localProfile.hasPasscode && window.devmindDesktop?.vaultSet) {
            window.devmindDesktop
              .vaultSet('active_local_profile_id', localProfile.id)
              .catch(() => {});
          }
          if (profile) {
            setCloudProfile(profile);
            setTheme(profile.theme);
          }
          if (firebaseUser) {
            updateUserProfilePrefs(firebaseUser.uid, {
              preferredProvider: nextSession.llm.provider,
              preferredModel: nextSession.llm.model,
              preferredBaseUrl: nextSession.llm.baseUrl,
            }).catch(() => {});
          }
        }}
      />
    );
  }

  const openSecurityCount = securityFindings.filter((f) => f.status === 'open').length;
  const activeExtensionsCount =
    extensionHost?.extensions.filter((e) => e.state === 'active').length ?? 0;
  const errorProblemsCount =
    securityFindings.filter(
      (f) => f.status === 'open' && (f.severity === 'critical' || f.severity === 'high')
    ).length +
    (extensionHost?.diagnostics.filter((d) => d.severity === 'error').length ?? 0);
  const warningProblemsCount =
    securityFindings.filter(
      (f) => f.status === 'open' && f.severity !== 'critical' && f.severity !== 'high'
    ).length +
    (extensionHost?.diagnostics.filter((d) => d.severity === 'warning').length ?? 0);

  const cloudSyncCount = cloudExtensions.length + cloudTasks.length + cloudProjects.length;
  const firebaseStatus: FirebaseConnectionStatus = !isOnline
    ? 'offline'
    : syncSnapshot.authExpired
    ? 'reauth-required'
    : firebaseUser
    ? 'connected'
    : 'local-only';
  const accountLabel = firebaseUser?.email || session.email || session.displayName;
  const accountDisplayName = firebaseUser?.displayName || session.displayName || 'Developer';

  const workspaceNavItems: Array<{
    id: ScreenId;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: number;
  }> = [
    { id: 'explorer', label: 'Code Editor', icon: Code2 },
    { id: 'dashboard', label: 'Overview', icon: LayoutDashboard },
    { id: 'brain', label: 'Architecture', icon: GitFork },
  ];

  const intelligenceNavItems: Array<{
    id: ScreenId;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: number;
  }> = [
    {
      id: 'extensions',
      label: 'Extensions',
      icon: Blocks,
      badge: activeExtensionsCount || undefined,
    },
    { id: 'debugging', label: 'Diagnostics', icon: Bug },
    {
      id: 'security',
      label: 'Security',
      icon: ShieldAlert,
      badge: openSecurityCount || undefined,
    },
    { id: 'history', label: 'Task History', icon: History },
  ];

  const isMacPlatform =
    typeof navigator !== 'undefined' && /mac/i.test(navigator.platform || navigator.userAgent);
  const shortcutPrefix = isMacPlatform ? '⌘' : 'Ctrl+';

  return (
    <div className="h-screen w-screen flex flex-col bg-[var(--surface-canvas)] text-[var(--ink-primary)] overflow-hidden select-none">
      {/* Apple macOS Sequoia Unified Translucent Toolbar (48px) */}
      <header
        onDoubleClick={handleToggleMaximize}
        className="h-12 apple-vibrancy border-b border-[var(--border-hairline)] flex items-center justify-between px-3.5 shrink-0 win-drag-region z-30"
      >
        {/* Left: macOS Traffic Lights + Sidebar Toggle + Brand + Menu Bar */}
        <div className="flex items-center gap-2 win-no-drag">
          <div className="group flex items-center gap-2 mr-1.5">
            <button
              type="button"
              onClick={() => window.devmindDesktop?.close()}
              title="Close Window"
              aria-label="Close Window"
              className="w-3 h-3 rounded-full bg-[#FF5F57] border border-black/15 flex items-center justify-center transition-all hover:brightness-95"
            >
              <X className="w-2 h-2 text-[#4D0000] opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
            <button
              type="button"
              onClick={() => window.devmindDesktop?.minimize()}
              title="Minimize Window"
              aria-label="Minimize Window"
              className="w-3 h-3 rounded-full bg-[#FEBC2E] border border-black/15 flex items-center justify-center transition-all hover:brightness-95"
            >
              <Minus className="w-2 h-2 text-[#6B4200] opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
            <button
              type="button"
              onClick={handleToggleMaximize}
              title={isMaximized ? 'Restore Window' : 'Expand Window'}
              aria-label={isMaximized ? 'Restore Window' : 'Expand Window'}
              className="w-3 h-3 rounded-full bg-[#28C840] border border-black/15 flex items-center justify-center transition-all hover:brightness-95"
            >
              {isMaximized ? (
                <Minimize2 className="w-1.5 h-1.5 text-[#004D0E] opacity-0 group-hover:opacity-100 transition-opacity" />
              ) : (
                <Maximize2 className="w-1.5 h-1.5 text-[#004D0E] opacity-0 group-hover:opacity-100 transition-opacity" />
              )}
            </button>
          </div>

          <button
            type="button"
            onClick={() => setExplorerOpen((v) => !v)}
            title={`Toggle Sidebar (${shortcutPrefix}B)`}
            className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
              explorerOpen
                ? 'bg-[var(--surface-hover)] text-[var(--ink-primary)]'
                : 'text-[var(--ink-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--ink-primary)]'
            }`}
          >
            <PanelLeft className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-2 pl-1 pr-1">
            <img
              src="/icon.png"
              alt="DevMind Studio"
              className="w-5 h-5 rounded-[6px] object-contain shrink-0 shadow-xs"
              draggable={false}
            />
            <span className="text-[13px] font-semibold tracking-tight text-[var(--ink-primary)] hidden sm:inline">
              DevMind Studio
            </span>
          </div>

          {/* macOS Dropdown Menus */}
          <div className="hidden lg:flex items-center gap-0.5 pl-1 border-l border-[var(--border-hairline)]">
            {(
              [
                { id: 'file', label: 'File' },
                { id: 'view', label: 'View' },
                { id: 'extensions', label: 'Extensions' },
                { id: 'help', label: 'Help' },
              ] as Array<{ id: Exclude<MenuId, null>; label: string }>
            ).map((menu) => (
              <div key={menu.id} className="relative">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenMenu((prev) => (prev === menu.id ? null : menu.id));
                  }}
                  className={`h-7 px-2.5 text-xs font-medium rounded-lg transition-colors ${
                    openMenu === menu.id
                      ? 'bg-[var(--accent-soft)] text-[var(--accent-primary)]'
                      : 'text-[var(--ink-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--ink-primary)]'
                  }`}
                >
                  {menu.label}
                </button>

                {openMenu === menu.id && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="absolute left-0 top-9 w-60 rounded-xl border border-[var(--border-strong)] apple-popover p-1.5 z-50 text-xs"
                  >
                    {menu.id === 'file' && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setImportModalOpen(true);
                            setOpenMenu(null);
                          }}
                          className="w-full px-2.5 py-1.5 rounded-lg text-left hover:bg-[var(--accent-primary)] hover:text-white text-[var(--ink-primary)] transition-colors"
                        >
                          Import Repository...
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            handleReindex();
                            setOpenMenu(null);
                          }}
                          className="w-full px-2.5 py-1.5 rounded-lg text-left hover:bg-[var(--accent-primary)] hover:text-white text-[var(--ink-primary)] transition-colors"
                        >
                          Rebuild AST Index
                        </button>
                        <div className="my-1.5 border-t border-[var(--border-hairline)]" />
                        <button
                          type="button"
                          onClick={() => {
                            setOpenMenu(null);
                            void handleSwitchProfile();
                          }}
                          className="w-full px-2.5 py-1.5 rounded-lg text-left hover:bg-[var(--accent-primary)] hover:text-white text-[var(--ink-primary)] transition-colors"
                        >
                          Switch Local Profile...
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setOpenMenu(null);
                            handleLogout();
                          }}
                          className="w-full px-2.5 py-1.5 rounded-lg text-left hover:bg-[var(--status-danger)] hover:text-white text-[var(--status-danger)] transition-colors truncate"
                        >
                          Sign Out ({accountLabel})
                        </button>
                      </>
                    )}

                    {menu.id === 'view' && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setCommandPaletteOpen(true);
                            setOpenMenu(null);
                          }}
                          className="w-full px-2.5 py-1.5 rounded-lg text-left hover:bg-[var(--accent-primary)] hover:text-white flex items-center justify-between transition-colors"
                        >
                          <span>Spotlight Command Palette</span>
                          <span className="font-mono text-[10px] opacity-75">{shortcutPrefix}K</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setExplorerOpen((v) => !v);
                            setOpenMenu(null);
                          }}
                          className="w-full px-2.5 py-1.5 rounded-lg text-left hover:bg-[var(--accent-primary)] hover:text-white flex items-center justify-between transition-colors"
                        >
                          <span>Toggle Sidebar</span>
                          <span className="font-mono text-[10px] opacity-75">{shortcutPrefix}B</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setBottomPanelCollapsed((v) => !v);
                            setOpenMenu(null);
                          }}
                          className="w-full px-2.5 py-1.5 rounded-lg text-left hover:bg-[var(--accent-primary)] hover:text-white flex items-center justify-between transition-colors"
                        >
                          <span>Toggle Console</span>
                          <span className="font-mono text-[10px] opacity-75">{shortcutPrefix}J</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setRightPanelOpen((v) => !v);
                            setOpenMenu(null);
                          }}
                          className="w-full px-2.5 py-1.5 rounded-lg text-left hover:bg-[var(--accent-primary)] hover:text-white transition-colors"
                        >
                          Toggle Inspector Panel
                        </button>
                        <div className="my-1.5 border-t border-[var(--border-hairline)]" />
                        <button
                          type="button"
                          onClick={() => {
                            handleThemeChange(theme === 'dark' ? 'light' : 'dark');
                            setOpenMenu(null);
                          }}
                          className="w-full px-2.5 py-1.5 rounded-lg text-left hover:bg-[var(--accent-primary)] hover:text-white transition-colors"
                        >
                          Switch to {theme === 'dark' ? 'Light' : 'Dark'} Appearance
                        </button>
                      </>
                    )}

                    {menu.id === 'extensions' && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setScreen('extensions');
                            setOpenMenu(null);
                          }}
                          className="w-full px-2.5 py-1.5 rounded-lg text-left hover:bg-[var(--accent-primary)] hover:text-white transition-colors"
                        >
                          Open Extensions Marketplace
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            const res = await devmindApi.getExtensionsHost(activeProject?.id);
                            setExtensionHost(res.host);
                            setOpenMenu(null);
                            showToast('Refreshed Extension Host.');
                          }}
                          className="w-full px-2.5 py-1.5 rounded-lg text-left hover:bg-[var(--accent-primary)] hover:text-white transition-colors"
                        >
                          Refresh Extension Host
                        </button>
                        {(extensionHost?.activeCommands.length ?? 0) > 0 && (
                          <>
                            <div className="my-1.5 border-t border-[var(--border-hairline)]" />
                            {extensionHost!.activeCommands.slice(0, 5).map((cmd) => (
                              <button
                                key={cmd.id}
                                type="button"
                                onClick={() => {
                                  handleExecuteExtensionCommand(cmd.id);
                                  setOpenMenu(null);
                                }}
                                className="w-full px-2.5 py-1.5 rounded-lg text-left hover:bg-[var(--accent-primary)] hover:text-white truncate transition-colors"
                              >
                                {cmd.title}
                              </button>
                            ))}
                          </>
                        )}
                      </>
                    )}

                    {menu.id === 'help' && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setShortcutsHelpOpen(true);
                            setOpenMenu(null);
                          }}
                          className="w-full px-2.5 py-1.5 rounded-lg text-left hover:bg-[var(--accent-primary)] hover:text-white flex items-center justify-between transition-colors"
                        >
                          <span>Keyboard Shortcuts</span>
                          <span className="font-mono text-[10px] opacity-75">{shortcutPrefix}/</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setScreen('settings');
                            setOpenMenu(null);
                          }}
                          className="w-full px-2.5 py-1.5 rounded-lg text-left hover:bg-[var(--accent-primary)] hover:text-white transition-colors"
                        >
                          Settings &amp; Windows .exe Builder
                        </button>
                        <div className="px-2.5 py-1.5 text-[11px] font-mono text-[var(--ink-muted)]">
                          Core Engine v{extensionHost?.engineVersion || '2.1.0'} · MIT
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Center: macOS Spotlight Search Pill */}
        <button
          type="button"
          onClick={() => setCommandPaletteOpen(true)}
          className="win-no-drag hidden md:flex items-center justify-between gap-3 h-8 w-[290px] lg:w-[370px] px-3 rounded-lg bg-[var(--surface-hover)] hover:bg-[var(--surface-elevated)] border border-[var(--border-hairline)] text-xs text-[var(--ink-secondary)] transition-all"
        >
          <span className="inline-flex items-center gap-2 truncate">
            <Search className="w-3.5 h-3.5 text-[var(--ink-muted)] shrink-0" />
            <span className="truncate">
              {activeProject ? `${activeProject.name} — Search workspace...` : 'Search files, symbols, commands...'}
            </span>
          </span>
          <span className="font-mono text-[10px] text-[var(--ink-muted)] px-1.5 py-0.5 rounded bg-[var(--surface-canvas)]/70 border border-[var(--border-hairline)] shrink-0">
            {shortcutPrefix}K
          </span>
        </button>

        {/* Right: Repository Switcher + Panel Toggles + Theme + Account */}
        <div className="flex items-center gap-1.5 win-no-drag">
          <select
            aria-label="Active repository"
            value={activeProject?.id || ''}
            onChange={(e) => handleSelectProject(e.target.value)}
            className="h-7 max-w-[150px] px-2.5 text-xs font-medium rounded-lg bg-[var(--surface-elevated)] border border-[var(--border-hairline)] text-[var(--ink-primary)] focus:border-[var(--accent-primary)]"
          >
            {dedupeById(projects).map((proj) => (
              <option key={proj.id} value={proj.id}>
                {proj.name}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-0.5 pl-1 border-l border-[var(--border-hairline)]">
            <button
              type="button"
              onClick={() => setBottomPanelCollapsed((v) => !v)}
              title={`Toggle Console (${shortcutPrefix}J)`}
              className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
                !bottomPanelCollapsed
                  ? 'bg-[var(--surface-hover)] text-[var(--ink-primary)]'
                  : 'text-[var(--ink-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--ink-primary)]'
              }`}
            >
              <PanelBottom className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => setRightPanelOpen((v) => !v)}
              title="Toggle Inspector Panel"
              className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
                rightPanelOpen
                  ? 'bg-[var(--surface-hover)] text-[var(--ink-primary)]'
                  : 'text-[var(--ink-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--ink-primary)]'
              }`}
            >
              <PanelRight className="w-4 h-4" />
            </button>
          </div>

          <PWAInstallButton />

          <button
            type="button"
            onClick={() => setShortcutsHelpOpen(true)}
            title={`Keyboard Shortcuts Help (${shortcutPrefix}/ or ?)`}
            className={`h-7 px-2 rounded-lg inline-flex items-center gap-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              shortcutsHelpOpen
                ? 'bg-[var(--accent-soft)] text-[var(--accent-primary)]'
                : 'text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:bg-[var(--surface-hover)]'
            }`}
          >
            <HelpCircle className="w-3.5 h-3.5 shrink-0" />
            <span>Help</span>
          </button>

          <button
            type="button"
            onClick={() => handleThemeChange(theme === 'dark' ? 'light' : 'dark')}
            title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} appearance (${shortcutPrefix}Shift+L)`}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:bg-[var(--surface-hover)] transition-colors"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          {/* Authenticated User / Local Profile Avatar */}
          <button
            type="button"
            onClick={() => setScreen('settings')}
            className="hidden sm:flex items-center gap-1.5 pl-1 pr-1.5 h-7 rounded-lg hover:bg-[var(--surface-hover)] transition-colors"
            title={
              firebaseUser
                ? `Local Profile: ${session.displayName} · Firebase Cloud: ${firebaseUser.email}`
                : `Local Profile: ${session.displayName} (Offline-First Local Mode)`
            }
          >
            {firebaseUser?.photoURL ? (
              <img
                src={firebaseUser.photoURL}
                alt={accountDisplayName}
                referrerPolicy="no-referrer"
                className="w-6 h-6 rounded-full border border-[var(--border-hairline)]"
              />
            ) : (
              <span className="w-6 h-6 rounded-full bg-[var(--accent-soft)] text-[var(--accent-primary)] flex items-center justify-center text-[11px] font-semibold">
                {accountDisplayName.charAt(0).toUpperCase()}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={handleLogout}
            title="Sign Out"
            className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--ink-secondary)] hover:text-[var(--status-danger)] hover:bg-[var(--surface-hover)] transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* Main Apple Desktop Split View */}
      <div className="flex-1 flex min-h-0 overflow-hidden select-text">
        {/* Unified macOS Source List Sidebar (244px, collapsible) */}
        {explorerOpen && (
          <aside className="w-[244px] shrink-0 bg-[var(--surface-sidebar)] border-r border-[var(--border-hairline)] flex flex-col overflow-hidden select-none">
            {/* Grouped Navigation */}
            <nav aria-label="Primary workspace navigation" className="p-2.5 space-y-3.5 shrink-0">
              <div className="space-y-0.5">
                <div className="px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-[0.07em] text-[var(--ink-muted)]">
                  Workspace
                </div>
                {workspaceNavItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = screen === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setScreen(item.id)}
                      className={`w-full h-8 px-2.5 rounded-lg flex items-center justify-between gap-2 text-[12.5px] transition-colors ${
                        isActive
                          ? 'bg-[var(--accent-soft)] text-[var(--accent-primary)] font-semibold'
                          : 'text-[var(--ink-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--ink-primary)] font-medium'
                      }`}
                    >
                      <span className="inline-flex items-center gap-2.5 truncate">
                        <Icon className="w-4 h-4 shrink-0" />
                        <span className="truncate">{item.label}</span>
                      </span>
                      {item.badge !== undefined && item.badge > 0 && (
                        <span className="font-mono text-[11px] tabular-nums opacity-80">
                          {item.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="space-y-0.5">
                <div className="px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-[0.07em] text-[var(--ink-muted)]">
                  Intelligence
                </div>
                {intelligenceNavItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = screen === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setScreen(item.id)}
                      className={`w-full h-8 px-2.5 rounded-lg flex items-center justify-between gap-2 text-[12.5px] transition-colors ${
                        isActive
                          ? 'bg-[var(--accent-soft)] text-[var(--accent-primary)] font-semibold'
                          : 'text-[var(--ink-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--ink-primary)] font-medium'
                      }`}
                    >
                      <span className="inline-flex items-center gap-2.5 truncate">
                        <Icon className="w-4 h-4 shrink-0" />
                        <span className="truncate">{item.label}</span>
                      </span>
                      {item.badge !== undefined && item.badge > 0 && (
                        <span className="font-mono text-[11px] tabular-nums opacity-80">
                          {item.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </nav>

            {/* Integrated Project Explorer Tree */}
            <div className="flex-1 min-h-0 flex flex-col border-t border-[var(--border-hairline)]">
              <div className="px-3.5 py-2 flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-[0.07em] text-[var(--ink-muted)] truncate">
                  {activeProject?.name || 'Files'}
                </span>
                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={handleReindex}
                    title="Rebuild AST index"
                    className="w-6 h-6 rounded-md flex items-center justify-center text-[var(--ink-muted)] hover:text-[var(--ink-primary)] hover:bg-[var(--surface-hover)] transition-colors"
                  >
                    <RefreshCw className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setImportModalOpen(true)}
                    title="Import repository"
                    className="w-6 h-6 rounded-md flex items-center justify-center text-[var(--ink-muted)] hover:text-[var(--ink-primary)] hover:bg-[var(--surface-hover)] transition-colors"
                  >
                    <FolderGit2 className="w-3 h-3" />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-0.5">
                {activeProject?.files.map((f) => {
                  const isSelected = activeFile?.path === f.path && screen === 'explorer';
                  const fileIssueCount =
                    securityFindings.filter((s) => s.filePath === f.path && s.status === 'open').length +
                    (extensionHost?.diagnostics.filter((d) => d.filePath === f.path).length ?? 0);

                  const isPendingFile =
                    Boolean(activeProject && pendingSyncFiles.has(`${activeProject.id}:${f.path}`)) ||
                    f.syncStatus === 'pending-sync';
                  const isPulsing = pulsingFiles.has(f.path);
                  return (
                    <button
                      key={f.path}
                      type="button"
                      onClick={() => {
                        setActiveFilePath(f.path);
                        setHighlightLine(null);
                        setPendingDiff(null);
                        setScreen('explorer');
                      }}
                      className={`file-tree-item w-full px-2.5 py-1.5 rounded-lg text-left flex items-center justify-between gap-2 text-xs transition-colors ${
                        isSelected
                          ? 'bg-[var(--surface-elevated)] text-[var(--ink-primary)] font-medium shadow-xs'
                          : 'text-[var(--ink-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--ink-primary)]'
                      } ${isPulsing ? 'file-tree-git-pulse' : ''}`}
                    >
                      <span className="inline-flex items-center gap-2 min-w-0">
                        <FileCode2
                          className={`w-3.5 h-3.5 shrink-0 ${
                            isSelected ? 'text-[var(--accent-primary)]' : 'text-[var(--ink-muted)]'
                          }`}
                        />
                        <span className="truncate font-mono text-[11px]">{f.path}</span>
                      </span>
                      <span className="flex items-center gap-1.5 shrink-0 font-mono text-[10px]">
                        {isPendingFile && (
                          <span
                            className={`px-1.5 py-0.5 rounded-md bg-[var(--status-warning)]/15 text-[var(--status-warning)] text-[9px] font-medium ${
                              isPulsing ? 'git-badge-pulse' : ''
                            }`}
                            title="Saved locally in IndexedDB — pending sync when online"
                          >
                            pending-sync
                          </span>
                        )}
                        {f.gitStatus === 'modified' && !isPendingFile && (
                          <span
                            className={`text-[var(--status-warning)] font-semibold ${
                              isPulsing ? 'git-badge-pulse' : ''
                            }`}
                            title="Git status: Modified"
                          >
                            M
                          </span>
                        )}
                        {f.gitStatus === 'added' && !isPendingFile && (
                          <span
                            className={`text-[var(--status-success)] font-semibold ${
                              isPulsing ? 'git-badge-pulse' : ''
                            }`}
                            title="Git status: Added"
                          >
                            A
                          </span>
                        )}
                        {fileIssueCount > 0 && (
                          <span className="text-[var(--status-danger)] tabular-nums">{fileIssueCount}</span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Compact Outline Symbols */}
              {screen === 'explorer' && activeFile && activeProject && (
                <div className="border-t border-[var(--border-hairline)] max-h-[140px] flex flex-col">
                  <div className="px-3.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.07em] text-[var(--ink-muted)]">
                    Outline
                  </div>
                  <div className="overflow-y-auto px-2 pb-1.5 space-y-0.5">
                    {activeProject.symbols
                      .filter((s) => s.filePath === activeFile.path)
                      .slice(0, 10)
                      .map((sym) => (
                        <button
                          key={sym.id}
                          type="button"
                          onClick={() => setHighlightLine(sym.startLine)}
                          className="w-full px-2.5 py-1 rounded-md text-left hover:bg-[var(--surface-hover)] flex items-center justify-between gap-2 text-[11px] transition-colors"
                        >
                          <span className="font-mono text-[var(--ink-secondary)] truncate">{sym.name}</span>
                          <span className="font-mono text-[10px] text-[var(--ink-muted)] tabular-nums">
                            :{sym.startLine}
                          </span>
                        </button>
                      ))}
                  </div>
                </div>
              )}
            </div>

            {/* Pinned Settings Footer */}
            <div className="p-2 border-t border-[var(--border-hairline)] shrink-0">
              <button
                type="button"
                onClick={() => setScreen('settings')}
                className={`w-full h-8 px-2.5 rounded-lg flex items-center justify-between gap-2 text-[12.5px] transition-colors ${
                  screen === 'settings'
                    ? 'bg-[var(--accent-soft)] text-[var(--accent-primary)] font-semibold'
                    : 'text-[var(--ink-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--ink-primary)] font-medium'
                }`}
              >
                <span className="inline-flex items-center gap-2.5">
                  <Settings className="w-4 h-4 shrink-0" />
                  <span>Settings</span>
                </span>
                <span className="text-[10px] font-mono text-[var(--ink-muted)]">v2.1</span>
              </button>
            </div>
          </aside>
        )}

        {/* Center Workbench + Bottom Panel */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <main className="flex-1 min-h-0 overflow-hidden">
            {screen === 'explorer' && (
              <CodeEditorView
                file={activeFile}
                highlightLine={highlightLine}
                pendingDiff={pendingDiff}
                isPendingSync={Boolean(
                  activeProject &&
                    activeFile &&
                    (pendingSyncFiles.has(`${activeProject.id}:${activeFile.path}`) ||
                      activeFile.syncStatus === 'pending-sync')
                )}
                securityFindings={securityFindings}
                extensionDiagnostics={extensionHost?.diagnostics ?? []}
                activeCommands={extensionHost?.activeCommands ?? []}
                onSaveFile={handleSaveFile}
                onCreateFile={handleCreateFile}
                onDeleteFile={handleDeleteFile}
                onRunExtensionCommand={handleExecuteExtensionCommand}
                onCursorChange={setCursorPos}
                onClearDiff={() => setPendingDiff(null)}
              />
            )}

            {screen === 'extensions' && (
              <ExtensionsView
                host={extensionHost}
                activeProjectId={activeProject?.id || ''}
                activeFilePath={activeFile?.path ?? null}
                onInstall={handleInstallExtension}
                onUninstall={handleUninstallExtension}
                onToggle={handleToggleExtension}
                onActivate={handleActivateExtension}
                onExecuteCommand={handleExecuteExtensionCommand}
                onRefresh={async () => {
                  const res = await devmindApi.getExtensionsHost(activeProject?.id);
                  setExtensionHost(res.host);
                }}
              />
            )}

            {screen === 'dashboard' && (
              <DashboardView
                projects={projects}
                activeProject={activeProject}
                tasks={tasks}
                securityFindings={securityFindings}
                extensionHost={extensionHost}
                usage={usage}
                onSelectProject={handleSelectProject}
                onNavigate={setScreen}
                onOpenImportModal={() => setImportModalOpen(true)}
                onReindex={handleReindex}
                onExecuteExtensionCommand={handleExecuteExtensionCommand}
                onOpenFileLine={handleOpenFileLine}
                onOpenAgentPanel={() => setRightPanelOpen(true)}
                onDecideApproval={handleDecideApproval}
                onCancelTask={handleCancelTask}
              />
            )}

            {screen === 'brain' && (
              <RepoBrainView
                project={activeProject}
                onSearch={async (q) => {
                  if (!activeProject) return [];
                  const res = await devmindApi.searchRepo(activeProject.id, q);
                  return res.hits;
                }}
                onReindex={handleReindex}
                onOpenFileLine={handleOpenFileLine}
              />
            )}

            {screen === 'debugging' && (
              <DebuggingCenterView
                analyses={debugAnalyses}
                diagnostics={extensionHost?.diagnostics ?? []}
                securityFindings={securityFindings}
                onAnalyzeError={handleAnalyzeError}
                onFixWithAgent={async (prompt) => {
                  await handleCreateTask('Fix Diagnosed Root Cause', prompt, 'approval', 'high');
                  setRightPanelOpen(true);
                  showToast('Dispatched root-cause patch task.');
                }}
                onOpenCitation={handleOpenCitation}
              />
            )}

            {screen === 'security' && (
              <SecurityCenterView
                findings={securityFindings}
                usage={usage}
                onRemediateWithAgent={handleRemediateSecurity}
                onOpenFileLine={handleOpenFileLine}
              />
            )}

            {screen === 'history' && (
              <ExecutionHistoryView
                tasks={tasks}
                onOpenDiff={handleOpenDiff}
                onRollbackTask={handleRollbackTask}
                onUpdateTaskPriority={handleUpdateTaskPriority}
              />
            )}

            {screen === 'settings' && (
              <SettingsPolicyView
                session={session}
                policies={policies}
                presets={presets}
                usage={usage}
                theme={theme}
                isOnline={isOnline}
                firebaseStatus={firebaseStatus}
                firebaseEmail={firebaseUser?.email ?? null}
                syncStatus={syncSnapshot.status}
                pendingSyncCount={syncSnapshot.pendingCount}
                conflictCount={syncSnapshot.conflicts.length}
                lastSyncedAt={syncSnapshot.lastSyncedAt}
                onSyncNow={() => void handleSyncOfflineQueue(true)}
                onOpenConflicts={() => setConflictModalOpen(true)}
                onConnectFirebase={() => void handleConnectFirebase()}
                onDisconnectFirebase={() => void handleDisconnectFirebase()}
                onSwitchProfile={() => void handleSwitchProfile()}
                onThemeChange={handleThemeChange}
                onSessionUpdated={(nextSession) => {
                  setSession(nextSession);
                  if (firebaseUidRef.current) {
                    updateUserProfilePrefs(firebaseUidRef.current, {
                      preferredProvider: nextSession.llm.provider,
                      preferredModel: nextSession.llm.model,
                      preferredBaseUrl: nextSession.llm.baseUrl,
                    }).catch(() => {});
                  }
                }}
                onUpdatePolicy={async (actionType, level: PermissionLevel) => {
                  const res = await devmindApi.updatePolicy(actionType, level);
                  setPolicies(res.policies);
                }}
                onUpdateBudget={async (budgetUsd, tokenLimit) => {
                  const res = await devmindApi.updateBudget(budgetUsd, tokenLimit);
                  setUsage(res.usage);
                  if (firebaseUidRef.current) {
                    updateUserProfilePrefs(firebaseUidRef.current, {
                      monthlyBudgetUsd: budgetUsd,
                      monthlyTokenLimit: tokenLimit,
                    }).catch(handleCloudError);
                  }
                }}
              />
            )}
          </main>

          <BottomWorkbenchPanel
            diagnostics={extensionHost?.diagnostics ?? []}
            securityFindings={securityFindings}
            runtimeLogs={extensionHost?.runtimeLogs ?? []}
            auditLogs={auditLogs}
            activeTab={bottomTab}
            onTabChange={setBottomTab}
            collapsed={bottomPanelCollapsed}
            onToggleCollapse={() => setBottomPanelCollapsed((v) => !v)}
            onOpenFileLine={handleOpenFileLine}
          />
        </div>

        {/* Right macOS Inspector Panel */}
        {rightPanelOpen && (
          <div className="w-[340px] xl:w-[368px] shrink-0 hidden lg:block">
            <AiWorkspacePanel
              session={session}
              activeProjectName={activeProject?.name || 'Workspace'}
              tasks={tasks}
              chatMessages={chatMessages}
              streamingReply={streamingReply}
              onChangeAiRoutingMode={handleChangeAiRoutingMode}
              onCreateTask={handleCreateTask}
              onDecideApproval={handleDecideApproval}
              onRollbackTask={handleRollbackTask}
              onCancelTask={handleCancelTask}
              onSendChat={handleSendChat}
              onOpenDiff={handleOpenDiff}
              onOpenCitation={handleOpenCitation}
            />
          </div>
        )}
      </div>

      {/* Apple Xcode-Style Minimal Status Strip (28px) */}
      <footer className="h-7 apple-vibrancy border-t border-[var(--border-hairline)] px-3.5 flex items-center justify-between text-[11px] text-[var(--ink-secondary)] shrink-0 select-none">
        <div className="flex items-center gap-3 min-w-0 overflow-hidden">
          <span className="inline-flex items-center gap-1.5 font-mono text-[var(--ink-primary)] shrink-0">
            <GitBranch className="w-3 h-3 text-[var(--accent-primary)]" />
            {activeProject?.defaultBranch || 'main'}
          </span>

          <button
            type="button"
            onClick={() => {
              setBottomTab('problems');
              setBottomPanelCollapsed(false);
            }}
            className="inline-flex items-center gap-1.5 hover:text-[var(--ink-primary)] font-mono tabular-nums shrink-0"
            title="Show Problems console"
          >
            <AlertCircle className="w-3 h-3 text-[var(--status-danger)]" />
            <span>{errorProblemsCount}</span>
            <AlertTriangle className="w-3 h-3 text-[var(--status-warning)] ml-0.5" />
            <span>{warningProblemsCount}</span>
          </button>

          {(extensionHost?.statusBarItems ?? [])
            .filter((item) => item.alignment === 'left')
            .map((item) => (
              <button
                key={item.id}
                type="button"
                title={item.tooltip}
                onClick={() => {
                  if (item.commandId) {
                    handleExecuteExtensionCommand(item.commandId);
                  } else {
                    setScreen('extensions');
                  }
                }}
                className="hidden sm:inline-flex items-center px-2 h-5 rounded-md hover:bg-[var(--surface-hover)] hover:text-[var(--ink-primary)] font-mono truncate max-w-[170px] transition-colors"
              >
                {item.text}
              </button>
            ))}
        </div>

        <div className="flex items-center gap-3 shrink-0 font-mono">
          {(extensionHost?.statusBarItems ?? [])
            .filter((item) => item.alignment === 'right')
            .map((item) => (
              <button
                key={item.id}
                type="button"
                title={item.tooltip}
                onClick={() => {
                  if (item.commandId) {
                    handleExecuteExtensionCommand(item.commandId);
                  } else {
                    setScreen('extensions');
                  }
                }}
                className="hidden xl:inline-flex items-center px-2 h-5 rounded-md hover:bg-[var(--surface-hover)] hover:text-[var(--ink-primary)] transition-colors"
              >
                {item.text}
              </button>
            ))}

          {screen === 'explorer' && activeFile && (
            <span className="tabular-nums hidden md:inline">
              Ln {cursorPos.line}, Col {cursorPos.col} · {activeFile.language}
            </span>
          )}

          <button
            type="button"
            onClick={() => setScreen('settings')}
            className="hidden xl:inline-flex items-center gap-1 text-[var(--ink-muted)] hover:text-[var(--ink-primary)] transition-colors"
            title={`Local Profile: ${session.displayName} (Click to manage or switch profile)`}
          >
            <UserCheck className="w-3 h-3 text-[var(--accent-primary)]" />
            <span className="max-w-[110px] truncate">{session.displayName}</span>
          </button>

          <button
            type="button"
            onClick={() => setScreen('settings')}
            className="hidden lg:inline-flex items-center gap-1 text-[var(--ink-muted)] hover:text-[var(--ink-primary)] transition-colors"
            title={`AI Routing: ${session.aiRoutingMode.toUpperCase()} · Local Ollama: ${session.localAi.model}`}
          >
            <Cpu className="w-3 h-3 text-[var(--accent-primary)]" />
            <span>
              AI:{' '}
              {session.aiRoutingMode === 'auto'
                ? 'Auto'
                : session.aiRoutingMode === 'local'
                ? 'Local'
                : 'Online'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              if (firebaseStatus === 'reauth-required') {
                void handleConnectFirebase();
              } else {
                setScreen('settings');
              }
            }}
            className="hidden lg:inline-flex items-center gap-1 text-[var(--ink-muted)] hover:text-[var(--ink-primary)] transition-colors"
            title={
              firebaseUser
                ? `Firebase Cloud connected (${firebaseUser.email}): ${cloudProjects.length} projects, ${cloudTasks.length} tasks, ${cloudExtensions.length} extensions`
                : 'Local-Only workspace (click to connect optional Firebase Cloud sync in Settings)'
            }
          >
            {firebaseStatus === 'connected' ? (
              <Cloud className="w-3 h-3 text-[var(--accent-primary)]" />
            ) : firebaseStatus === 'local-only' ? (
              <HardDrive className="w-3 h-3 text-[var(--ink-muted)]" />
            ) : (
              <CloudOff className="w-3 h-3 text-[var(--status-warning)]" />
            )}
            <span className="tabular-nums">
              {firebaseStatus === 'connected'
                ? `Cloud (${cloudSyncCount})`
                : firebaseStatus === 'reauth-required'
                ? 'Cloud: Re-auth'
                : firebaseStatus === 'offline'
                ? 'Cloud: Offline'
                : 'Local-Only'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setScreen('extensions')}
            className="inline-flex items-center gap-1 hover:text-[var(--ink-primary)]"
            title="Open Extensions Marketplace"
          >
            <Blocks className="w-3 h-3 text-[var(--accent-primary)]" />
            <span className="tabular-nums">{activeExtensionsCount} Ext</span>
          </button>

          {syncSnapshot.conflicts.length > 0 && (
            <button
              type="button"
              onClick={() => setConflictModalOpen(true)}
              className="inline-flex items-center gap-1 text-[var(--status-warning)] hover:underline"
              title="Resolve Cloud Sync Conflicts"
            >
              <AlertTriangle className="w-3 h-3" />
              <span className="tabular-nums">Conflict ({syncSnapshot.conflicts.length})</span>
            </button>
          )}

          <button
            type="button"
            disabled={!isOnline || syncingOffline}
            onClick={() => void handleSyncOfflineQueue(true)}
            className={`hidden sm:inline-flex items-center gap-1 transition-colors ${
              syncSnapshot.status === 'Error'
                ? 'text-[var(--status-danger)]'
                : syncSnapshot.status === 'Conflict' || syncSnapshot.status === 'Offline'
                ? 'text-[var(--status-warning)]'
                : syncSnapshot.status === 'Pending' || syncSnapshot.status === 'Syncing'
                ? 'text-[var(--accent-primary)]'
                : 'text-[var(--ink-muted)] hover:text-[var(--ink-primary)]'
            }`}
            title={
              syncSnapshot.lastSyncedAt
                ? `Sync Status: ${syncSnapshot.status} · Last synced: ${new Date(
                    syncSnapshot.lastSyncedAt
                  ).toLocaleTimeString()} · Click to sync now`
                : `Sync Status: ${syncSnapshot.status} · Local stream: ${
                    sseConnected ? 'connected' : 'standby'
                  }`
            }
          >
            <RefreshCw className={`w-2.5 h-2.5 ${syncingOffline ? 'animate-spin' : ''}`} />
            <span className="tabular-nums">
              {syncSnapshot.status}
              {syncSnapshot.pendingCount > 0 ? ` (${syncSnapshot.pendingCount})` : ''}
            </span>
          </button>
        </div>
      </footer>

      {/* Apple Frosted Toast Notification */}
      {toast && (
        <div
          className={`fixed bottom-10 right-5 z-50 px-4 py-2.5 rounded-xl border apple-popover text-xs font-medium flex items-center gap-2.5 max-w-md ${
            toast.tone === 'error'
              ? 'border-[var(--status-danger)]/50 text-[var(--status-danger)]'
              : 'border-[var(--border-strong)] text-[var(--ink-primary)]'
          }`}
        >
          <span>{toast.text}</span>
          <button
            type="button"
            onClick={() => setToast(null)}
            className="w-5 h-5 rounded-full flex items-center justify-center text-[var(--ink-muted)] hover:text-[var(--ink-primary)] hover:bg-[var(--surface-hover)]"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Spotlight Command Palette & Import Repository Modals */}
      <CommandPalette
        open={commandPaletteOpen}
        project={activeProject}
        activeFilePath={activeFile?.path ?? null}
        activeCommands={extensionHost?.activeCommands ?? []}
        onClose={() => setCommandPaletteOpen(false)}
        onNavigate={setScreen}
        onOpenFile={handleOpenFileLine}
        onRunExtensionCommand={handleExecuteExtensionCommand}
        onReindex={handleReindex}
      />

      <ImportRepoModal
        open={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        onImport={handleCreateProject}
      />

      <KeyboardShortcutsModal
        open={shortcutsHelpOpen}
        isMacPlatform={isMacPlatform}
        onClose={() => setShortcutsHelpOpen(false)}
      />

      <ConflictResolutionModal
        open={conflictModalOpen}
        conflicts={syncSnapshot.conflicts}
        onClose={() => setConflictModalOpen(false)}
        onResolve={handleResolveConflict}
      />

      <OfflineIndicator
        syncStatus={syncSnapshot.status}
        syncing={syncingOffline || syncSnapshot.isSyncing}
        conflictCount={syncSnapshot.conflicts.length}
        lastError={syncSnapshot.lastError}
        authExpired={syncSnapshot.authExpired}
        onSyncNow={() => void handleSyncOfflineQueue(true)}
        onOpenConflicts={() => setConflictModalOpen(true)}
        onReconnectFirebase={() => void handleConnectFirebase()}
      />
    </div>
  );
}

export default App;
