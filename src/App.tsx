import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  Bot,
  Bug,
  ChevronDown,
  ChevronRight,
  Cpu,
  FileCode2,
  Folder,
  FolderPlus,
  LayoutDashboard,
  PanelBottom,
  PanelLeft,
  PanelRight,
  Play,
  RefreshCw,
  Search,
  Settings,
  Shield,
} from 'lucide-react';
import { AiWorkspacePanel } from './components/AiWorkspacePanel';
import { BottomSandboxPanel } from './components/BottomSandboxPanel';
import { CodeEditorView } from './components/CodeEditorView';
import { CommandPalette } from './components/CommandPalette';
import { DashboardView } from './components/DashboardView';
import { DebuggingCenterView } from './components/DebuggingCenterView';
import { ExecutionHistoryView } from './components/ExecutionHistoryView';
import { ImportRepoModal } from './components/ImportRepoModal';
import { RepoBrainView } from './components/RepoBrainView';
import { SecurityCenterView } from './components/SecurityCenterView';
import { SettingsPolicyView } from './components/SettingsPolicyView';
import { devmindApi, type ProviderInfo } from './services/api';
import type {
  AgentTask,
  AuditLogEntry,
  ChatMessage,
  CodeChange,
  DebugAnalysis,
  PermissionLevel,
  PermissionPolicyRule,
  Project,
  ScreenId,
  SecurityFinding,
  TestRun,
  UsageLedger,
} from './types/devmind';

interface ToastItem {
  id: string;
  message: string;
  tone: 'info' | 'success' | 'warning' | 'error';
}

