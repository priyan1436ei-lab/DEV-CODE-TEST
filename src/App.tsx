import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  Bot,
  Bug,
  ChevronDown,
  ChevronRight,
  Cpu,
  FileCode2,
  FilePlus2,
  Folder,
  FolderPlus,
  KeyRound,
  LayoutDashboard,
  LogOut,
  PanelBottom,
  PanelLeft,
  PanelRight,
  Play,
  RefreshCw,
  Search,
  Settings,
  Shield,
  Trash2,
} from 'lucide-react';
import { AiWorkspacePanel } from './components/AiWorkspacePanel';
import { BottomSandboxPanel } from './components/BottomSandboxPanel';
import { CodeEditorView } from './components/CodeEditorView';
import { CommandPalette } from './components/CommandPalette';
import { DashboardView } from './components/DashboardView';
import { DebuggingCenterView } from './components/DebuggingCenterView';
import { ExecutionHistoryView } from './components/ExecutionHistoryView';
import { ImportRepoModal } from './components/ImportRepoModal';
import { LoginGate } from './components/LoginGate';
import { RepoBrainView } from './components/RepoBrainView';
import { SecurityCenterView } from './components/SecurityCenterView';
import { SettingsPolicyView } from './components/SettingsPolicyView';
import {
  devmindApi,
  getStoredSessionToken,
  setStoredSessionToken,
  type ProviderPreset,
} from './services/api';
import type {
  AgentTask,
  AuditLogEntry,
  ChatMessage,
  CodeChange,
  DebugAnalysis,
  LlmProviderId,
  PermissionLevel,
  PermissionPolicyRule,
  Project,
  PublicUserSession,
  ScreenId,
  SecurityFinding,
  TaskPriority,
  TestRun,
  UsageLedger,
} from './types/devmind';

interface ToastItem {
  id: string;
  message: string;
  tone: 'info' | 'success' | 'warning' | 'error';
}

