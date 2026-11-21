import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Cloud,
  CloudOff,
  Cpu,
  Download,
  HardDrive,
  KeyRound,
  Loader2,
  Monitor,
  Moon,
  RefreshCw,
  Shield,
  Sun,
  UserCheck,
  Wallet,
} from 'lucide-react';
import { devmindApi, type ProviderPreset } from '../services/api';
import type {
  AiRoutingMode,
  FirebaseConnectionStatus,
  LlmProviderId,
  OllamaRuntimeStatus,
  PermissionLevel,
  PermissionPolicyRule,
  PublicUserSession,
  SyncStateStatus,
  UsageLedger,
} from '../types/devmind';

interface SettingsPolicyViewProps {
  session: PublicUserSession;
  policies: PermissionPolicyRule[];
  presets: ProviderPreset[];
  usage: UsageLedger | null;
  theme: 'dark' | 'light';
  isOnline?: boolean;
  firebaseStatus?: FirebaseConnectionStatus;
  firebaseEmail?: string | null;
  syncStatus?: SyncStateStatus;
  pendingSyncCount?: number;
  conflictCount?: number;
  lastSyncedAt?: string | null;
  onSyncNow?: () => void;
  onOpenConflicts?: () => void;
  onConnectFirebase?: () => void;
  onDisconnectFirebase?: () => void;
  onSwitchProfile?: () => void;
  onThemeChange: (theme: 'dark' | 'light') => void;
  onSessionUpdated: (session: PublicUserSession) => void;
  onUpdatePolicy: (actionType: string, level: PermissionLevel) => Promise<void>;
  onUpdateBudget: (monthlyBudgetUsd: number, monthlyTokenLimit: number) => Promise<void>;
}

const BUILD_SCRIPT_CONTENT = `@echo off
setlocal
title DevMind Studio - Windows Installer (.exe) Builder
echo ============================================================
echo   DevMind Studio - Standalone Windows x64 .exe Builder
echo ============================================================
call npm install
if errorlevel 1 exit /b 1
call npm install -D electron electron-builder
if errorlevel 1 exit /b 1
call npm run build:win
if errorlevel 1 exit /b 1
echo.
echo [DONE] Built NSIS Installer and Portable .exe in dist-electron\\
pause
`;

