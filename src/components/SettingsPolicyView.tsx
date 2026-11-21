import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  Monitor,
  Save,
  Zap,
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
  onUpdateLlm: (input: {
    provider: LlmProviderId;
    baseUrl: string;
    model: string;
    apiKey: string;
  }) => Promise<void>;
  onUpdatePolicy: (actionType: string, level: PermissionLevel) => Promise<void>;
  onUpdateBudget: (monthlyBudgetUsd: number, monthlyTokenLimit: number) => Promise<void>;
}

const WINDOWS_BUILD_BAT = `@echo off
setlocal
echo ========================================================
echo   DevMind AI — Windows 11 Executable (.exe) Builder
echo ========================================================
call npm install
call npm install -D electron electron-builder
call npm run build
call npx electron-builder --win --config electron-builder.yml
echo Done! Find your installer & portable .exe inside dist-electron\\
pause
`;

export const SettingsPolicyView: React.FC<SettingsPolicyViewProps> = ({
  session,
  policies,
  presets,
  usage,
  onUpdateLlm,
  onUpdatePolicy,
  onUpdateBudget,
}) => {
  const safePolicies = Array.isArray(policies) ? policies : [];
  const safePresets = Array.isArray(presets) ? presets : [];

  const [provider, setProvider] = useState<LlmProviderId>(session.llm.provider);
  const [baseUrl, setBaseUrl] = useState(session.llm.baseUrl || 'https://api.openai.com/v1');
  const [model, setModel] = useState(session.llm.model || 'gpt-4o-mini');
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [testingLlm, setTestingLlm] = useState(false);
  const [savingLlm, setSavingLlm] = useState(false);
  const [llmStatus, setLlmStatus] = useState<{ ok: boolean; text: string } | null>(null);

  const [budgetUsd, setBudgetUsd] = useState(String(usage?.monthlyBudgetUsd ?? 25));
  const [tokenLimit, setTokenLimit] = useState(String(usage?.monthlyTokenLimit ?? 2000000));
  const [savingBudget, setSavingBudget] = useState(false);

  useEffect(() => {
    setBudgetUsd(String(usage?.monthlyBudgetUsd ?? 25));
    setTokenLimit(String(usage?.monthlyTokenLimit ?? 2000000));
  }, [usage?.monthlyBudgetUsd, usage?.monthlyTokenLimit]);

  useEffect(() => {
    setProvider(session.llm.provider);
    if (session.llm.baseUrl) setBaseUrl(session.llm.baseUrl);
    if (session.llm.model) setModel(session.llm.model);
  }, [session.llm.provider, session.llm.baseUrl, session.llm.model]);

  const handleProviderChange = (next: LlmProviderId) => {
    setProvider(next);
    const p = safePresets.find((x) => x.id === next);
    if (p) {
      setBaseUrl(p.defaultBaseUrl);
      setModel(p.defaultModel);
    }
    setLlmStatus(null);
  };

  const handleTestLlm = async () => {
    setTestingLlm(true);
    setLlmStatus(null);
    try {
      const res = await devmindApi.testLlmConnection({
        provider,
        baseUrl,
        model,
        apiKey,
      });
      setLlmStatus({ ok: true, text: `Connected to ${res.model} in ${res.latencyMs}ms.` });
    } catch (err) {
      setLlmStatus({
        ok: false,
        text: err instanceof Error ? err.message : 'Connection test failed.',
      });
    } finally {
      setTestingLlm(false);
    }
  };

  const handleSaveLlm = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingLlm(true);
    setLlmStatus(null);
    try {
      await onUpdateLlm({ provider, baseUrl, model, apiKey });
      setApiKey('');
      setLlmStatus({ ok: true, text: `Active session LLM updated to ${provider} / ${model}.` });
    } catch (err) {
      setLlmStatus({
        ok: false,
        text: err instanceof Error ? err.message : 'Failed to update LLM configuration.',
      });
    } finally {
      setSavingLlm(false);
    }
  };

  const handleSaveBudget = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingBudget(true);
    try {
      await onUpdateBudget(Number(budgetUsd) || 25, Number(tokenLimit) || 2000000);
    } finally {
      setSavingBudget(false);
    }
  };

  const handleDownloadWindowsScript = () => {
    const blob = new Blob([WINDOWS_BUILD_BAT], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'build-windows-exe.bat';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="h-full overflow-auto bg-[#090B10] p-6 space-y-6">
      <div className="border-b border-[#1E2433] pb-4">
        <h1 className="text-[20px] font-semibold text-[#E6E9F2] tracking-tight">
          BYOK LLM Gateway, Governance & Windows Desktop
        </h1>
        <p className="text-[13px] text-[#A3AABF] mt-1">
          Manage your connected LLM API, tool permission policies, spending caps, and Windows 11 executable packaging.
        </p>
      </div>

      {/* Live BYOK LLM Connection Manager */}
      <section className="bg-[#10131C] border border-[#1E2433] rounded-[10px] p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-[#5B7CFF]" />
            <h2 className="text-[15px] font-semibold text-[#E6E9F2]">
              Active User LLM API Connection
            </h2>
          </div>
          <span className="font-mono text-[12px] text-[#A3AABF]">
            {session.llm.configured
              ? `${session.llm.provider} · ${session.llm.model}${session.llm.maskedKey ? ` · ${session.llm.maskedKey}` : ''}`
              : 'Not connected (Sandbox Mode)'}
          </span>
        </div>

        <form onSubmit={(e) => void handleSaveLlm(e)} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="space-y-1">
              <label htmlFor="cfg-provider" className="block text-[12px] text-[#A3AABF]">
                Provider
              </label>
              <select
                id="cfg-provider"
                value={provider}
                onChange={(e) => handleProviderChange(e.target.value as LlmProviderId)}
                className="w-full bg-[#090B10] border border-[#262E42] rounded-[6px] px-3 py-2 text-[12px] text-[#E6E9F2] outline-none"
              >
                {safePresets.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label htmlFor="cfg-baseurl" className="block text-[12px] text-[#A3AABF]">
                API Base URL
              </label>
              <input
                id="cfg-baseurl"
                type="url"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                className="w-full bg-[#090B10] border border-[#262E42] focus:border-[#5B7CFF] rounded-[6px] px-3 py-2 font-mono text-[12px] text-[#E6E9F2] outline-none"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="cfg-model" className="block text-[12px] text-[#A3AABF]">
                Model ID
              </label>
              <input
                id="cfg-model"
                type="text"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full bg-[#090B10] border border-[#262E42] focus:border-[#5B7CFF] rounded-[6px] px-3 py-2 font-mono text-[12px] text-[#E6E9F2] outline-none"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="cfg-apikey" className="block text-[12px] text-[#A3AABF]">
                API Key {session.llm.hasApiKey ? '(leave blank to keep)' : ''}
              </label>
              <div className="relative">
                <input
                  id="cfg-apikey"
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={session.llm.maskedKey || 'sk-...'}
                  className="w-full bg-[#090B10] border border-[#262E42] focus:border-[#5B7CFF] rounded-[6px] pl-3 pr-9 py-2 font-mono text-[12px] text-[#E6E9F2] outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowKey((v) => !v)}
                  aria-label="Toggle API key visibility"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#6B728A] hover:text-[#E6E9F2]"
                >
                  {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          </div>

          {llmStatus && (
            <div
              className={`px-3 py-2 rounded-[6px] text-[12px] border flex items-center gap-2 ${
                llmStatus.ok
                  ? 'bg-[#2FD68B]/10 border-[#2FD68B]/35 text-[#2FD68B]'
                  : 'bg-[#FF5468]/10 border-[#FF5468]/35 text-[#FF5468]'
              }`}
            >
              {llmStatus.ok ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 shrink-0" />
              )}
              <span>{llmStatus.text}</span>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => void handleTestLlm()}
              disabled={testingLlm}
              className="flex items-center gap-1.5 px-3.5 py-2 text-[12px] font-medium bg-[#161A26] hover:bg-[#1E2433] text-[#E6E9F2] border border-[#2B3347] rounded-[6px] whitespace-nowrap"
            >
              <Zap className="w-3.5 h-3.5 text-[#F5B642]" />
              <span>{testingLlm ? 'Testing...' : 'Test Connection'}</span>
            </button>
            <button
              type="submit"
              disabled={savingLlm}
              className="flex items-center gap-1.5 px-4 py-2 text-[12px] font-semibold bg-[#5B7CFF] hover:bg-[#7C96FF] text-[#090B10] rounded-[6px] whitespace-nowrap"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{savingLlm ? 'Updating...' : 'Save Active LLM'}</span>
            </button>
          </div>
        </form>
      </section>

      {/* Windows 11 Desktop (.exe) Packaging Card */}
      <section className="bg-[#10131C] border border-[#1E2433] rounded-[10px] p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Monitor className="w-4 h-4 text-[#4DB8FF]" />
            <div>
              <h2 className="text-[15px] font-semibold text-[#E6E9F2]">
                Windows 11 Desktop Executable (.exe) Package
              </h2>
              <p className="text-[12px] text-[#A3AABF]">
                Electron main process, preload bridge, and NSIS + Portable `.exe` builder config are bundled in this project.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleDownloadWindowsScript}
            className="flex items-center gap-1.5 px-3.5 py-2 text-[12px] font-medium bg-[#161A26] hover:bg-[#1E2433] text-[#E6E9F2] border border-[#2B3347] rounded-[6px] whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5 text-[#4DB8FF]" />
            <span>Download build-windows-exe.bat</span>
          </button>
        </div>

        <pre className="bg-[#090B10] border border-[#1E2433] rounded-[6px] p-3 font-mono text-[12px] text-[#A3AABF] overflow-x-auto">
{`# Run on Windows 11 to build DevMind-AI-1.0.0-x64.exe (NSIS Installer + Portable .exe)
npm install
npm install -D electron electron-builder
npm run build:win`}
        </pre>
      </section>

      {/* Permission Policy Matrix */}
      <section className="bg-[#10131C] border border-[#1E2433] rounded-[10px] overflow-hidden">
        <div className="px-5 py-3.5 border-b border-[#1E2433]">
          <h2 className="text-[15px] font-semibold text-[#E6E9F2]">
            Agent Permission Policy Matrix
          </h2>
          <p className="text-[12px] text-[#A3AABF] mt-0.5">
            Enforced server-side on every tool call before workspace mutation or sandbox execution.
          </p>
        </div>

        <div className="divide-y divide-[#1E2433]">
          {safePolicies.map((rule) => {
            const isLocked = rule.actionType === 'access_secrets';
            return (
              <div
                key={rule.actionType}
                className="flex flex-wrap items-center justify-between gap-4 px-5 py-3 hover:bg-[#161A26]/40"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-medium text-[#E6E9F2]">{rule.label}</span>
                    <span className="font-mono text-[11px] text-[#6B728A]">{rule.actionType}</span>
                  </div>
                  <p className="text-[12px] text-[#A3AABF]">{rule.description}</p>
                </div>

                {isLocked ? (
                  <div className="flex items-center gap-1.5 font-mono text-[12px] text-[#FF5468] shrink-0">
                    <Lock className="w-3.5 h-3.5" />
                    <span>RESTRICTED (LOCKED)</span>
                  </div>
                ) : (
                  <select
                    aria-label={`Permission for ${rule.label}`}
                    value={rule.level}
                    onChange={(e) =>
                      void onUpdatePolicy(rule.actionType, e.target.value as PermissionLevel)
                    }
                    className="bg-[#090B10] border border-[#262E42] text-[#E6E9F2] text-[12px] rounded-[6px] px-2.5 py-1.5 outline-none"
                  >
                    <option value="allowed">Allowed in Workspace</option>
                    <option value="approval_required">Approval Required</option>
                    <option value="explicit_approval">Explicit Approval Required</option>
                    <option value="restricted">Restricted (Blocked)</option>
                  </select>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Budget & Token Guardrails */}
      <section className="bg-[#10131C] border border-[#1E2433] rounded-[10px] p-5 space-y-4">
        <div>
          <h2 className="text-[15px] font-semibold text-[#E6E9F2]">
            Workspace Spending & Token Budget Controls
          </h2>
          <p className="text-[12px] text-[#A3AABF] mt-0.5">
            Real-time token and cost ledger synchronized across all connected clients.
          </p>
        </div>

        <form onSubmit={(e) => void handleSaveBudget(e)} className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
          <div className="space-y-1">
            <label htmlFor="budget-usd" className="block text-[12px] text-[#A3AABF]">
              Monthly Spend Limit (USD)
            </label>
            <input
              id="budget-usd"
              type="number"
              min="1"
              step="1"
              value={budgetUsd}
              onChange={(e) => setBudgetUsd(e.target.value)}
              className="w-full bg-[#090B10] border border-[#262E42] focus:border-[#5B7CFF] rounded-[6px] px-3 py-2 font-mono text-[13px] text-[#E6E9F2] outline-none tabular-nums"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="token-limit" className="block text-[12px] text-[#A3AABF]">
              Monthly Token Quota
            </label>
            <input
              id="token-limit"
              type="number"
              min="10000"
              step="50000"
              value={tokenLimit}
              onChange={(e) => setTokenLimit(e.target.value)}
              className="w-full bg-[#090B10] border border-[#262E42] focus:border-[#5B7CFF] rounded-[6px] px-3 py-2 font-mono text-[13px] text-[#E6E9F2] outline-none tabular-nums"
            />
          </div>

          <button
            type="submit"
            disabled={savingBudget}
            className="flex items-center justify-center gap-1.5 px-4 py-2 text-[13px] font-semibold bg-[#5B7CFF] hover:bg-[#7C96FF] text-[#090B10] rounded-[6px] transition-colors whitespace-nowrap"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{savingBudget ? 'Saving...' : 'Update Guardrails'}</span>
          </button>
        </form>

        {usage && Array.isArray(usage.recentRecords) && usage.recentRecords.length > 0 && (
          <div className="pt-3 border-t border-[#1E2433] space-y-2">
            <div className="text-[12px] font-medium text-[#A3AABF]">Recent Metered LLM Calls</div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[12px] font-mono tabular-nums">
                <thead>
                  <tr className="text-[#6B728A] border-b border-[#1E2433]">
                    <th className="py-1.5 pr-4 font-medium">Operation</th>
                    <th className="py-1.5 pr-4 font-medium">Provider / Model</th>
                    <th className="py-1.5 pr-4 font-medium text-right">Tokens</th>
                    <th className="py-1.5 pr-4 font-medium text-right">Latency</th>
                    <th className="py-1.5 font-medium text-right">Cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1E2433]/60 text-[#A3AABF]">
                  {usage.recentRecords.slice(0, 8).map((rec) => (
                    <tr key={rec.id}>
                      <td className="py-1.5 pr-4 text-[#E6E9F2]">{rec.operation}</td>
                      <td className="py-1.5 pr-4">
                        {rec.provider}/{rec.model}
                      </td>
                      <td className="py-1.5 pr-4 text-right">
                        {(rec.promptTokens + rec.completionTokens).toLocaleString()}
                      </td>
                      <td className="py-1.5 pr-4 text-right">{rec.latencyMs}ms</td>
                      <td className="py-1.5 text-right text-[#2FD68B]">${rec.costUsd.toFixed(6)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
};
