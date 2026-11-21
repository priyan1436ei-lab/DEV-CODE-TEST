import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Blocks,
  Bug,
  Code2,
  FileCode2,
  FolderGit2,
  GitBranch,
  GitFork,
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
  X,
} from 'lucide-react';
import { AiWorkspacePanel } from './components/AiWorkspacePanel';
import { BottomWorkbenchPanel } from './components/BottomWorkbenchPanel';
import { CodeEditorView } from './components/CodeEditorView';
import { CommandPalette } from './components/CommandPalette';
import { DashboardView } from './components/DashboardView';
import { DebuggingCenterView } from './components/DebuggingCenterView';
import { ExecutionHistoryView } from './components/ExecutionHistoryView';
import { ExtensionsView } from './components/ExtensionsView';
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
  CodeCitation,
  DebugAnalysis,
  ExtensionHostSnapshot,
  PermissionLevel,
  PermissionPolicyRule,
  Project,
  PublicUserSession,
  ScreenId,
  SecurityFinding,
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
  const [openMenu, setOpenMenu] = useState<MenuId>(null);
  const [isMaximized, setIsMaximized] = useState(false);
  const [sseConnected, setSseConnected] = useState(false);
  const [toast, setToast] = useState<{ tone: 'info' | 'error'; text: string } | null>(null);

  const activeProjectIdRef = useRef(activeProjectId);
  activeProjectIdRef.current = activeProjectId;

  const showToast = useCallback((text: string, tone: 'info' | 'error' = 'info') => {
    setToast({ text, tone });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  // Apply Fluent Dark/Light class on root element
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    try {
      window.localStorage.setItem('devmind_theme', theme);
    } catch {
      // Ignore storage failures
    }
  }, [theme]);

  // Track Electron window maximize state
  useEffect(() => {
    if (!window.devmindDesktop) return;
    window.devmindDesktop.isMaximized().then(setIsMaximized).catch(() => {});
    const unsubscribe = window.devmindDesktop.onMaximizedChanged((max) => {
      setIsMaximized(max);
    });
    return () => unsubscribe();
  }, []);

  // Global keyboard shortcuts (Ctrl+K Command Palette, Ctrl+B Explorer, Ctrl+J Bottom Panel)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandPaletteOpen((v) => !v);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        setExplorerOpen((v) => !v);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'j') {
        e.preventDefault();
        setBottomPanelCollapsed((v) => !v);
      } else if (e.key === 'Escape') {
        setOpenMenu(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Close desktop menus when clicking outside
  useEffect(() => {
    if (!openMenu) return;
    const close = () => setOpenMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [openMenu]);

  // Check existing session on startup
  useEffect(() => {
    const token = getStoredSessionToken();
    if (!token) {
      setBooting(false);
      return;
    }
    devmindApi
      .getSession()
      .then((res) => setSession(res.session))
      .catch(() => {
        setStoredSessionToken(null);
        setSession(null);
      })
      .finally(() => setBooting(false));
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

    const currentId = activeProjectIdRef.current;
    const targetProject =
      uniqueProjects.find((p) => p.id === currentId) || uniqueProjects[0] || null;
    if (targetProject) {
      if (targetProject.id !== currentId) {
        setActiveProjectId(targetProject.id);
        setActiveFilePath(targetProject.files[0]?.path ?? null);
      }
      await refreshProjectData(targetProject.id);
    }
  }, [refreshProjectData]);

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

  // Keep activeFilePath synced if current file disappears
  useEffect(() => {
    if (!activeProject) return;
    if (!activeFilePath || !activeProject.files.some((f) => f.path === activeFilePath)) {
      setActiveFilePath(activeProject.files[0]?.path ?? null);
    }
  }, [activeProject, activeFilePath]);

  const handleSelectProject = async (projectId: string) => {
    setActiveProjectId(projectId);
    setPendingDiff(null);
    setHighlightLine(null);
    const found = projects.find((p) => p.id === projectId);
    setActiveFilePath(found?.files[0]?.path ?? null);
    await refreshProjectData(projectId);
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
      const res = await devmindApi.saveFile(activeProject.id, filePath, content);
      setProjects((prev) => dedupeById(prev.map((p) => (p.id === res.project.id ? res.project : p))));
      const [secRes, extRes] = await Promise.all([
        devmindApi.getSecurityFindings(activeProject.id),
        devmindApi.getExtensionsHost(activeProject.id),
      ]);
      setSecurityFindings(dedupeById(secRes.findings));
      setExtensionHost(extRes.host);
    },
    [activeProject]
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
    setScreen('explorer');
    showToast(`Imported repository "${res.project.name}".`);
  };

  // Extension Host Handlers
  const handleInstallExtension = async (extensionId: string) => {
    const res = await devmindApi.installExtension(extensionId, activeProject?.id);
    setExtensionHost(res.host);
    showToast(`Installed ${res.installedIds.join(', ')}`);
  };

  const handleUninstallExtension = async (extensionId: string, cascade = false) => {
    const res = await devmindApi.uninstallExtension(extensionId, cascade, activeProject?.id);
    setExtensionHost(res.host);
    showToast(`Uninstalled ${res.uninstalledIds.join(', ')}`);
  };

  const handleToggleExtension = async (extensionId: string, enabled: boolean) => {
    const res = await devmindApi.toggleExtension(extensionId, enabled, activeProject?.id);
    setExtensionHost(res.host);
    showToast(`${enabled ? 'Enabled' : 'Disabled'} ${extensionId}`);
  };

  const handleActivateExtension = async (extensionId: string) => {
    const res = await devmindApi.activateExtension(extensionId, activeProject?.id);
    setExtensionHost(res.host);
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

  // Tasks, Approvals, Debugging, Chat, Policy
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
  };

  const handleUpdateTaskPriority = async (taskId: string, priority: TaskPriority) => {
    const res = await devmindApi.updateTaskPriority(taskId, priority);
    setTasks((prev) => dedupeById(prev.map((t) => (t.id === res.task.id ? res.task : t))));
  };

  const handleSendChat = async (message: string) => {
    if (!activeProject) return;
    const res = await devmindApi.sendChatMessage(activeProject.id, message);
    setChatMessages(dedupeById(res.messages));
    const usageRes = await devmindApi.getUsage();
    setUsage(usageRes.usage);
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

  const handleLogout = async () => {
    try {
      await devmindApi.logout();
    } catch {
      // Ignore logout errors
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
        onAuthenticated={(token, nextSession) => {
          setStoredSessionToken(token);
          setSession(nextSession);
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

  const navItems: Array<{
    id: ScreenId;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: number;
  }> = [
    { id: 'explorer', label: 'Code Editor', icon: Code2 },
    { id: 'dashboard', label: 'Workspace Overview', icon: LayoutDashboard },
    { id: 'brain', label: 'Architecture & Symbols', icon: GitFork },
    {
      id: 'extensions',
      label: 'Extensions Marketplace',
      icon: Blocks,
      badge: activeExtensionsCount || undefined,
    },
    { id: 'debugging', label: 'Diagnostics & Debug', icon: Bug },
    {
      id: 'security',
      label: 'Security Center',
      icon: ShieldAlert,
      badge: openSecurityCount || undefined,
    },
    { id: 'history', label: 'Task History', icon: History },
  ];

  return (
    <div className="h-screen w-screen flex flex-col bg-[var(--surface-canvas)] text-[var(--ink-primary)] overflow-hidden select-none">
      {/* Native Windows 11 Desktop Title Bar (36px) */}
      <header className="h-9 bg-[var(--surface-chrome)] border-b border-[var(--border-hairline)] flex items-center justify-between px-2 shrink-0 win-drag-region z-30">
        {/* Left: Brand + Desktop Menu Bar */}
        <div className="flex items-center gap-1 win-no-drag">
          <div className="flex items-center gap-2 px-1.5 mr-1">
            <div className="w-5 h-5 rounded-[3px] bg-[var(--accent-primary)] text-[var(--accent-ink)] flex items-center justify-center">
              <Code2 className="w-3.5 h-3.5" />
            </div>
            <span className="text-xs font-semibold tracking-tight text-[var(--ink-primary)] hidden sm:inline">
              DevMind Studio
            </span>
          </div>

          {/* Menu Bar */}
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
                className={`h-6 px-2 text-xs rounded-[3px] transition-colors ${
                  openMenu === menu.id
                    ? 'bg-[var(--surface-active)] text-[var(--ink-primary)]'
                    : 'text-[var(--ink-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--ink-primary)]'
                }`}
              >
                {menu.label}
              </button>

              {openMenu === menu.id && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="absolute left-0 top-7 w-56 rounded-[4px] border border-[var(--border-strong)] bg-[var(--surface-elevated)] shadow-lg py-1 z-50 text-xs"
                >
                  {menu.id === 'file' && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setImportModalOpen(true);
                          setOpenMenu(null);
                        }}
                        className="w-full px-3 py-1.5 text-left hover:bg-[var(--surface-hover)] text-[var(--ink-primary)]"
                      >
                        Import Repository...
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          handleReindex();
                          setOpenMenu(null);
                        }}
                        className="w-full px-3 py-1.5 text-left hover:bg-[var(--surface-hover)] text-[var(--ink-primary)]"
                      >
                        Rebuild AST Index
                      </button>
                      <div className="my-1 border-t border-[var(--border-hairline)]" />
                      <button
                        type="button"
                        onClick={() => {
                          setOpenMenu(null);
                          handleLogout();
                        }}
                        className="w-full px-3 py-1.5 text-left hover:bg-[var(--surface-hover)] text-[var(--status-danger)]"
                      >
                        Sign Out
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
                        className="w-full px-3 py-1.5 text-left hover:bg-[var(--surface-hover)] flex items-center justify-between"
                      >
                        <span>Command Palette</span>
                        <span className="font-mono text-[10px] text-[var(--ink-muted)]">Ctrl+K</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setExplorerOpen((v) => !v);
                          setOpenMenu(null);
                        }}
                        className="w-full px-3 py-1.5 text-left hover:bg-[var(--surface-hover)] flex items-center justify-between"
                      >
                        <span>Toggle Explorer</span>
                        <span className="font-mono text-[10px] text-[var(--ink-muted)]">Ctrl+B</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setBottomPanelCollapsed((v) => !v);
                          setOpenMenu(null);
                        }}
                        className="w-full px-3 py-1.5 text-left hover:bg-[var(--surface-hover)] flex items-center justify-between"
                      >
                        <span>Toggle Workbench Panel</span>
                        <span className="font-mono text-[10px] text-[var(--ink-muted)]">Ctrl+J</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setRightPanelOpen((v) => !v);
                          setOpenMenu(null);
                        }}
                        className="w-full px-3 py-1.5 text-left hover:bg-[var(--surface-hover)]"
                      >
                        Toggle Tasks Panel
                      </button>
                      <div className="my-1 border-t border-[var(--border-hairline)]" />
                      <button
                        type="button"
                        onClick={() => {
                          setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
                          setOpenMenu(null);
                        }}
                        className="w-full px-3 py-1.5 text-left hover:bg-[var(--surface-hover)]"
                      >
                        Switch to {theme === 'dark' ? 'Windows Light' : 'Windows Dark'} Theme
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
                        className="w-full px-3 py-1.5 text-left hover:bg-[var(--surface-hover)]"
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
                        className="w-full px-3 py-1.5 text-left hover:bg-[var(--surface-hover)]"
                      >
                        Refresh Extension Host
                      </button>
                      {(extensionHost?.activeCommands.length ?? 0) > 0 && (
                        <>
                          <div className="my-1 border-t border-[var(--border-hairline)]" />
                          {extensionHost!.activeCommands.slice(0, 5).map((cmd) => (
                            <button
                              key={cmd.id}
                              type="button"
                              onClick={() => {
                                handleExecuteExtensionCommand(cmd.id);
                                setOpenMenu(null);
                              }}
                              className="w-full px-3 py-1.5 text-left hover:bg-[var(--surface-hover)] truncate"
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
                          setScreen('settings');
                          setOpenMenu(null);
                        }}
                        className="w-full px-3 py-1.5 text-left hover:bg-[var(--surface-hover)]"
                      >
                        Windows .exe Packaging & Settings
                      </button>
                      <div className="px-3 py-1.5 text-[11px] font-mono text-[var(--ink-muted)]">
                        Core Engine v{extensionHost?.engineVersion || '2.1.0'}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Center: Command Palette Search Trigger */}
        <button
          type="button"
          onClick={() => setCommandPaletteOpen(true)}
          className="win-no-drag hidden md:flex items-center justify-between gap-3 h-6 w-[320px] lg:w-[380px] px-2.5 rounded-[4px] bg-[var(--surface-canvas)] border border-[var(--border-hairline)] hover:border-[var(--border-strong)] text-xs text-[var(--ink-muted)] transition-colors"
        >
          <span className="inline-flex items-center gap-2 truncate">
            <Search className="w-3 h-3 shrink-0" />
            <span className="truncate">{activeProject?.name || 'Search files, symbols, commands...'}</span>
          </span>
          <span className="font-mono text-[10px] shrink-0">Ctrl+K</span>
        </button>

        {/* Right: Repo Switcher + Panel Toggles + Theme + Native Window Controls */}
        <div className="flex items-center gap-1 win-no-drag">
          <select
            aria-label="Active repository"
            value={activeProject?.id || ''}
            onChange={(e) => handleSelectProject(e.target.value)}
            className="h-6 max-w-[150px] px-2 text-[11px] rounded-[3px] bg-[var(--surface-canvas)] border border-[var(--border-hairline)] text-[var(--ink-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
          >
            {dedupeById(projects).map((proj) => (
              <option key={proj.id} value={proj.id}>
                {proj.name}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => setExplorerOpen((v) => !v)}
            title="Toggle Explorer (Ctrl+B)"
            className={`p-1 rounded-[3px] ${
              explorerOpen ? 'text-[var(--ink-primary)]' : 'text-[var(--ink-muted)]'
            } hover:bg-[var(--surface-hover)]`}
          >
            <PanelLeft className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => setBottomPanelCollapsed((v) => !v)}
            title="Toggle Bottom Panel (Ctrl+J)"
            className={`p-1 rounded-[3px] ${
              !bottomPanelCollapsed ? 'text-[var(--ink-primary)]' : 'text-[var(--ink-muted)]'
            } hover:bg-[var(--surface-hover)]`}
          >
            <PanelBottom className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => setRightPanelOpen((v) => !v)}
            title="Toggle Tasks Panel"
            className={`p-1 rounded-[3px] ${
              rightPanelOpen ? 'text-[var(--ink-primary)]' : 'text-[var(--ink-muted)]'
            } hover:bg-[var(--surface-hover)]`}
          >
            <PanelRight className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
            title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} mode`}
            className="p-1 rounded-[3px] text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:bg-[var(--surface-hover)]"
          >
            {theme === 'dark' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
          </button>

          <button
            type="button"
            onClick={handleLogout}
            title="Sign Out"
            className="p-1 rounded-[3px] text-[var(--ink-secondary)] hover:text-[var(--status-danger)] hover:bg-[var(--surface-hover)]"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>

          {/* Native Windows Caption Buttons */}
          <div className="ml-1 pl-1 border-l border-[var(--border-hairline)] flex items-center">
            {window.devmindDesktop && (
              <button
                type="button"
                onClick={() => window.devmindDesktop?.minimize()}
                title="Minimize"
                className="w-8 h-7 flex items-center justify-center text-[var(--ink-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--ink-primary)]"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={handleToggleMaximize}
              title={isMaximized ? 'Restore' : 'Maximize'}
              className="w-8 h-7 flex items-center justify-center text-[var(--ink-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--ink-primary)]"
            >
              {isMaximized ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
            </button>
            {window.devmindDesktop && (
              <button
                type="button"
                onClick={() => window.devmindDesktop?.close()}
                title="Close"
                className="w-8 h-7 flex items-center justify-center text-[var(--ink-secondary)] hover:bg-[#c42b1c] hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Workbench Area */}
      <div className="flex-1 flex min-h-0 overflow-hidden select-text">
        {/* Left VS Code-Style Activity Rail (48px) */}
        <nav
          aria-label="Primary workbench navigation"
          className="w-12 shrink-0 bg-[var(--surface-chrome)] border-r border-[var(--border-hairline)] flex flex-col items-center justify-between py-1.5 select-none"
        >
          <div className="flex flex-col items-center gap-1 w-full">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = screen === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    if (item.id === 'explorer' && screen === 'explorer') {
                      setExplorerOpen((v) => !v);
                    } else {
                      setScreen(item.id);
                    }
                  }}
                  title={item.label}
                  className={`relative w-full h-10 flex items-center justify-center transition-colors ${
                    isActive
                      ? 'text-[var(--ink-primary)] bg-[var(--surface-active)]'
                      : 'text-[var(--ink-muted)] hover:text-[var(--ink-primary)] hover:bg-[var(--surface-hover)]'
                  }`}
                >
                  {isActive && (
                    <span className="absolute left-0 top-1.5 bottom-1.5 w-[2px] bg-[var(--accent-primary)]" />
                  )}
                  <Icon className="w-[18px] h-[18px]" />
                  {item.badge !== undefined && item.badge > 0 && (
                    <span className="absolute top-1 right-1 min-w-[14px] h-[14px] px-1 rounded-full bg-[var(--accent-primary)] text-[var(--accent-ink)] text-[9px] font-mono font-semibold flex items-center justify-center">
                      {item.badge > 9 ? '9+' : item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => setScreen('settings')}
            title="Settings & Windows Runtime"
            className={`relative w-full h-10 flex items-center justify-center transition-colors ${
              screen === 'settings'
                ? 'text-[var(--ink-primary)] bg-[var(--surface-active)]'
                : 'text-[var(--ink-muted)] hover:text-[var(--ink-primary)] hover:bg-[var(--surface-hover)]'
            }`}
          >
            {screen === 'settings' && (
              <span className="absolute left-0 top-1.5 bottom-1.5 w-[2px] bg-[var(--accent-primary)]" />
            )}
            <Settings className="w-[18px] h-[18px]" />
          </button>
        </nav>

        {/* Collapsible File Explorer Sidebar (visible in Code Editor view) */}
        {screen === 'explorer' && explorerOpen && (
          <aside className="w-[240px] shrink-0 bg-[var(--surface-sidebar)] border-r border-[var(--border-hairline)] flex flex-col overflow-hidden">
            <div className="h-9 px-3 border-b border-[var(--border-hairline)] flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-secondary)]">
                Explorer
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={handleReindex}
                  title="Rebuild AST index"
                  className="p-1 rounded text-[var(--ink-muted)] hover:text-[var(--ink-primary)] hover:bg-[var(--surface-hover)]"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setImportModalOpen(true)}
                  title="Import repository"
                  className="p-1 rounded text-[var(--ink-muted)] hover:text-[var(--ink-primary)] hover:bg-[var(--surface-hover)]"
                >
                  <FolderGit2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="px-3 py-2 border-b border-[var(--border-hairline)] bg-[var(--surface-subtle)]">
              <div className="text-xs font-semibold text-[var(--ink-primary)] truncate">
                {activeProject?.name || 'Workspace'}
              </div>
              <div className="text-[10px] font-mono text-[var(--ink-muted)] truncate mt-0.5">
                {activeProject?.localPath}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto py-1">
              {activeProject?.files.map((f) => {
                const isSelected = activeFile?.path === f.path;
                const fileIssueCount =
                  securityFindings.filter((s) => s.filePath === f.path && s.status === 'open').length +
                  (extensionHost?.diagnostics.filter((d) => d.filePath === f.path).length ?? 0);

                return (
                  <button
                    key={f.path}
                    type="button"
                    onClick={() => {
                      setActiveFilePath(f.path);
                      setHighlightLine(null);
                      setPendingDiff(null);
                    }}
                    className={`w-full px-3 py-1.5 text-left flex items-center justify-between gap-2 text-xs transition-colors ${
                      isSelected
                        ? 'bg-[var(--surface-active)] text-[var(--ink-primary)] font-medium'
                        : 'text-[var(--ink-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--ink-primary)]'
                    }`}
                  >
                    <span className="inline-flex items-center gap-2 min-w-0">
                      <FileCode2 className="w-3.5 h-3.5 text-[var(--ink-muted)] shrink-0" />
                      <span className="truncate font-mono text-[11px]">{f.path}</span>
                    </span>
                    <span className="flex items-center gap-1 shrink-0 font-mono text-[10px]">
                      {f.gitStatus === 'modified' && (
                        <span className="text-[var(--status-warning)]">M</span>
                      )}
                      {fileIssueCount > 0 && (
                        <span className="text-[var(--status-danger)]">{fileIssueCount}</span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Outline Symbols Preview */}
            {activeFile && activeProject && (
              <div className="border-t border-[var(--border-hairline)] max-h-[160px] flex flex-col">
                <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-muted)] bg-[var(--surface-chrome)]">
                  Outline Symbols
                </div>
                <div className="overflow-y-auto py-1">
                  {activeProject.symbols
                    .filter((s) => s.filePath === activeFile.path)
                    .slice(0, 12)
                    .map((sym) => (
                      <button
                        key={sym.id}
                        type="button"
                        onClick={() => setHighlightLine(sym.startLine)}
                        className="w-full px-3 py-1 text-left hover:bg-[var(--surface-hover)] flex items-center justify-between gap-2 text-[11px]"
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
                onThemeChange={setTheme}
                onSessionUpdated={setSession}
                onUpdatePolicy={async (actionType, level: PermissionLevel) => {
                  const res = await devmindApi.updatePolicy(actionType, level);
                  setPolicies(res.policies);
                }}
                onUpdateBudget={async (budgetUsd, tokenLimit) => {
                  const res = await devmindApi.updateBudget(budgetUsd, tokenLimit);
                  setUsage(res.usage);
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

        {/* Right Engineering Tasks & Repo Query Panel */}
        {rightPanelOpen && (
          <div className="w-[340px] xl:w-[370px] shrink-0 hidden lg:block">
            <AiWorkspacePanel
              session={session}
              activeProjectName={activeProject?.name || 'Workspace'}
              tasks={tasks}
              chatMessages={chatMessages}
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

      {/* Native Windows Status Bar (24px) with Live Extension Status Contributions */}
      <footer className="h-6 bg-[var(--surface-chrome)] border-t border-[var(--border-hairline)] px-2.5 flex items-center justify-between text-[11px] text-[var(--ink-secondary)] shrink-0 select-none">
        <div className="flex items-center gap-3 min-w-0 overflow-hidden">
          <span className="inline-flex items-center gap-1 font-mono text-[var(--ink-primary)] shrink-0">
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
            title="Show Problems panel"
          >
            <AlertCircle className="w-3 h-3 text-[var(--status-danger)]" />
            <span>{errorProblemsCount}</span>
            <AlertTriangle className="w-3 h-3 text-[var(--status-warning)] ml-0.5" />
            <span>{warningProblemsCount}</span>
          </button>

          {/* Extension Status Bar Items (Left Alignment) */}
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
                className="hidden sm:inline-flex items-center px-1.5 h-5 rounded-[2px] hover:bg-[var(--surface-hover)] hover:text-[var(--ink-primary)] font-mono truncate max-w-[170px]"
              >
                {item.text}
              </button>
            ))}
        </div>

        <div className="flex items-center gap-3 shrink-0 font-mono">
          {/* Extension Status Bar Items (Right Alignment) */}
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
                className="hidden xl:inline-flex items-center px-1.5 h-5 rounded-[2px] hover:bg-[var(--surface-hover)] hover:text-[var(--ink-primary)]"
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
            onClick={() => setScreen('extensions')}
            className="inline-flex items-center gap-1 hover:text-[var(--ink-primary)]"
            title="Open Extensions Marketplace"
          >
            <Blocks className="w-3 h-3 text-[var(--accent-primary)]" />
            <span className="tabular-nums">{activeExtensionsCount} Ext</span>
          </button>

          <span className="hidden sm:inline text-[var(--ink-muted)]">
            {sseConnected ? 'Sync Active' : 'Reconnecting'}
          </span>
        </div>
      </footer>

      {/* Unobtrusive Desktop Toast Notification */}
      {toast && (
        <div
          className={`fixed bottom-9 right-4 z-50 px-3.5 py-2 rounded-[4px] border shadow-lg text-xs flex items-center gap-2.5 max-w-md ${
            toast.tone === 'error'
              ? 'bg-[var(--surface-elevated)] border-[var(--status-danger)] text-[var(--status-danger)]'
              : 'bg-[var(--surface-elevated)] border-[var(--border-strong)] text-[var(--ink-primary)]'
          }`}
        >
          <span>{toast.text}</span>
          <button
            type="button"
            onClick={() => setToast(null)}
            className="text-[var(--ink-muted)] hover:text-[var(--ink-primary)]"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Command Palette & Import Repository Modals */}
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
    </div>
  );
}

export default App;