export const SettingsPolicyView: React.FC<SettingsPolicyViewProps> = ({
  session,
  policies,
  presets,
  usage,
  theme,
  isOnline = true,
  firebaseStatus = 'local-only',
  firebaseEmail = null,
  syncStatus = 'Synced',
  pendingSyncCount = 0,
  conflictCount = 0,
  lastSyncedAt = null,
  onSyncNow,
  onOpenConflicts,
  onConnectFirebase,
  onDisconnectFirebase,
  onSwitchProfile,
  onThemeChange,
  onSessionUpdated,
  onUpdatePolicy,
  onUpdateBudget,
}) => {
  const [provider, setProvider] = useState<LlmProviderId>(session.llm.provider);
  const [baseUrl, setBaseUrl] = useState(session.llm.baseUrl);
  const [model, setModel] = useState(session.llm.model);
  const [apiKey, setApiKey] = useState('');
  const [savingLlm, setSavingLlm] = useState(false);
  const [llmFeedback, setLlmFeedback] = useState<string | null>(null);

  // Hybrid AI Routing & Local Ollama State
  const [routingMode, setRoutingMode] = useState<AiRoutingMode>(session.aiRoutingMode || 'auto');
  const [ollamaHost, setOllamaHost] = useState(session.localAi?.host || 'http://127.0.0.1:11434');
  const [ollamaModel, setOllamaModel] = useState(session.localAi?.model || 'qwen2.5-coder:7b');
  const [ollamaStatus, setOllamaStatus] = useState<OllamaRuntimeStatus | null>(null);
  const [probingOllama, setProbingOllama] = useState(false);
  const [savingRouting, setSavingRouting] = useState(false);
  const [routingFeedback, setRoutingFeedback] = useState<string | null>(null);

  const [budgetUsd, setBudgetUsd] = useState(String(usage?.monthlyBudgetUsd ?? 25));
  const [tokenLimit, setTokenLimit] = useState(String(usage?.monthlyTokenLimit ?? 5000000));
  const [savingBudget, setSavingBudget] = useState(false);
  const [budgetSaved, setBudgetSaved] = useState(false);

  const [systemInfo, setSystemInfo] = useState<{
    platform: string;
    arch: string;
    release: string;
    electronVersion: string;
    nodeVersion: string;
    memoryMb: number;
  } | null>(null);

  const probeOllama = useCallback(
    async (hostOverride?: string) => {
      setProbingOllama(true);
      try {
        const res = await devmindApi.getLocalAiStatus(hostOverride ?? ollamaHost);
        setOllamaStatus(res.status);
        if (
          res.status.available &&
          res.status.models.length > 0 &&
          !res.status.models.some((m) => m.name === ollamaModel)
        ) {
          setOllamaModel(res.status.models[0].name);
        }
      } catch (err) {
        setOllamaStatus({
          available: false,
          host: hostOverride ?? ollamaHost,
          models: [],
          checkedAt: new Date().toISOString(),
          error: err instanceof Error ? err.message : 'Unable to probe Ollama',
        });
      } finally {
        setProbingOllama(false);
      }
    },
    [ollamaHost, ollamaModel]
  );

  useEffect(() => {
    setRoutingMode(session.aiRoutingMode || 'auto');
    if (session.localAi?.host) setOllamaHost(session.localAi.host);
    if (session.localAi?.model) setOllamaModel(session.localAi.model);
  }, [session.aiRoutingMode, session.localAi?.host, session.localAi?.model]);

  useEffect(() => {
    void probeOllama(session.localAi?.host || 'http://127.0.0.1:11434');
    if (window.devmindDesktop?.getSystemInfo) {
      window.devmindDesktop
        .getSystemInfo()
        .then(setSystemInfo)
        .catch(() => {});
    }
  }, []);

  const handleProviderSelect = (nextId: LlmProviderId) => {
    setProvider(nextId);
    const preset = presets.find((p) => p.id === nextId);
    if (preset) {
      setBaseUrl(preset.defaultBaseUrl);
      setModel(preset.defaultModel);
    }
  };

  const handleSaveLlm = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingLlm(true);
    setLlmFeedback(null);
    try {
      const res = await devmindApi.updateLlmConfig({
        provider,
        baseUrl: baseUrl.trim(),
        model: model.trim(),
        apiKey: apiKey.trim(),
      });
      onSessionUpdated(res.session);
      setApiKey('');
      setLlmFeedback('Online model connection updated in server session.');
    } catch (err) {
      setLlmFeedback(err instanceof Error ? err.message : 'Unable to save provider settings.');
    } finally {
      setSavingLlm(false);
    }
  };

  const handleSaveHybridRouting = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingRouting(true);
    setRoutingFeedback(null);
    try {
      const res = await devmindApi.updateAiRouting({
        aiRoutingMode: routingMode,
        localAi: {
          host: ollamaHost.trim(),
          model: ollamaModel.trim(),
          enabled: true,
        },
      });
      onSessionUpdated(res.session);
      setRoutingFeedback(`AI routing updated -> ${routingMode.toUpperCase()} (${ollamaModel.trim()}).`);
    } catch (err) {
      setRoutingFeedback(err instanceof Error ? err.message : 'Failed to update AI routing.');
    } finally {
      setSavingRouting(false);
    }
  };

  const handleSaveBudget = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingBudget(true);
    setBudgetSaved(false);
    try {
      await onUpdateBudget(
        Math.max(1, Number(budgetUsd) || 25),
        Math.max(100000, Number(tokenLimit) || 5000000)
      );
      setBudgetSaved(true);
      window.setTimeout(() => setBudgetSaved(false), 2000);
    } finally {
      setSavingBudget(false);
    }
  };

  const handleDownloadBuildScript = () => {
    const blob = new Blob([BUILD_SCRIPT_CONTENT], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'build-windows-exe.bat';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="h-full overflow-y-auto bg-[var(--surface-canvas)] p-6">
      <div className="max-w-4xl space-y-6">
        <div className="border-b border-[var(--border-hairline)] pb-4">
          <h1 className="text-xl font-semibold text-[var(--ink-primary)] tracking-[-0.02em]">
            Settings, Hybrid AI & Desktop Runtime
          </h1>
          <p className="text-xs text-[var(--ink-secondary)] mt-0.5">
            Manage Local Profiles, Firebase Cloud Sync, Local Ollama & Online AI routing, permission guardrails, and standalone desktop runtime.
          </p>
        </div>

        {/* Phase 1 & 3: Local Profile, Firebase Account & Sync Status */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 apple-card space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold text-[var(--ink-primary)] inline-flex items-center gap-1.5">
                <UserCheck className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                Local Profile & Cloud Identity
              </h2>
              <span className="text-[10px] font-mono uppercase text-[var(--ink-muted)]">
                {session.authMode === 'hybrid' ? 'Hybrid Cloud' : 'Local-Only'}
              </span>
            </div>
            <div className="text-xs space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[var(--ink-muted)]">Local Profile</span>
                <span className="font-medium text-[var(--ink-primary)]">{session.displayName}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[var(--ink-muted)]">Firebase Cloud</span>
                <span className="font-mono text-[11px] text-[var(--ink-primary)]">
                  {firebaseStatus === 'connected'
                    ? firebaseEmail || 'Connected'
                    : firebaseStatus === 'reauth-required'
                    ? 'Re-auth Required'
                    : firebaseStatus === 'offline'
                    ? 'Offline'
                    : 'Not Connected'}
                </span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {onSwitchProfile && (
                <button
                  type="button"
                  onClick={onSwitchProfile}
                  className="h-7 px-3 text-xs font-medium rounded-lg border border-[var(--border-strong)] bg-[var(--surface-canvas)] text-[var(--ink-primary)] hover:bg-[var(--surface-hover)]"
                >
                  Switch Profile
                </button>
              )}
              {firebaseStatus === 'connected' ? (
                onDisconnectFirebase && (
                  <button
                    type="button"
                    onClick={onDisconnectFirebase}
                    className="h-7 px-3 text-xs font-medium rounded-lg border border-[var(--border-hairline)] text-[var(--ink-secondary)] hover:text-[var(--status-danger)]"
                  >
                    Disconnect Cloud
                  </button>
                )
              ) : (
                onConnectFirebase && (
                  <button
                    type="button"
                    disabled={!isOnline}
                    onClick={onConnectFirebase}
                    className="h-7 px-3 text-xs font-medium rounded-lg bg-[var(--accent-primary)] text-[var(--accent-ink)] hover:bg-[var(--accent-hover)] disabled:opacity-40 inline-flex items-center gap-1.5"
                  >
                    <Cloud className="w-3 h-3" />
                    {firebaseStatus === 'reauth-required' ? 'Reconnect Google' : 'Connect Firebase Sync'}
                  </button>
                )
              )}
            </div>
          </div>

          <div className="p-4 apple-card space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold text-[var(--ink-primary)] inline-flex items-center gap-1.5">
                {isOnline ? (
                  <Cloud className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                ) : (
                  <CloudOff className="w-3.5 h-3.5 text-[var(--status-warning)]" />
                )}
                Offline Queue & Cloud Sync
              </h2>
              <span
                className={`text-[10px] font-mono font-semibold uppercase ${
                  syncStatus === 'Synced'
                    ? 'text-[var(--status-success)]'
                    : syncStatus === 'Conflict' || syncStatus === 'Offline'
                    ? 'text-[var(--status-warning)]'
                    : syncStatus === 'Error'
                    ? 'text-[var(--status-danger)]'
                    : 'text-[var(--accent-primary)]'
                }`}
              >
                {syncStatus}
              </span>
            </div>
            <div className="text-xs space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[var(--ink-muted)]">Pending Queue</span>
                <span className="font-mono tabular-nums text-[var(--ink-primary)]">
                  {pendingSyncCount} operation{pendingSyncCount === 1 ? '' : 's'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[var(--ink-muted)]">Last Successful Sync</span>
                <span className="font-mono text-[11px] text-[var(--ink-secondary)]">
                  {lastSyncedAt ? new Date(lastSyncedAt).toLocaleTimeString() : 'Not yet synced'}
                </span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {onSyncNow && (
                <button
                  type="button"
                  disabled={!isOnline || syncStatus === 'Syncing'}
                  onClick={onSyncNow}
                  className="h-7 px-3 text-xs font-medium rounded-lg border border-[var(--border-strong)] bg-[var(--surface-canvas)] text-[var(--ink-primary)] hover:bg-[var(--surface-hover)] disabled:opacity-40 inline-flex items-center gap-1.5"
                >
                  <RefreshCw className={`w-3 h-3 ${syncStatus === 'Syncing' ? 'animate-spin' : ''}`} />
                  Sync Now
                </button>
              )}
              {conflictCount > 0 && onOpenConflicts && (
                <button
                  type="button"
                  onClick={onOpenConflicts}
                  className="h-7 px-3 text-xs font-semibold rounded-lg bg-[var(--status-warning)] text-black inline-flex items-center gap-1"
                >
                  <AlertTriangle className="w-3 h-3" />
                  Resolve Conflicts ({conflictCount})
                </button>
              )}
            </div>
          </div>
        </section>

        {/* Phase 4: Hybrid AI Routing & Local Ollama Runtime */}
        <form onSubmit={handleSaveHybridRouting} className="p-4 apple-card space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--ink-primary)] inline-flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
              Hybrid AI Routing & Local Ollama Runtime
            </h2>
            <div className="flex items-center gap-2 text-[11px] font-mono">
              <span
                className={
                  ollamaStatus?.available
                    ? 'text-[var(--status-success)]'
                    : 'text-[var(--ink-muted)]'
                }
              >
                {ollamaStatus
                  ? ollamaStatus.available
                    ? `Ollama Online${ollamaStatus.version ? ` v${ollamaStatus.version}` : ''} · ${ollamaStatus.models.length} model(s)`
                    : 'Ollama Not Detected'
                  : 'Checking...'}
              </span>
              <button
                type="button"
                disabled={probingOllama}
                onClick={() => void probeOllama(ollamaHost)}
                className="h-6 px-2 rounded-md border border-[var(--border-strong)] bg-[var(--surface-canvas)] text-[var(--ink-primary)] hover:bg-[var(--surface-hover)] inline-flex items-center gap-1"
              >
                <RefreshCw className={`w-3 h-3 ${probingOllama ? 'animate-spin' : ''}`} />
                Detect
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-[11px] text-[var(--ink-secondary)]">AI Routing Mode</label>
            <div className="apple-segmented w-full grid grid-cols-3">
              {(
                [
                  { id: 'auto', label: 'Auto (Online -> Local Failover)' },
                  { id: 'online', label: 'Online AI Only' },
                  { id: 'local', label: 'Local AI (Ollama)' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  data-active={routingMode === opt.id}
                  onClick={() => setRoutingMode(opt.id)}
                  className="apple-segmented-item h-8 px-2 text-xs font-medium text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] truncate"
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-[11px] text-[var(--ink-secondary)] mb-1">
                Ollama Host URL
              </label>
              <input
                type="url"
                value={ollamaHost}
                onChange={(e) => setOllamaHost(e.target.value)}
                placeholder="http://127.0.0.1:11434"
                className="w-full h-9 px-3 text-xs font-mono rounded-[4px] bg-[var(--surface-canvas)] border border-[var(--border-hairline)] text-[var(--ink-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
              />
            </div>

            <div>
              <label className="block text-[11px] text-[var(--ink-secondary)] mb-1">
                Local Ollama Model
              </label>
              {ollamaStatus?.available && ollamaStatus.models.length > 0 ? (
                <select
                  value={ollamaModel}
                  onChange={(e) => setOllamaModel(e.target.value)}
                  className="w-full h-9 px-2.5 text-xs font-mono rounded-[4px] bg-[var(--surface-canvas)] border border-[var(--border-hairline)] text-[var(--ink-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                >
                  {!ollamaStatus.models.some((m) => m.name === ollamaModel) && (
                    <option value={ollamaModel}>{ollamaModel} (not installed)</option>
                  )}
                  {ollamaStatus.models.map((m) => (
                    <option key={m.name} value={m.name}>
                      {m.name}
                      {m.parameterSize ? ` (${m.parameterSize})` : ''}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={ollamaModel}
                  onChange={(e) => setOllamaModel(e.target.value)}
                  placeholder="qwen2.5-coder:7b"
                  className="w-full h-9 px-3 text-xs font-mono rounded-[4px] bg-[var(--surface-canvas)] border border-[var(--border-hairline)] text-[var(--ink-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                />
              )}
            </div>
          </div>

          <div className="px-3 py-2 rounded-lg bg-[var(--surface-subtle)] border border-[var(--border-hairline)] text-[11px] text-[var(--ink-secondary)] flex items-start gap-2">
            <HardDrive className="w-3.5 h-3.5 text-[var(--accent-primary)] shrink-0 mt-0.5" />
            <span>
              DevMind Studio never downloads large local models automatically without your consent. To install a model locally, run{' '}
              <code className="font-mono text-[var(--ink-primary)]">ollama pull {ollamaModel || 'qwen2.5-coder:7b'}</code>{' '}
              and click Detect.
            </span>
          </div>

          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-[var(--ink-secondary)]">{routingFeedback}</span>
            <button
              type="submit"
              disabled={savingRouting}
              className="h-8 px-4 text-xs font-medium rounded-[4px] bg-[var(--accent-primary)] text-[var(--accent-ink)] hover:bg-[var(--accent-hover)] disabled:opacity-40 inline-flex items-center gap-1.5"
            >
              {savingRouting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Save AI Routing
            </button>
          </div>
        </form>

        {/* Desktop Appearance & Standalone Windows Runtime */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 apple-card space-y-3">
            <h2 className="text-xs font-semibold text-[var(--ink-primary)]">
              Appearance
            </h2>
            <p className="text-xs text-[var(--ink-secondary)]">
              Switch between macOS Sequoia Obsidian Dark and Porcelain Light surfaces.
            </p>
            <div className="apple-segmented w-full grid grid-cols-2">
              <button
                type="button"
                data-active={theme === 'dark'}
                onClick={() => onThemeChange('dark')}
                className="apple-segmented-item h-8 px-3 text-xs font-medium inline-flex items-center justify-center gap-2 text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]"
              >
                <Moon className="w-3.5 h-3.5" />
                Dark
              </button>
              <button
                type="button"
                data-active={theme === 'light'}
                onClick={() => onThemeChange('light')}
                className="apple-segmented-item h-8 px-3 text-xs font-medium inline-flex items-center justify-center gap-2 text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]"
              >
                <Sun className="w-3.5 h-3.5" />
                Light
              </button>
            </div>
          </div>

          <div className="p-4 apple-card space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold text-[var(--ink-primary)] inline-flex items-center gap-1.5">
                <Monitor className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                Standalone Windows .exe
              </h2>
              <span className="text-[11px] font-mono text-[var(--ink-muted)]">
                {systemInfo ? `Electron ${systemInfo.electronVersion}` : 'NSIS + Portable x64'}
              </span>
            </div>
            <p className="text-xs text-[var(--ink-secondary)]">
              Builds a self-contained Windows installer & portable `.exe` via{' '}
              <code className="font-mono text-[var(--ink-primary)]">npm run build:win</code> (in-process bundled Express server, zero Node.js/tsx dependency).
            </p>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-mono text-[var(--ink-muted)]">
                {systemInfo
                  ? `${systemInfo.platform} ${systemInfo.arch} · RSS ${systemInfo.memoryMb} MB`
                  : 'Target: win32 x64'}
              </span>
              <button
                type="button"
                onClick={handleDownloadBuildScript}
                className="h-8 px-3 text-xs font-medium rounded-lg border border-[var(--border-strong)] bg-[var(--surface-canvas)] text-[var(--ink-primary)] hover:bg-[var(--surface-hover)] inline-flex items-center gap-1.5 transition-colors"
              >
                <Download className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                Download .bat Builder
              </button>
            </div>
          </div>
        </section>

        {/* BYOK Online LLM Provider Configuration */}
        <form onSubmit={handleSaveLlm} className="p-4 apple-card space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--ink-primary)] inline-flex items-center gap-1.5">
              <KeyRound className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
              Online AI Provider Connection (BYOK)
            </h2>
            <span className="text-[11px] font-mono text-[var(--ink-muted)]">
              Active Key: {session.llm.hasApiKey ? session.llm.maskedKey : 'Not Configured'}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-[11px] text-[var(--ink-secondary)] mb-1">Provider</label>
              <select
                value={provider}
                onChange={(e) => handleProviderSelect(e.target.value as LlmProviderId)}
                className="w-full h-9 px-2.5 text-xs rounded-[4px] bg-[var(--surface-canvas)] border border-[var(--border-hairline)] text-[var(--ink-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
              >
                {presets.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-[var(--ink-secondary)] mb-1">Model ID</label>
              <input
                type="text"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full h-9 px-3 text-xs font-mono rounded-[4px] bg-[var(--surface-canvas)] border border-[var(--border-hairline)] text-[var(--ink-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
              />
            </div>
            <div>
              <label className="block text-[11px] text-[var(--ink-secondary)] mb-1">Base URL</label>
              <input
                type="url"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                className="w-full h-9 px-3 text-xs font-mono rounded-[4px] bg-[var(--surface-canvas)] border border-[var(--border-hairline)] text-[var(--ink-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
              />
            </div>
            <div>
              <label className="block text-[11px] text-[var(--ink-secondary)] mb-1">
                New API Key (leave blank to retain current key)
              </label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-..."
                className="w-full h-9 px-3 text-xs font-mono rounded-[4px] bg-[var(--surface-canvas)] border border-[var(--border-hairline)] text-[var(--ink-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
              />
            </div>
          </div>

          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-[var(--ink-secondary)]">{llmFeedback}</span>
            <button
              type="submit"
              disabled={savingLlm}
              className="h-8 px-4 text-xs font-medium rounded-[4px] bg-[var(--accent-primary)] text-[var(--accent-ink)] hover:bg-[var(--accent-hover)] disabled:opacity-40 inline-flex items-center gap-1.5"
            >
              {savingLlm && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Update Provider
            </button>
          </div>
        </form>

        {/* Permission Policy Matrix */}
        <section className="border border-[var(--border-hairline)] rounded-[4px] bg-[var(--surface-elevated)] overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--border-hairline)] flex items-center gap-2">
            <Shield className="w-4 h-4 text-[var(--accent-primary)]" />
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--ink-primary)]">
              Workspace Permission Policies
            </h2>
          </div>

          <div className="divide-y divide-[var(--border-hairline)]">
            {policies.map((rule) => (
              <div
                key={rule.actionType}
                className="px-4 py-3 flex flex-wrap items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-[var(--ink-primary)]">{rule.label}</span>
                    <span className="text-[10px] font-mono uppercase text-[var(--ink-muted)]">
                      {rule.category}
                    </span>
                  </div>
                  <p className="text-[11px] text-[var(--ink-secondary)] mt-0.5">{rule.description}</p>
                </div>

                <select
                  value={rule.level}
                  onChange={(e) => onUpdatePolicy(rule.actionType, e.target.value as PermissionLevel)}
                  className="h-8 px-2.5 text-xs rounded-[4px] bg-[var(--surface-canvas)] border border-[var(--border-strong)] text-[var(--ink-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                >
                  <option value="allowed">Allowed</option>
                  <option value="approval_required">Approval Required</option>
                  <option value="explicit_approval">Explicit Approval</option>
                  <option value="restricted">Restricted (Blocked)</option>
                </select>
              </div>
            ))}
          </div>
        </section>

        {/* Spend Guardrails */}
        <form
          onSubmit={handleSaveBudget}
          className="p-4 rounded-[4px] border border-[var(--border-hairline)] bg-[var(--surface-elevated)] space-y-4"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--ink-primary)] inline-flex items-center gap-1.5">
              <Wallet className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
              Monthly Budget Guardrails
            </h2>
            <span className="text-[11px] font-mono tabular-nums text-[var(--ink-muted)]">
              Spent ${(usage?.spentUsd ?? 0).toFixed(4)} · {(usage?.tokensUsed ?? 0).toLocaleString()} tokens
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-[11px] text-[var(--ink-secondary)] mb-1">
                Monthly Spend Cap (USD)
              </label>
              <input
                type="number"
                min="1"
                step="1"
                value={budgetUsd}
                onChange={(e) => setBudgetUsd(e.target.value)}
                className="w-full h-9 px-3 text-xs font-mono rounded-[4px] bg-[var(--surface-canvas)] border border-[var(--border-hairline)] text-[var(--ink-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
              />
            </div>
            <div>
              <label className="block text-[11px] text-[var(--ink-secondary)] mb-1">
                Monthly Token Cap
              </label>
              <input
                type="number"
                min="100000"
                step="100000"
                value={tokenLimit}
                onChange={(e) => setTokenLimit(e.target.value)}
                className="w-full h-9 px-3 text-xs font-mono rounded-[4px] bg-[var(--surface-canvas)] border border-[var(--border-hairline)] text-[var(--ink-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3">
            {budgetSaved && (
              <span className="text-xs text-[var(--status-success)] inline-flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Saved
              </span>
            )}
            <button
              type="submit"
              disabled={savingBudget}
              className="h-8 px-4 text-xs font-medium rounded-[4px] bg-[var(--accent-primary)] text-[var(--accent-ink)] hover:bg-[var(--accent-hover)] disabled:opacity-40"
            >
              Save Limits
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
