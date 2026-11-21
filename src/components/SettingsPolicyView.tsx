import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Download,
  KeyRound,
  Loader2,
  Monitor,
  Moon,
  Shield,
  Sun,
  Wallet,
} from 'lucide-react';
import { devmindApi, type ProviderPreset } from '../services/api';
import type {
  LlmProviderId,
  PermissionLevel,
  PermissionPolicyRule,
  PublicUserSession,
  UsageLedger,
} from '../types/devmind';

interface SettingsPolicyViewProps {
  session: PublicUserSession;
  policies: PermissionPolicyRule[];
  presets: ProviderPreset[];
  usage: UsageLedger | null;
  theme: 'dark' | 'light';
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
call npm run build:win
if errorlevel 1 exit /b 1
echo.
echo [DONE] Built NSIS Installer and Portable .exe in release\\
pause
`;

export const SettingsPolicyView: React.FC<SettingsPolicyViewProps> = ({
  session,
  policies,
  presets,
  usage,
  theme,
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

  useEffect(() => {
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
      setLlmFeedback('Model connection updated in server session.');
    } catch (err) {
      setLlmFeedback(err instanceof Error ? err.message : 'Unable to save provider settings.');
    } finally {
      setSavingLlm(false);
    }
  };

  const handleSaveBudget = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingBudget(true);
    setBudgetSaved(false);
    try {
      await onUpdateBudget(Math.max(1, Number(budgetUsd) || 25), Math.max(100000, Number(tokenLimit) || 5000000));
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
          <h1 className="text-lg font-semibold text-[var(--ink-primary)] tracking-tight">
            Settings, Policies & Windows Runtime
          </h1>
          <p className="text-xs text-[var(--ink-secondary)] mt-0.5">
            Configure desktop appearance, Windows `.exe` packaging, model endpoints, permission guardrails, and spend caps.
          </p>
        </div>

        {/* Desktop Appearance & Windows Runtime */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 rounded-[4px] border border-[var(--border-hairline)] bg-[var(--surface-elevated)] space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--ink-primary)]">
              Desktop Theme
            </h2>
            <p className="text-xs text-[var(--ink-secondary)]">
              Switch between Windows 11 Fluent Dark and Ceramic Light surfaces.
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onThemeChange('dark')}
                className={`flex-1 h-9 px-3 text-xs font-medium rounded-[4px] border inline-flex items-center justify-center gap-2 transition-colors ${
                  theme === 'dark'
                    ? 'border-[var(--accent-primary)] bg-[var(--accent-soft)] text-[var(--accent-primary)]'
                    : 'border-[var(--border-hairline)] bg-[var(--surface-canvas)] text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]'
                }`}
              >
                <Moon className="w-3.5 h-3.5" />
                Windows Dark
              </button>
              <button
                type="button"
                onClick={() => onThemeChange('light')}
                className={`flex-1 h-9 px-3 text-xs font-medium rounded-[4px] border inline-flex items-center justify-center gap-2 transition-colors ${
                  theme === 'light'
                    ? 'border-[var(--accent-primary)] bg-[var(--accent-soft)] text-[var(--accent-primary)]'
                    : 'border-[var(--border-hairline)] bg-[var(--surface-canvas)] text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]'
                }`}
              >
                <Sun className="w-3.5 h-3.5" />
                Windows Light
              </button>
            </div>
          </div>

          <div className="p-4 rounded-[4px] border border-[var(--border-hairline)] bg-[var(--surface-elevated)] space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--ink-primary)] inline-flex items-center gap-1.5">
                <Monitor className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                Windows Standalone .exe
              </h2>
              <span className="text-[11px] font-mono text-[var(--ink-muted)]">
                {systemInfo ? `Electron ${systemInfo.electronVersion}` : 'NSIS + Portable x64'}
              </span>
            </div>
            <p className="text-xs text-[var(--ink-secondary)]">
              Build a standalone Windows installer and portable executable via{' '}
              <code className="font-mono text-[var(--ink-primary)]">npm run build:win</code> (embedded Node runtime, 512MB V8 heap cap, zero external runtime dependencies).
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
                className="h-8 px-3 text-xs font-medium rounded-[4px] border border-[var(--border-strong)] bg-[var(--surface-canvas)] text-[var(--ink-primary)] hover:bg-[var(--surface-hover)] inline-flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                Download .bat Builder
              </button>
            </div>
          </div>
        </section>

        {/* BYOK LLM Provider Configuration */}
        <form
          onSubmit={handleSaveLlm}
          className="p-4 rounded-[4px] border border-[var(--border-hairline)] bg-[var(--surface-elevated)] space-y-4"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--ink-primary)] inline-flex items-center gap-1.5">
              <KeyRound className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
              Model Provider Connection
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