export default function App() {
  // Authentication & BYOK LLM Session
  const [session, setSession] = useState<PublicUserSession | null>(null);
  const [presets, setPresets] = useState<ProviderPreset[]>([]);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [sseConnected, setSseConnected] = useState(false);

  // Core Workspace State
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string>('');
  const [tasks, setTasks] = useState<AgentTask[]>([]);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [securityFindings, setSecurityFindings] = useState<SecurityFinding[]>([]);
  const [testRuns, setTestRuns] = useState<TestRun[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [debugAnalyses, setDebugAnalyses] = useState<DebugAnalysis[]>([]);
  const [policies, setPolicies] = useState<PermissionPolicyRule[]>([]);
  const [usage, setUsage] = useState<UsageLedger | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);

  // Obsidian Studio Modern 4-Panel Resizable Layout
  const [activeScreen, setActiveScreen] = useState<ScreenId>('explorer');
  const [showExplorerDrawer, setShowExplorerDrawer] = useState(true);
  const [showRightPanel, setShowRightPanel] = useState(true);
  const [showBottomPanel, setShowBottomPanel] = useState(true);
  const [leftWidth, setLeftWidth] = useState(236);
  const [rightWidth, setRightWidth] = useState(372);
  const [bottomHeight, setBottomHeight] = useState(215);

  // Editor Tabs & Inline New File Creator
  const [openTabs, setOpenTabs] = useState<string[]>([]);
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null);
  const [highlightLine, setHighlightLine] = useState<number | null>(null);
  const [activeDiffChange, setActiveDiffChange] = useState<CodeChange | null>(null);
  const [collapsedDirs, setCollapsedDirs] = useState<Record<string, boolean>>({});
  const [creatingFile, setCreatingFile] = useState(false);
  const [newFilePath, setNewFilePath] = useState('src/newModule.ts');
  const [confirmDeleteProject, setConfirmDeleteProject] = useState(false);

  // Busy & Overlay State
  const [loadingWorkspace, setLoadingWorkspace] = useState(false);
  const [runningTests, setRunningTests] = useState(false);
  const [agentBusy, setAgentBusy] = useState(false);
  const [chatBusy, setChatBusy] = useState(false);
  const [debugBusy, setDebugBusy] = useState(false);
  const [draftTaskPrompt, setDraftTaskPrompt] = useState('');
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dragModeRef = useRef<'left' | 'right' | 'bottom' | null>(null);
  const activeProjectIdRef = useRef<string>('');

  useEffect(() => {
    activeProjectIdRef.current = activeProjectId;
  }, [activeProjectId]);

  const pushToast = useCallback((message: string, tone: ToastItem['tone'] = 'info') => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [...prev.slice(-2), { id, message, tone }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const activeProject = useMemo(
    () => projects.find((p) => p.id === activeProjectId) ?? projects[0] ?? null,
    [projects, activeProjectId]
  );

  const activeTask = useMemo(() => {
    if (!activeProject) return null;
    const projTasks = tasks.filter((t) => t.projectId === activeProject.id);
    if (activeTaskId) {
      const found = projTasks.find((t) => t.id === activeTaskId);
      if (found) return found;
    }
    return projTasks[0] ?? null;
  }, [tasks, activeTaskId, activeProject]);

  const refreshGlobalMeta = useCallback(async () => {
    const [polRes, useRes, audRes] = await Promise.all([
      devmindApi.getPolicies(),
      devmindApi.getUsage(),
      devmindApi.getAuditLogs(),
    ]);
    setPolicies(Array.isArray(polRes.policies) ? polRes.policies : []);
    if (Array.isArray(polRes.presets)) setPresets(polRes.presets);
    setUsage(useRes.usage ?? null);
    setAuditLogs(Array.isArray(audRes.auditLogs) ? audRes.auditLogs : []);
  }, []);

  const loadProjectContext = useCallback(async (projectId: string) => {
    const [secRes, testRes, chatRes, dbgRes, taskRes] = await Promise.all([
      devmindApi.getSecurityFindings(projectId),
      devmindApi.getTestRuns(projectId),
      devmindApi.getChatHistory(projectId),
      devmindApi.getDebugAnalyses(projectId),
      devmindApi.listTasks(projectId),
    ]);
    setSecurityFindings(Array.isArray(secRes.findings) ? secRes.findings : []);
    setTestRuns(Array.isArray(testRes.testRuns) ? testRes.testRuns : []);
    setChatMessages(Array.isArray(chatRes.messages) ? chatRes.messages : []);
    setDebugAnalyses(Array.isArray(dbgRes.analyses) ? dbgRes.analyses : []);
    const safeTasks = Array.isArray(taskRes.tasks) ? taskRes.tasks : [];
    setTasks(safeTasks);
    setActiveTaskId((prev) => (prev && safeTasks.some((t) => t.id === prev) ? prev : safeTasks[0]?.id ?? null));
  }, []);

  const bootstrapWorkspace = useCallback(async () => {
    setLoadingWorkspace(true);
    try {
      const [{ projects: list }] = await Promise.all([
        devmindApi.listProjects(),
        refreshGlobalMeta(),
      ]);
      const safeList = Array.isArray(list) ? list : [];
      setProjects(safeList);
      if (safeList.length > 0) {
        const first = safeList[0];
        setActiveProjectId(first.id);
        const initialFile =
          first.files.find((f) => f.path.includes('tokenService'))?.path ?? first.files[0]?.path ?? null;
        if (initialFile) {
          setOpenTabs([initialFile]);
          setActiveFilePath(initialFile);
        }
        await loadProjectContext(first.id);
      }
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Failed to load workspace', 'error');
    } finally {
      setLoadingWorkspace(false);
    }
  }, [loadProjectContext, pushToast, refreshGlobalMeta]);

  // Step 1: Load Provider Presets & Restore Existing Session if Valid
  useEffect(() => {
    (async () => {
      try {
        const { presets: pList } = await devmindApi.getPresets();
        setPresets(Array.isArray(pList) ? pList : []);
        const token = getStoredSessionToken();
        if (token) {
          try {
            const { session: restored } = await devmindApi.getSession();
            setSession(restored);
            await bootstrapWorkspace();
          } catch {
            setStoredSessionToken(null);
          }
        }
      } catch (err) {
        pushToast(err instanceof Error ? err.message : 'Server unreachable', 'error');
      } finally {
        setCheckingAuth(false);
      }
    })();
  }, [bootstrapWorkspace, pushToast]);

  // Step 2: Real-Time SSE Synchronization Subscription (with Auto-Reconnect)
  useEffect(() => {
    if (!session) return;
    let closed = false;
    let source: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (closed) return;
      source = new EventSource('/api/v1/events');

      source.onopen = () => setSseConnected(true);

      source.onmessage = async (ev) => {
        try {
          const evt = JSON.parse(ev.data) as { type: string; projectId?: string };
          if (evt.type === 'connected') {
            setSseConnected(true);
            return;
          }
          const currentId = activeProjectIdRef.current;

          if (evt.type === 'project_updated') {
            const { projects: latest } = await devmindApi.listProjects();
            if (Array.isArray(latest)) {
              setProjects(latest);
              const targetId = currentId && latest.some((p) => p.id === currentId) ? currentId : latest[0]?.id;
              if (targetId) {
                setActiveProjectId(targetId);
                const secRes = await devmindApi.getSecurityFindings(targetId);
                setSecurityFindings(Array.isArray(secRes.findings) ? secRes.findings : []);
              }
            }
          }

          if (currentId && (!evt.projectId || evt.projectId === currentId)) {
            if (evt.type === 'tests_updated') {
              const res = await devmindApi.getTestRuns(currentId);
              setTestRuns(Array.isArray(res.testRuns) ? res.testRuns : []);
            } else if (evt.type === 'task_updated') {
              const res = await devmindApi.listTasks(currentId);
              setTasks(Array.isArray(res.tasks) ? res.tasks : []);
            } else if (evt.type === 'chat_updated') {
              const res = await devmindApi.getChatHistory(currentId);
              setChatMessages(Array.isArray(res.messages) ? res.messages : []);
            } else if (evt.type === 'debug_updated') {
              const res = await devmindApi.getDebugAnalyses(currentId);
              setDebugAnalyses(Array.isArray(res.analyses) ? res.analyses : []);
            }
          }

          await refreshGlobalMeta();
        } catch {
          // Ignore malformed keepalive frames
        }
      };

      source.onerror = () => {
        setSseConnected(false);
        source?.close();
        if (!closed) {
          reconnectTimer = setTimeout(connect, 2500);
        }
      };
    };

    connect();

    return () => {
      closed = true;
      setSseConnected(false);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      source?.close();
    };
  }, [session, refreshGlobalMeta]);

  // Global Keyboard Shortcuts
  useEffect(() => {
    if (!session) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandPaletteOpen((v) => !v);
      } else if (mod && e.key.toLowerCase() === 'j') {
        e.preventDefault();
        setShowRightPanel((v) => !v);
      } else if (mod && e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setActiveScreen('brain');
      } else if (e.key === 'Escape') {
        setCommandPaletteOpen(false);
        setImportModalOpen(false);
        setCreatingFile(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [session]);

  // Panel Drag Resizing
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      const mode = dragModeRef.current;
      if (!mode) return;
      if (mode === 'left') {
        setLeftWidth(Math.min(360, Math.max(185, e.clientX - 52)));
      } else if (mode === 'right') {
        setRightWidth(Math.min(540, Math.max(300, window.innerWidth - e.clientX)));
      } else if (mode === 'bottom') {
        setBottomHeight(Math.min(420, Math.max(130, window.innerHeight - e.clientY)));
      }
    };
    const onMouseUp = () => {
      dragModeRef.current = null;
      document.body.style.cursor = '';
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  const beginDrag = (mode: 'left' | 'right' | 'bottom') => {
    dragModeRef.current = mode;
    document.body.style.cursor = mode === 'bottom' ? 'row-resize' : 'col-resize';
  };

  const handleAuthenticated = async (token: string, nextSession: PublicUserSession) => {
    setStoredSessionToken(token);
    setSession(nextSession);
    await bootstrapWorkspace();
    pushToast(
      nextSession.llm.configured
        ? `Connected to ${nextSession.llm.provider} (${nextSession.llm.model})`
        : 'Entered Local Sandbox Mode — configure your LLM anytime in Settings.',
      'success'
    );
  };

  const handleLogout = async () => {
    try {
      await devmindApi.logout();
    } catch {
      // ignore
    }
    setStoredSessionToken(null);
    setSession(null);
  };

  const handleUpdateLlm = async (input: {
    provider: LlmProviderId;
    baseUrl: string;
    model: string;
    apiKey: string;
  }) => {
    const res = await devmindApi.updateLlmConfig(input);
    setSession(res.session);
    pushToast(`Switched active LLM to ${res.session.llm.provider}/${res.session.llm.model}`, 'success');
  };

  const handleSelectProject = async (projectId: string) => {
    setActiveProjectId(projectId);
    setActiveDiffChange(null);
    setConfirmDeleteProject(false);
    const proj = projects.find((p) => p.id === projectId);
    if (proj && proj.files[0]) {
      setOpenTabs([proj.files[0].path]);
      setActiveFilePath(proj.files[0].path);
    }
    await loadProjectContext(projectId);
    pushToast(`Switched workspace to ${proj?.name ?? projectId}`, 'info');
  };

  const handleDeleteCurrentProject = async () => {
    if (!activeProject || projects.length <= 1) return;
    setConfirmDeleteProject(false);
    try {
      const res = await devmindApi.deleteProject(activeProject.id);
      const nextList = Array.isArray(res.projects) ? res.projects : [];
      setProjects(nextList);
      if (nextList[0]) {
        setActiveProjectId(nextList[0].id);
        setOpenTabs(nextList[0].files[0] ? [nextList[0].files[0].path] : []);
        setActiveFilePath(nextList[0].files[0]?.path ?? null);
        await loadProjectContext(nextList[0].id);
      }
      pushToast(`Deleted repository ${activeProject.name}`, 'info');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Failed to delete project', 'error');
    }
  };

  const handleOpenFileAtLine = (filePath: string, line?: number) => {
    setActiveDiffChange(null);
    setActiveScreen('explorer');
    setOpenTabs((prev) => (prev.includes(filePath) ? prev : [...prev, filePath]));
    setActiveFilePath(filePath);
    if (line) {
      setHighlightLine(null);
      setTimeout(() => setHighlightLine(line), 25);
    }
  };

  const handleCloseTab = (filePath: string) => {
    setOpenTabs((prev) => {
      const next = prev.filter((p) => p !== filePath);
      if (activeFilePath === filePath) {
        setActiveFilePath(next[next.length - 1] ?? null);
      }
      return next;
    });
  };

  const handleInspectDiff = (change: CodeChange) => {
    setActiveDiffChange(change);
    setActiveScreen('explorer');
  };

  const handleSaveFile = async (filePath: string, content: string, silent = false) => {
    if (!activeProject) return;
    const res = await devmindApi.saveFile(activeProject.id, filePath, content);
    setProjects((prev) => prev.map((p) => (p.id === res.project.id ? res.project : p)));
    const secRes = await devmindApi.getSecurityFindings(activeProject.id);
    setSecurityFindings(Array.isArray(secRes.findings) ? secRes.findings : []);
    await refreshGlobalMeta();
    if (!silent) {
      pushToast(`Saved & synced ${filePath}`, 'success');
    }
  };

  const handleCreateNewFile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProject || !newFilePath.trim()) return;
    const clean = newFilePath.trim().replace(/^\/+/, '');
    try {
      const res = await devmindApi.saveFile(
        activeProject.id,
        clean,
        `// ${clean}\nexport function hello(): string {\n  return 'ready';\n}\n`
      );
      setProjects((prev) => prev.map((p) => (p.id === res.project.id ? res.project : p)));
      setCreatingFile(false);
      setNewFilePath('src/newModule.ts');
      handleOpenFileAtLine(clean, 1);
      pushToast(`Created ${clean}`, 'success');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Failed to create file', 'error');
    }
  };

  const handleDeleteFile = async (filePath: string) => {
    if (!activeProject) return;
    try {
      const res = await devmindApi.deleteFile(activeProject.id, filePath);
      setProjects((prev) => prev.map((p) => (p.id === res.project.id ? res.project : p)));
      handleCloseTab(filePath);
      const secRes = await devmindApi.getSecurityFindings(activeProject.id);
      setSecurityFindings(Array.isArray(secRes.findings) ? secRes.findings : []);
      pushToast(`Deleted ${filePath}`, 'info');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Delete file failed', 'error');
    }
  };

  const handleReindex = async () => {
    if (!activeProject) return;
    const res = await devmindApi.reindexProject(activeProject.id);
    setProjects((prev) => prev.map((p) => (p.id === res.project.id ? res.project : p)));
    const secRes = await devmindApi.getSecurityFindings(activeProject.id);
    setSecurityFindings(Array.isArray(secRes.findings) ? secRes.findings : []);
    await refreshGlobalMeta();
    pushToast(
      `Indexed ${res.project.files.length} files (${res.project.symbols.length} symbols) in ${res.project.indexingDurationMs}ms`,
      'success'
    );
  };

  const handleRunSandboxTests = async (): Promise<TestRun | null> => {
    if (!activeProject) return null;
    setRunningTests(true);
    setShowBottomPanel(true);
    try {
      const res = await devmindApi.runSandboxTests(activeProject.id);
      setTestRuns((prev) => [res.testRun, ...prev.filter((r) => r.id !== res.testRun.id)]);
      await refreshGlobalMeta();
      const covSuffix = res.testRun.coverage
        ? ` · ${res.testRun.coverage.linePercent.toFixed(1)}% line coverage`
        : '';
      pushToast(
        res.testRun.status === 'passed'
          ? `Sandbox verified: ${res.testRun.passedCount}/${res.testRun.totalCount} passed${covSuffix}`
          : `Sandbox run: ${res.testRun.passedCount}/${res.testRun.totalCount} passed${covSuffix}`,
        res.testRun.status === 'passed' ? 'success' : 'warning'
      );
      return res.testRun;
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Sandbox execution failed', 'error');
      return null;
    } finally {
      setRunningTests(false);
    }
  };

  const handleStartTask = async (
    title: string,
    description: string,
    executionMode: 'approval' | 'strict_sandbox',
    priority: TaskPriority = 'medium'
  ) => {
    if (!activeProject) return;
    setAgentBusy(true);
    setShowRightPanel(true);
    try {
      const res = await devmindApi.createAgentTask({
        projectId: activeProject.id,
        title,
        description,
        executionMode,
        priority,
      });
      setTasks((prev) => [res.task, ...prev.filter((t) => t.id !== res.task.id)]);
      setActiveTaskId(res.task.id);
      setProjects((prev) => prev.map((p) => (p.id === res.project.id ? res.project : p)));
      const [testRes, secRes] = await Promise.all([
        devmindApi.getTestRuns(activeProject.id),
        devmindApi.getSecurityFindings(activeProject.id),
      ]);
      setTestRuns(Array.isArray(testRes.testRuns) ? testRes.testRuns : []);
      setSecurityFindings(Array.isArray(secRes.findings) ? secRes.findings : []);
      await refreshGlobalMeta();

      if (res.task.status === 'awaiting_approval') {
        pushToast('Approval checkpoint ready: inspect proposed diffs before applying.', 'warning');
        if (res.task.changes[0]) {
          setActiveDiffChange(res.task.changes[0]);
          setActiveScreen('explorer');
        }
      } else if (res.task.status === 'completed') {
        pushToast('Autonomous task verified and completed.', 'success');
      } else if (res.task.errorMessage) {
        pushToast(res.task.errorMessage, 'error');
      }
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Autonomous agent failed', 'error');
    } finally {
      setAgentBusy(false);
    }
  };

  const handleDecideApproval = async (approvalId: string, decision: 'approve' | 'reject') => {
    if (!activeProject) return;
    try {
      const res = await devmindApi.decideApproval(approvalId, decision);
      setTasks((prev) => prev.map((t) => (t.id === res.task.id ? res.task : t)));
      setProjects((prev) => prev.map((p) => (p.id === res.project.id ? res.project : p)));
      setSecurityFindings(Array.isArray(res.securityFindings) ? res.securityFindings : []);
      const testRes = await devmindApi.getTestRuns(activeProject.id);
      setTestRuns(Array.isArray(testRes.testRuns) ? testRes.testRuns : []);
      await refreshGlobalMeta();

      if (decision === 'reject') {
        pushToast('Proposed changes rejected. Workspace untouched.', 'info');
      } else if (res.task.status === 'completed') {
        setShowBottomPanel(true);
        pushToast('Patches applied & verified: all sandbox tests passed.', 'success');
      } else {
        setShowBottomPanel(true);
        pushToast(res.task.errorMessage || 'Sandbox verification reported failing tests.', 'warning');
      }
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Approval processing failed', 'error');
    }
  };

  const handleRollbackTask = async (taskId: string) => {
    if (!activeProject) return;
    try {
      const res = await devmindApi.rollbackTask(taskId);
      setTasks((prev) => prev.map((t) => (t.id === res.task.id ? res.task : t)));
      setProjects((prev) => prev.map((p) => (p.id === res.project.id ? res.project : p)));
      setSecurityFindings(Array.isArray(res.securityFindings) ? res.securityFindings : []);
      await refreshGlobalMeta();
      pushToast('Workspace restored from rollback snapshot.', 'success');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Rollback failed', 'error');
    }
  };

  const handleSendChat = async (message: string) => {
    if (!activeProject) return;
    setChatBusy(true);
    try {
      const res = await devmindApi.sendChatMessage(activeProject.id, message);
      setChatMessages(Array.isArray(res.messages) ? res.messages : []);
      await refreshGlobalMeta();
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Repo chat failed', 'error');
    } finally {
      setChatBusy(false);
    }
  };

  const handleRunDebugAnalysis = async (errorLog: string) => {
    if (!activeProject) return;
    setDebugBusy(true);
    try {
      const res = await devmindApi.runDebugAnalysis(activeProject.id, errorLog);
      setDebugAnalyses((prev) => [res.analysis, ...prev]);
      await refreshGlobalMeta();
      pushToast('Root-cause diagnosis completed.', 'success');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Debug analysis failed', 'error');
    } finally {
      setDebugBusy(false);
    }
  };

  const handleUpdateTaskPriority = async (taskId: string, priority: TaskPriority) => {
    try {
      const res = await devmindApi.updateTaskPriority(taskId, priority);
      setTasks((prev) => prev.map((t) => (t.id === res.task.id ? res.task : t)));
      await refreshGlobalMeta();
      pushToast(`Task priority updated to ${priority.toUpperCase()}`, 'info');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Failed to update task priority', 'error');
    }
  };

  const handleDispatchPromptToAgent = (prompt: string) => {
    setDraftTaskPrompt(prompt);
    setShowRightPanel(true);
    void handleStartTask(prompt.slice(0, 62), prompt, 'approval', 'high');
  };

  const handleLaunchMilestoneDemo = () => {
    if (!activeProject) return;
    const prompt =
      activeProject.id === 'proj-sentinel-auth'
        ? 'Analyze the entire authentication project, identify all security vulnerabilities and failing auth bugs (alg: none, timing comparison, exp=0, unsalted SHA-1, case-insensitive bearer header, token revocation, SQL interpolation, token logging), fix them, and verify all tests pass in the sandbox.'
        : 'Analyze tokenLedger.ts, fix the micro-dollar rounding precision bug and implement the 80% warning and 100% blocking budget guards so all unit tests pass in the sandbox.';
    handleDispatchPromptToAgent(prompt);
  };

  const handleCreateProject = async (input: {
    name: string;
    description: string;
    files: Array<{ path: string; content: string }>;
  }) => {
    const res = await devmindApi.createProject(input);
    setProjects((prev) => [res.project, ...prev]);
    setActiveProjectId(res.project.id);
    const firstPath = res.project.files[0]?.path ?? null;
    setOpenTabs(firstPath ? [firstPath] : []);
    setActiveFilePath(firstPath);
    await loadProjectContext(res.project.id);
    await refreshGlobalMeta();
    pushToast(`Created & indexed project ${res.project.name}`, 'success');
  };

  const handleUpdatePolicy = async (actionType: string, level: PermissionLevel) => {
    const res = await devmindApi.updatePolicy(actionType, level);
    setPolicies(Array.isArray(res.policies) ? res.policies : []);
    await refreshGlobalMeta();
    pushToast(`Updated policy for ${actionType}`, 'info');
  };

  const handleUpdateBudget = async (monthlyBudgetUsd: number, monthlyTokenLimit: number) => {
    const res = await devmindApi.updateBudget(monthlyBudgetUsd, monthlyTokenLimit);
    setUsage(res.usage);
    pushToast('Updated workspace spending guardrails.', 'success');
  };

  const groupedFiles = useMemo(() => {
    if (!activeProject || !Array.isArray(activeProject.files)) return [];
    const dirs = new Map<string, typeof activeProject.files>();
    for (const file of activeProject.files) {
      const idx = file.path.lastIndexOf('/');
      const dir = idx >= 0 ? file.path.slice(0, idx) : '(root)';
      const list = dirs.get(dir) ?? [];
      list.push(file);
      dirs.set(dir, list);
    }
    return Array.from(dirs.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [activeProject]);

  if (checkingAuth) {
    return (
      <div className="h-screen w-screen bg-[#090B10] flex flex-col items-center justify-center gap-3 text-[#A3AABF]">
        <div className="text-[16px] font-semibold text-[#E6E9F2]">DevMind AI</div>
        <div className="w-48 h-1.5 rounded-full skeleton-shimmer" />
      </div>
    );
  }

  if (!session) {
    return <LoginGate presets={presets} onAuthenticated={handleAuthenticated} />;
  }

  if (loadingWorkspace || !activeProject) {
    return (
      <div className="h-screen w-screen bg-[#090B10] flex flex-col items-center justify-center gap-3 text-[#A3AABF]">
        <div className="text-[15px] font-semibold text-[#E6E9F2]">Loading Obsidian Studio Workspace...</div>
        <div className="w-48 h-1.5 rounded-full skeleton-shimmer" />
      </div>
    );
  }

  const navItems: Array<{ id: ScreenId; label: string; icon: React.ReactNode; badge?: number }> = [
    { id: 'explorer', label: 'Code Studio', icon: <FileCode2 className="w-4 h-4" /> },
    { id: 'dashboard', label: 'Overview Dashboard', icon: <LayoutDashboard className="w-4 h-4" /> },
    { id: 'brain', label: 'Repository Brain', icon: <Cpu className="w-4 h-4" /> },
    { id: 'debugging', label: 'Debugging Center', icon: <Bug className="w-4 h-4" /> },
    {
      id: 'security',
      label: 'Security Center',
      icon: <Shield className="w-4 h-4" />,
      badge: securityFindings.length > 0 ? securityFindings.length : undefined,
    },
    {
      id: 'history',
      label: 'Execution History',
      icon: <Activity className="w-4 h-4" />,
      badge: tasks.length > 0 ? tasks.length : undefined,
    },
    { id: 'settings', label: 'BYOK LLM & Governance', icon: <Settings className="w-4 h-4" /> },
  ];

  return (
    <div className="h-screen w-screen flex flex-col bg-[#090B10] text-[#E6E9F2] overflow-hidden">
      {/* Modern Balanced Top Header */}
      <header className="h-11 px-3.5 bg-[#10131C] border-b border-[#1E2433] flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => setActiveScreen('dashboard')}
            className="flex items-center gap-2 whitespace-nowrap shrink-0"
          >
            <span className="w-6 h-6 rounded-[6px] bg-[#5B7CFF] text-[#090B10] font-bold text-[12px] flex items-center justify-center">
              D
            </span>
            <span className="text-[14px] font-bold tracking-tight text-[#E6E9F2]">DevMind AI</span>
          </button>

          <span className="text-[#2B3347]" aria-hidden="true">/</span>

          <select
            aria-label="Active workspace repository"
            value={activeProject.id}
            onChange={(e) => void handleSelectProject(e.target.value)}
            className="bg-[#090B10] border border-[#262E42] hover:border-[#3A4560] rounded-[6px] px-2.5 py-1 font-mono text-[12px] text-[#E6E9F2] outline-none max-w-[190px] truncate"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          <span className="hidden xl:inline-flex items-center gap-1.5 text-[11px] font-mono text-[#6B728A] whitespace-nowrap">
            <span
              className={`w-1.5 h-1.5 rounded-full ${sseConnected ? 'bg-[#2FD68B]' : 'bg-[#F5B642]'}`}
            />
            <span>{sseConnected ? 'Live Sync' : 'Reconnecting'}</span>
          </span>
        </div>

        {/* Center Command Palette */}
        <button
          type="button"
          onClick={() => setCommandPaletteOpen(true)}
          className="hidden md:flex items-center justify-between gap-6 w-72 lg:w-80 px-3 py-1.5 rounded-[7px] bg-[#090B10] hover:bg-[#161A26] border border-[#1E2433] text-[12px] text-[#6B728A] transition-colors whitespace-nowrap"
        >
          <span className="flex items-center gap-2">
            <Search className="w-3.5 h-3.5" />
            <span>Search files, symbols, actions...</span>
          </span>
          <span className="font-mono text-[11px] text-[#A3AABF]">Ctrl+K</span>
        </button>

        {/* Right Controls */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setActiveScreen('settings')}
            className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-mono text-[#A3AABF] hover:text-[#E6E9F2] bg-[#090B10] border border-[#1E2433] rounded-[6px] whitespace-nowrap max-w-[170px] truncate"
            title="Switch or test your connected LLM API"
          >
            <KeyRound className="w-3 h-3 text-[#5B7CFF] shrink-0" />
            <span className="truncate">
              {session.llm.configured ? `${session.llm.provider}/${session.llm.model}` : 'Set LLM API'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => void handleRunSandboxTests()}
            disabled={runningTests}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold bg-[#5B7CFF] hover:bg-[#7C96FF] disabled:opacity-60 text-[#090B10] rounded-[6px] transition-colors whitespace-nowrap"
          >
            <Play className="w-3.5 h-3.5" />
            <span>{runningTests ? 'Testing...' : 'Run Tests'}</span>
          </button>

          <div className="flex items-center gap-0.5 pl-2 border-l border-[#1E2433]">
            <button
              type="button"
              onClick={() => setShowExplorerDrawer((v) => !v)}
              title="Toggle File Explorer"
              aria-label="Toggle File Explorer"
              className={`p-1.5 rounded-[5px] transition-colors ${
                showExplorerDrawer ? 'text-[#E6E9F2] bg-[#161A26]' : 'text-[#6B728A] hover:text-[#E6E9F2]'
              }`}
            >
              <PanelLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setShowBottomPanel((v) => !v)}
              title="Toggle Sandbox Terminal"
              aria-label="Toggle Sandbox Terminal"
              className={`p-1.5 rounded-[5px] transition-colors ${
                showBottomPanel ? 'text-[#E6E9F2] bg-[#161A26]' : 'text-[#6B728A] hover:text-[#E6E9F2]'
              }`}
            >
              <PanelBottom className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setShowRightPanel((v) => !v)}
              title="Toggle AI Panel (Ctrl+J)"
              aria-label="Toggle AI Panel"
              className={`p-1.5 rounded-[5px] transition-colors ${
                showRightPanel ? 'text-[#E6E9F2] bg-[#161A26]' : 'text-[#6B728A] hover:text-[#E6E9F2]'
              }`}
            >
              <PanelRight className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => void handleLogout()}
              title={`Sign out (${session.email})`}
              aria-label="Sign out"
              className="p-1.5 rounded-[5px] text-[#6B728A] hover:text-[#FF5468] transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Studio Area: Slim Activity Rail + Explorer Drawer + Center/Bottom + Right AI */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Slim 52px Activity Rail */}
        <nav
          aria-label="Primary Workspace Navigation"
          className="w-[52px] bg-[#0D1017] border-r border-[#1E2433] flex flex-col items-center py-2.5 gap-1.5 shrink-0"
        >
          {navItems.map((item) => {
            const isActive = activeScreen === item.id;
            return (
              <button
                key={item.id}
                type="button"
                title={item.label}
                aria-label={item.label}
                onClick={() => setActiveScreen(item.id)}
                className={`relative w-9 h-9 rounded-[8px] flex items-center justify-center transition-colors ${
                  isActive
                    ? 'bg-[#5B7CFF]/20 text-[#7C96FF]'
                    : 'text-[#6B728A] hover:text-[#E6E9F2] hover:bg-[#161A26]'
                }`}
              >
                {item.icon}
                {item.badge !== undefined && (
                  <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-[#161A26] border border-[#2B3347] font-mono text-[9px] text-[#E6E9F2] flex items-center justify-center tabular-nums">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Collapsible Project File Explorer Drawer */}
        {showExplorerDrawer && (
          <>
            <aside
              style={{ width: leftWidth }}
              className="flex flex-col bg-[#10131C] border-r border-[#1E2433] shrink-0 min-h-0"
            >
              <div className="flex items-center justify-between px-3 h-10 border-b border-[#1E2433] shrink-0">
                <span className="text-[12px] font-semibold text-[#E6E9F2] truncate">
                  Explorer
                </span>
                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => setCreatingFile((v) => !v)}
                    title="New File"
                    aria-label="New File"
                    className="p-1 text-[#A3AABF] hover:text-[#E6E9F2] rounded hover:bg-[#161A26]"
                  >
                    <FilePlus2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setImportModalOpen(true)}
                    title="Import Local Repository"
                    aria-label="Import Local Repository"
                    className="p-1 text-[#A3AABF] hover:text-[#E6E9F2] rounded hover:bg-[#161A26]"
                  >
                    <FolderPlus className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleReindex()}
                    title="Re-index Repository"
                    aria-label="Re-index Repository"
                    className="p-1 text-[#A3AABF] hover:text-[#E6E9F2] rounded hover:bg-[#161A26]"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                  {projects.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteProject((v) => !v)}
                      title="Delete Active Project"
                      aria-label="Delete Active Project"
                      className="p-1 text-[#6B728A] hover:text-[#FF5468] rounded hover:bg-[#161A26]"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {confirmDeleteProject && projects.length > 1 && (
                <div className="p-2.5 border-b border-[#FF5468]/30 bg-[#FF5468]/10 space-y-2 text-[11px]">
                  <p className="text-[#E6E9F2]">
                    Delete <span className="font-mono text-[#FF5468]">{activeProject.name}</span> from workspace?
                  </p>
                  <div className="flex items-center justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteProject(false)}
                      className="px-2 py-0.5 text-[#A3AABF] hover:text-[#E6E9F2]"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDeleteCurrentProject()}
                      className="px-2 py-0.5 font-semibold bg-[#FF5468] text-[#090B10] rounded-[4px]"
                    >
                      Confirm Delete
                    </button>
                  </div>
                </div>
              )}

              {/* Inline New File Creator */}
              {creatingFile && (
                <form
                  onSubmit={(e) => void handleCreateNewFile(e)}
                  className="p-2 border-b border-[#1E2433] bg-[#0B0E14] space-y-1.5"
                >
                  <input
                    type="text"
                    value={newFilePath}
                    onChange={(e) => setNewFilePath(e.target.value)}
                    placeholder="src/helper.ts"
                    autoFocus
                    className="w-full bg-[#10131C] border border-[#5B7CFF] rounded-[5px] px-2 py-1 font-mono text-[11px] text-[#E6E9F2] outline-none"
                  />
                  <div className="flex items-center justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => setCreatingFile(false)}
                      className="text-[11px] text-[#6B728A] hover:text-[#E6E9F2]"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-2 py-0.5 text-[11px] font-semibold bg-[#5B7CFF] text-[#090B10] rounded-[4px]"
                    >
                      Create
                    </button>
                  </div>
                </form>
              )}

              {/* File Tree */}
              <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {groupedFiles.map(([dir, files]) => {
                  const collapsed = Boolean(collapsedDirs[dir]);
                  return (
                    <div key={dir}>
                      <button
                        type="button"
                        onClick={() =>
                          setCollapsedDirs((prev) => ({ ...prev, [dir]: !prev[dir] }))
                        }
                        className="w-full flex items-center gap-1.5 px-1.5 py-1 text-[12px] text-[#A3AABF] hover:text-[#E6E9F2] rounded"
                      >
                        {collapsed ? (
                          <ChevronRight className="w-3.5 h-3.5 text-[#6B728A]" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5 text-[#6B728A]" />
                        )}
                        <Folder className="w-3.5 h-3.5 text-[#5B7CFF]/80 shrink-0" />
                        <span className="font-mono text-[12px] truncate">{dir}</span>
                      </button>

                      {!collapsed && (
                        <div className="pl-4 space-y-0.5 mt-0.5">
                          {files.map((file) => {
                            const fileName = file.path.split('/').pop() ?? file.path;
                            const isSelected =
                              activeScreen === 'explorer' && activeFilePath === file.path && !activeDiffChange;
                            const issueCount = securityFindings.filter(
                              (f) => f.filePath === file.path
                            ).length;
                            return (
                              <button
                                key={file.path}
                                type="button"
                                onClick={() => handleOpenFileAtLine(file.path)}
                                className={`w-full flex items-center justify-between gap-2 px-2 py-1 rounded-[5px] text-left transition-colors ${
                                  isSelected
                                    ? 'bg-[#161A26] text-[#E6E9F2]'
                                    : 'text-[#A3AABF] hover:text-[#E6E9F2] hover:bg-[#161A26]/40'
                                }`}
                              >
                                <span className="font-mono text-[12px] truncate">{fileName}</span>
                                <span className="flex items-center gap-1.5 font-mono text-[11px] shrink-0">
                                  {file.gitStatus === 'modified' && (
                                    <span className="text-[#F5B642]" title="Modified">
                                      M
                                    </span>
                                  )}
                                  {issueCount > 0 && (
                                    <span
                                      className="text-[#FF5468] tabular-nums"
                                      title={`${issueCount} security findings`}
                                    >
                                      {issueCount}
                                    </span>
                                  )}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </aside>

            <div
              role="separator"
              aria-orientation="vertical"
              onMouseDown={() => beginDrag('left')}
              className="w-1 bg-transparent hover:bg-[#5B7CFF]/60 cursor-col-resize transition-colors shrink-0"
            />
          </>
        )}

        {/* CENTER + BOTTOM STACK */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          <main className="flex-1 min-h-0 overflow-hidden">
            {activeScreen === 'dashboard' && (
              <DashboardView
                project={activeProject}
                projects={projects}
                tasks={tasks}
                securityFindings={securityFindings}
                testRuns={testRuns}
                usage={usage}
                runningTests={runningTests}
                onSelectProject={(id) => void handleSelectProject(id)}
                onNavigate={setActiveScreen}
                onRunSandboxTests={async () => {
                  await handleRunSandboxTests();
                }}
                onLaunchMilestoneDemo={handleLaunchMilestoneDemo}
                onSelectTask={(t) => {
                  setActiveTaskId(t.id);
                  setShowRightPanel(true);
                }}
                onOpenImportModal={() => setImportModalOpen(true)}
              />
            )}

            {activeScreen === 'explorer' && (
              <CodeEditorView
                project={activeProject}
                openTabs={openTabs}
                activeFilePath={activeFilePath}
                highlightLine={highlightLine}
                activeDiffChange={activeDiffChange}
                securityFindings={securityFindings}
                onSelectTab={(p) => {
                  setActiveDiffChange(null);
                  setActiveFilePath(p);
                }}
                onCloseTab={handleCloseTab}
                onCloseDiff={() => setActiveDiffChange(null)}
                onSaveFile={handleSaveFile}
                onDeleteFile={handleDeleteFile}
                onJumpToLine={handleOpenFileAtLine}
              />
            )}

            {activeScreen === 'brain' && (
              <RepoBrainView
                project={activeProject}
                onReindex={handleReindex}
                onOpenFileAtLine={handleOpenFileAtLine}
              />
            )}

            {activeScreen === 'debugging' && (
              <DebuggingCenterView
                project={activeProject}
                analyses={debugAnalyses}
                latestTestRun={testRuns[0] ?? null}
                analyzing={debugBusy}
                onRunAnalysis={handleRunDebugAnalysis}
                onRunSandboxTests={handleRunSandboxTests}
                onOpenFileAtLine={handleOpenFileAtLine}
                onDispatchToAgent={handleDispatchPromptToAgent}
              />
            )}

            {activeScreen === 'security' && (
              <SecurityCenterView
                project={activeProject}
                findings={securityFindings}
                onRefreshScan={handleReindex}
                onOpenFileAtLine={(fp, ln) => handleOpenFileAtLine(fp, ln)}
                onRemediateWithAgent={handleDispatchPromptToAgent}
              />
            )}

            {activeScreen === 'history' && (
              <ExecutionHistoryView
                tasks={tasks}
                onSelectTask={(t) => {
                  setActiveTaskId(t.id);
                  setShowRightPanel(true);
                }}
                onInspectDiff={handleInspectDiff}
                onRollbackTask={handleRollbackTask}
                onUpdateTaskPriority={handleUpdateTaskPriority}
              />
            )}

            {activeScreen === 'settings' && (
              <SettingsPolicyView
                session={session}
                policies={policies}
                presets={presets}
                usage={usage}
                onUpdateLlm={handleUpdateLlm}
                onUpdatePolicy={handleUpdatePolicy}
                onUpdateBudget={handleUpdateBudget}
              />
            )}
          </main>

          {showBottomPanel && (
            <>
              <div
                role="separator"
                aria-orientation="horizontal"
                onMouseDown={() => beginDrag('bottom')}
                className="h-1 bg-transparent hover:bg-[#5B7CFF]/60 cursor-row-resize transition-colors shrink-0"
              />
              <div style={{ height: bottomHeight }} className="shrink-0 min-h-0">
                <BottomSandboxPanel
                  testRuns={testRuns}
                  auditLogs={auditLogs}
                  runningTests={runningTests}
                  onRunTests={async () => {
                    await handleRunSandboxTests();
                  }}
                  onClose={() => setShowBottomPanel(false)}
                />
              </div>
            </>
          )}
        </div>

        {/* RIGHT AI PANEL */}
        {showRightPanel && (
          <>
            <div
              role="separator"
              aria-orientation="vertical"
              onMouseDown={() => beginDrag('right')}
              className="w-1 bg-transparent hover:bg-[#5B7CFF]/60 cursor-col-resize transition-colors shrink-0"
            />
            <div style={{ width: rightWidth }} className="shrink-0 min-h-0">
              <AiWorkspacePanel
                project={activeProject}
                session={session}
                activeTask={activeTask}
                chatMessages={chatMessages}
                agentBusy={agentBusy}
                chatBusy={chatBusy}
                draftTaskPrompt={draftTaskPrompt}
                onDraftTaskPromptChange={setDraftTaskPrompt}
                onStartTask={handleStartTask}
                onDecideApproval={handleDecideApproval}
                onRollbackTask={handleRollbackTask}
                onSendChat={handleSendChat}
                onInspectDiff={handleInspectDiff}
                onOpenFileAtLine={handleOpenFileAtLine}
                onOpenLlmSettings={() => setActiveScreen('settings')}
              />
            </div>
          </>
        )}
      </div>

      {/* Overlays */}
      <CommandPalette
        open={commandPaletteOpen}
        project={activeProject}
        onClose={() => setCommandPaletteOpen(false)}
        onOpenFileAtLine={handleOpenFileAtLine}
        onNavigate={setActiveScreen}
        onRunSandboxTests={async () => {
          await handleRunSandboxTests();
        }}
        onLaunchMilestoneDemo={handleLaunchMilestoneDemo}
        onToggleRightPanel={() => setShowRightPanel((v) => !v)}
      />

      <ImportRepoModal
        open={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        onCreateProject={handleCreateProject}
      />

      {toasts.length > 0 && (
        <div className="fixed bottom-4 right-4 z-50 space-y-2 max-w-sm pointer-events-none">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className={`toast-animate-in pointer-events-auto px-3.5 py-2.5 rounded-[8px] bg-[#161A26] border text-[12px] text-[#E6E9F2] shadow-lg flex items-center gap-2 ${
                toast.tone === 'success'
                  ? 'border-[#2FD68B]/50'
                  : toast.tone === 'warning'
                    ? 'border-[#F5B642]/60'
                    : toast.tone === 'error'
                      ? 'border-[#FF5468]/60'
                      : 'border-[#2B3347]'
              }`}
            >
              <Bot className="w-3.5 h-3.5 text-[#5B7CFF] shrink-0" />
              <span>{toast.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