export default function App() {
  // Core Data State
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string>('');
  const [tasks, setTasks] = useState<AgentTask[]>([]);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [securityFindings, setSecurityFindings] = useState<SecurityFinding[]>([]);
  const [testRuns, setTestRuns] = useState<TestRun[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [debugAnalyses, setDebugAnalyses] = useState<DebugAnalysis[]>([]);
  const [policies, setPolicies] = useState<PermissionPolicyRule[]>([]);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [usage, setUsage] = useState<UsageLedger | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);

  // Workspace Shell & 4-Panel Resizable State (Section 5)
  const [activeScreen, setActiveScreen] = useState<ScreenId>('dashboard');
  const [showLeftPanel, setShowLeftPanel] = useState(true);
  const [showRightPanel, setShowRightPanel] = useState(true);
  const [showBottomPanel, setShowBottomPanel] = useState(true);
  const [leftWidth, setLeftWidth] = useState(252);
  const [rightWidth, setRightWidth] = useState(386);
  const [bottomHeight, setBottomHeight] = useState(216);

  // Editor & Diff Tabs
  const [openTabs, setOpenTabs] = useState<string[]>([]);
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null);
  const [highlightLine, setHighlightLine] = useState<number | null>(null);
  const [activeDiffChange, setActiveDiffChange] = useState<CodeChange | null>(null);
  const [collapsedDirs, setCollapsedDirs] = useState<Record<string, boolean>>({});

  // Busy & Overlay State
  const [loadingBoot, setLoadingBoot] = useState(true);
  const [runningTests, setRunningTests] = useState(false);
  const [agentBusy, setAgentBusy] = useState(false);
  const [chatBusy, setChatBusy] = useState(false);
  const [debugBusy, setDebugBusy] = useState(false);
  const [draftTaskPrompt, setDraftTaskPrompt] = useState('');
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dragModeRef = useRef<'left' | 'right' | 'bottom' | null>(null);

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
    setPolicies(polRes.policies);
    setProviders(polRes.providers);
    setUsage(useRes.usage);
    setAuditLogs(audRes.auditLogs);
  }, []);

  const loadProjectContext = useCallback(async (projectId: string) => {
    const [secRes, testRes, chatRes, dbgRes, taskRes] = await Promise.all([
      devmindApi.getSecurityFindings(projectId),
      devmindApi.getTestRuns(projectId),
      devmindApi.getChatHistory(projectId),
      devmindApi.getDebugAnalyses(projectId),
      devmindApi.listTasks(projectId),
    ]);
    setSecurityFindings(secRes.findings);
    setTestRuns(testRes.testRuns);
    setChatMessages(chatRes.messages);
    setDebugAnalyses(dbgRes.analyses);
    setTasks(taskRes.tasks);
    setActiveTaskId(taskRes.tasks[0]?.id ?? null);
  }, []);

  // Initial Bootstrap
  useEffect(() => {
    (async () => {
      try {
        const [{ projects: list }] = await Promise.all([
          devmindApi.listProjects(),
          refreshGlobalMeta(),
        ]);
        setProjects(list);
        if (list.length > 0) {
          const first = list[0];
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
        pushToast(err instanceof Error ? err.message : 'Failed to initialize DevMind AI', 'error');
      } finally {
        setLoadingBoot(false);
      }
    })();
  }, [loadProjectContext, pushToast, refreshGlobalMeta]);

  // Global Keyboard Shortcuts (Section 5)
  useEffect(() => {
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
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Panel Drag Resizing
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      const mode = dragModeRef.current;
      if (!mode) return;
      if (mode === 'left') {
        setLeftWidth(Math.min(380, Math.max(190, e.clientX)));
      } else if (mode === 'right') {
        setRightWidth(Math.min(560, Math.max(300, window.innerWidth - e.clientX)));
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

  const handleSelectProject = async (projectId: string) => {
    setActiveProjectId(projectId);
    setActiveDiffChange(null);
    const proj = projects.find((p) => p.id === projectId);
    if (proj && proj.files[0]) {
      setOpenTabs([proj.files[0].path]);
      setActiveFilePath(proj.files[0].path);
    }
    await loadProjectContext(projectId);
    pushToast(`Switched workspace to ${proj?.name ?? projectId}`, 'info');
  };

  const handleOpenFileAtLine = (filePath: string, line?: number) => {
    setActiveDiffChange(null);
    setActiveScreen('explorer');
    setOpenTabs((prev) => (prev.includes(filePath) ? prev : [...prev, filePath]));
    setActiveFilePath(filePath);
    if (line) {
      setHighlightLine(null);
      setTimeout(() => setHighlightLine(line), 20);
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

  const handleSaveFile = async (filePath: string, content: string) => {
    if (!activeProject) return;
    const res = await devmindApi.saveFile(activeProject.id, filePath, content);
    setProjects((prev) => prev.map((p) => (p.id === res.project.id ? res.project : p)));
    const secRes = await devmindApi.getSecurityFindings(activeProject.id);
    setSecurityFindings(secRes.findings);
    await refreshGlobalMeta();
    pushToast(`Saved & re-indexed ${filePath}`, 'success');
  };

  const handleReindex = async () => {
    if (!activeProject) return;
    const res = await devmindApi.reindexProject(activeProject.id);
    setProjects((prev) => prev.map((p) => (p.id === res.project.id ? res.project : p)));
    const secRes = await devmindApi.getSecurityFindings(activeProject.id);
    setSecurityFindings(secRes.findings);
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
      setTestRuns((prev) => [res.testRun, ...prev]);
      await refreshGlobalMeta();
      pushToast(
        res.testRun.status === 'passed'
          ? `Sandbox verified: ${res.testRun.passedCount}/${res.testRun.totalCount} tests passed`
          : `Sandbox run finished: ${res.testRun.failedCount}/${res.testRun.totalCount} test(s) failed`,
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
    executionMode: 'approval' | 'strict_sandbox'
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
      });
      setTasks((prev) => [res.task, ...prev.filter((t) => t.id !== res.task.id)]);
      setActiveTaskId(res.task.id);
      setProjects((prev) => prev.map((p) => (p.id === res.project.id ? res.project : p)));
      const [testRes, secRes] = await Promise.all([
        devmindApi.getTestRuns(activeProject.id),
        devmindApi.getSecurityFindings(activeProject.id),
      ]);
      setTestRuns(testRes.testRuns);
      setSecurityFindings(secRes.findings);
      await refreshGlobalMeta();

      if (res.task.status === 'awaiting_approval') {
        pushToast('Approval checkpoint ready: review diffs before applying patches.', 'warning');
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
      setSecurityFindings(res.securityFindings);
      const testRes = await devmindApi.getTestRuns(activeProject.id);
      setTestRuns(testRes.testRuns);
      await refreshGlobalMeta();

      if (decision === 'reject') {
        pushToast('Proposed changes rejected. Workspace left untouched.', 'info');
      } else if (res.task.status === 'completed') {
        setShowBottomPanel(true);
        pushToast('Patches applied and verified: all sandbox tests passed.', 'success');
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
      setSecurityFindings(res.securityFindings);
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
      setChatMessages(res.messages);
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

  const handleDispatchPromptToAgent = (prompt: string) => {
    setDraftTaskPrompt(prompt);
    setShowRightPanel(true);
    void handleStartTask(prompt.slice(0, 62), prompt, 'approval');
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
    setPolicies(res.policies);
    await refreshGlobalMeta();
    pushToast(`Updated policy for ${actionType}`, 'info');
  };

  const handleUpdateBudget = async (monthlyBudgetUsd: number, monthlyTokenLimit: number) => {
    const res = await devmindApi.updateBudget(monthlyBudgetUsd, monthlyTokenLimit);
    setUsage(res.usage);
    pushToast('Updated workspace spending guardrails.', 'success');
  };

  // Group project files by directory for clean Left File Explorer Tree
  const groupedFiles = useMemo(() => {
    if (!activeProject) return [];
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

  if (loadingBoot || !activeProject) {
    return (
      <div className="h-screen w-screen bg-[#0D0F14] flex flex-col items-center justify-center gap-3 text-[#A3AABF]">
        <div className="text-[16px] font-semibold text-[#E6E9F2]">DevMind AI</div>
        <div className="w-48 h-1.5 rounded-full skeleton-shimmer" />
      </div>
    );
  }

  const navItems: Array<{ id: ScreenId; label: string; icon: React.ReactNode; count?: number }> = [
    { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="w-4 h-4" /> },
    { id: 'explorer', label: 'Repository Explorer', icon: <FileCode2 className="w-4 h-4" /> },
    { id: 'brain', label: 'Repository Brain', icon: <Cpu className="w-4 h-4" /> },
    { id: 'debugging', label: 'Debugging Center', icon: <Bug className="w-4 h-4" /> },
    {
      id: 'security',
      label: 'Security Center',
      icon: <Shield className="w-4 h-4" />,
      count: securityFindings.length > 0 ? securityFindings.length : undefined,
    },
    {
      id: 'history',
      label: 'Execution History',
      icon: <Activity className="w-4 h-4" />,
      count: tasks.length > 0 ? tasks.length : undefined,
    },
    { id: 'settings', label: 'Policy & Usage', icon: <Settings className="w-4 h-4" /> },
  ];

  return (
    <div className="h-screen w-screen flex flex-col bg-[#0D0F14] text-[#E6E9F2] overflow-hidden">
      {/* Top Bar (Clean Single Row) */}
      <header className="h-11 px-4 bg-[#151821] border-b border-[#262B3A] flex items-center justify-between gap-6 shrink-0">
        {/* Left: Wordmark + Project Selector */}
        <div className="flex items-center gap-4 min-w-0">
          <button
            onClick={() => setActiveScreen('dashboard')}
            className="text-[15px] font-bold tracking-tight text-[#E6E9F2] whitespace-nowrap shrink-0"
          >
            DevMind AI
          </button>

          <span className="text-[#353B50]" aria-hidden="true">/</span>

          <select
            aria-label="Active workspace repository"
            value={activeProject.id}
            onChange={(e) => void handleSelectProject(e.target.value)}
            className="bg-[#0F1117] border border-[#262B3A] hover:border-[#353B50] rounded-[6px] px-2.5 py-1 font-mono text-[12px] text-[#E6E9F2] outline-none max-w-[200px] truncate"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        {/* Center: Command Palette Trigger */}
        <button
          onClick={() => setCommandPaletteOpen(true)}
          className="hidden md:flex items-center justify-between gap-6 w-80 px-3 py-1.5 rounded-[6px] bg-[#0F1117] hover:bg-[#1C2030] border border-[#262B3A] text-[12px] text-[#6B728A] transition-colors duration-120 whitespace-nowrap"
        >
          <span className="flex items-center gap-2">
            <Search className="w-3.5 h-3.5" />
            <span>Search files, symbols, commands...</span>
          </span>
          <span className="font-mono text-[11px] text-[#A3AABF]">Ctrl+K</span>
        </button>

        {/* Right: Primary Action + Panel Toggles */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => void handleRunSandboxTests()}
            disabled={runningTests}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold bg-[#6C7BFF] hover:bg-[#8793FF] disabled:opacity-60 text-[#0D0F14] rounded-[6px] transition-colors duration-120 whitespace-nowrap"
          >
            <Play className="w-3.5 h-3.5" />
            <span>{runningTests ? 'Testing...' : 'Run Tests'}</span>
          </button>

          <div className="flex items-center gap-0.5 pl-2 border-l border-[#262B3A]">
            <button
              onClick={() => setShowLeftPanel((v) => !v)}
              title="Toggle Left Sidebar"
              aria-label="Toggle Left Sidebar"
              className={`p-1.5 rounded-[5px] transition-colors duration-120 ${
                showLeftPanel ? 'text-[#E6E9F2] bg-[#1C2030]' : 'text-[#6B728A] hover:text-[#E6E9F2]'
              }`}
            >
              <PanelLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setShowBottomPanel((v) => !v)}
              title="Toggle Bottom Sandbox Panel"
              aria-label="Toggle Bottom Sandbox Panel"
              className={`p-1.5 rounded-[5px] transition-colors duration-120 ${
                showBottomPanel ? 'text-[#E6E9F2] bg-[#1C2030]' : 'text-[#6B728A] hover:text-[#E6E9F2]'
              }`}
            >
              <PanelBottom className="w-4 h-4" />
            </button>
            <button
              onClick={() => setShowRightPanel((v) => !v)}
              title="Toggle AI Panel (Ctrl+J)"
              aria-label="Toggle AI Panel"
              className={`p-1.5 rounded-[5px] transition-colors duration-120 ${
                showRightPanel ? 'text-[#E6E9F2] bg-[#1C2030]' : 'text-[#6B728A] hover:text-[#E6E9F2]'
              }`}
            >
              <PanelRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main 4-Panel Resizable Workspace */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* LEFT PANEL: Navigation + File Explorer */}
        {showLeftPanel && (
          <>
            <aside
              style={{ width: leftWidth }}
              className="flex flex-col bg-[#151821] border-r border-[#262B3A] shrink-0 min-h-0"
            >
              {/* Navigation Tree */}
              <nav aria-label="Primary Workspace Navigation" className="p-2 space-y-0.5 border-b border-[#262B3A] shrink-0">
                {navItems.map((item) => {
                  const isActive = activeScreen === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setActiveScreen(item.id)}
                      className={`w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-[6px] text-[13px] font-medium transition-colors duration-120 whitespace-nowrap ${
                        isActive
                          ? 'bg-[#1C2030] text-[#E6E9F2]'
                          : 'text-[#A3AABF] hover:text-[#E6E9F2] hover:bg-[#1C2030]/50'
                      }`}
                    >
                      <span className="flex items-center gap-2.5 truncate">
                        <span className={isActive ? 'text-[#6C7BFF]' : 'text-[#6B728A]'}>
                          {item.icon}
                        </span>
                        <span className="truncate">{item.label}</span>
                      </span>
                      {item.count !== undefined && (
                        <span
                          className={`font-mono text-[11px] tabular-nums ${
                            item.id === 'security' ? 'text-[#FF7A45]' : 'text-[#6B728A]'
                          }`}
                        >
                          {item.count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </nav>

              {/* Repository File Tree */}
              <div className="flex-1 flex flex-col min-h-0">
                <div className="flex items-center justify-between px-3 py-2 border-b border-[#262B3A] shrink-0">
                  <span className="text-[11px] font-semibold text-[#6B728A] tracking-wide">
                    Workspace Files
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setImportModalOpen(true)}
                      title="Import Local Repository"
                      aria-label="Import Local Repository"
                      className="p-1 text-[#A3AABF] hover:text-[#E6E9F2] rounded hover:bg-[#1C2030]"
                    >
                      <FolderPlus className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => void handleReindex()}
                      title="Incremental Re-index"
                      aria-label="Incremental Re-index"
                      className="p-1 text-[#A3AABF] hover:text-[#E6E9F2] rounded hover:bg-[#1C2030]"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                  {groupedFiles.map(([dir, files]) => {
                    const collapsed = Boolean(collapsedDirs[dir]);
                    return (
                      <div key={dir}>
                        <button
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
                          <Folder className="w-3.5 h-3.5 text-[#6C7BFF]/80 shrink-0" />
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
                                  onClick={() => handleOpenFileAtLine(file.path, 1)}
                                  className={`w-full flex items-center justify-between gap-2 px-2 py-1 rounded-[5px] text-left transition-colors duration-120 ${
                                    isSelected
                                      ? 'bg-[#1C2030] text-[#E6E9F2]'
                                      : 'text-[#A3AABF] hover:text-[#E6E9F2] hover:bg-[#1C2030]/40'
                                  }`}
                                >
                                  <span className="font-mono text-[12px] truncate">{fileName}</span>
                                  <span className="flex items-center gap-1.5 font-mono text-[11px] shrink-0">
                                    {file.gitStatus === 'modified' && (
                                      <span className="text-[#F5B84B]" title="Modified">
                                        M
                                      </span>
                                    )}
                                    {issueCount > 0 && (
                                      <span className="text-[#FF5C6C] tabular-nums" title={`${issueCount} security findings`}>
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
              </div>
            </aside>

            {/* Left Resize Handle */}
            <div
              role="separator"
              aria-orientation="vertical"
              onMouseDown={() => beginDrag('left')}
              className="w-1 bg-transparent hover:bg-[#6C7BFF]/60 cursor-col-resize transition-colors duration-120 shrink-0"
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
              />
            )}

            {activeScreen === 'settings' && (
              <SettingsPolicyView
                policies={policies}
                providers={providers}
                usage={usage}
                onUpdatePolicy={handleUpdatePolicy}
                onUpdateBudget={handleUpdateBudget}
              />
            )}
          </main>

          {/* BOTTOM PANEL: Sandbox Terminal, Test Results & Audit */}
          {showBottomPanel && (
            <>
              <div
                role="separator"
                aria-orientation="horizontal"
                onMouseDown={() => beginDrag('bottom')}
                className="h-1 bg-transparent hover:bg-[#6C7BFF]/60 cursor-row-resize transition-colors duration-120 shrink-0"
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

        {/* RIGHT PANEL: AI Engineering Workspace */}
        {showRightPanel && (
          <>
            <div
              role="separator"
              aria-orientation="vertical"
              onMouseDown={() => beginDrag('right')}
              className="w-1 bg-transparent hover:bg-[#6C7BFF]/60 cursor-col-resize transition-colors duration-120 shrink-0"
            />
            <div style={{ width: rightWidth }} className="shrink-0 min-h-0">
              <AiWorkspacePanel
                project={activeProject}
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

      {/* Toast Notifications (Section 5: bottom-right, 220ms slide-in, auto-dismiss 4000ms) */}
      {toasts.length > 0 && (
        <div className="fixed bottom-4 right-4 z-50 space-y-2 max-w-sm pointer-events-none">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className={`toast-animate-in pointer-events-auto px-3.5 py-2.5 rounded-[8px] bg-[#1C2030] border text-[12px] text-[#E6E9F2] shadow-lg flex items-center gap-2 ${
                toast.tone === 'success'
                  ? 'border-[#3DD68C]/50'
                  : toast.tone === 'warning'
                    ? 'border-[#F5B84B]/60'
                    : toast.tone === 'error'
                      ? 'border-[#FF5C6C]/60'
                      : 'border-[#353B50]'
              }`}
            >
              <Bot className="w-3.5 h-3.5 text-[#6C7BFF] shrink-0" />
              <span>{toast.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
