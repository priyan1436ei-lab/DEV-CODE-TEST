import React, { useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Cpu,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  Monitor,
  ShieldCheck,
  Terminal,
  Zap,
} from 'lucide-react';
import { devmindApi, type ProviderPreset } from '../services/api';
import type { LlmProviderId, PublicUserSession } from '../types/devmind';

interface LoginGateProps {
  presets: ProviderPreset[];
  onAuthenticated: (token: string, session: PublicUserSession) => void;
}

const FALLBACK_PRESETS: ProviderPreset[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    protocol: 'openai_compatible',
    defaultBaseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    requiresKey: true,
    suggestedModels: ['gpt-4o-mini', 'gpt-4.1-mini', 'gpt-4.1'],
    inputPerMillionUsd: 0.15,
    outputPerMillionUsd: 0.6,
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    protocol: 'openai_compatible',
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'openai/gpt-4o-mini',
    requiresKey: true,
    suggestedModels: ['openai/gpt-4o-mini', 'anthropic/claude-3.5-sonnet', 'deepseek/deepseek-chat'],
    inputPerMillionUsd: 0.25,
    outputPerMillionUsd: 0.9,
  },
  {
    id: 'anthropic',
    name: 'Anthropic Claude',
    protocol: 'anthropic',
    defaultBaseUrl: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-sonnet-4-20250514',
    requiresKey: true,
    suggestedModels: ['claude-sonnet-4-20250514', 'claude-3-5-haiku-latest'],
    inputPerMillionUsd: 3.0,
    outputPerMillionUsd: 15.0,
  },
  {
    id: 'groq',
    name: 'Groq',
    protocol: 'openai_compatible',
    defaultBaseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.3-70b-versatile',
    requiresKey: true,
    suggestedModels: ['llama-3.3-70b-versatile', 'qwen-2.5-coder-32b'],
    inputPerMillionUsd: 0.59,
    outputPerMillionUsd: 0.79,
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    protocol: 'openai_compatible',
    defaultBaseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    requiresKey: true,
    suggestedModels: ['deepseek-chat', 'deepseek-reasoner'],
    inputPerMillionUsd: 0.27,
    outputPerMillionUsd: 1.1,
  },
  {
    id: 'ollama',
    name: 'Ollama (Local)',
    protocol: 'openai_compatible',
    defaultBaseUrl: 'http://localhost:11434/v1',
    defaultModel: 'qwen2.5-coder:7b',
    requiresKey: false,
    suggestedModels: ['qwen2.5-coder:7b', 'llama3.1:8b'],
    inputPerMillionUsd: 0,
    outputPerMillionUsd: 0,
  },
  {
    id: 'custom',
    name: 'Custom OpenAI-Compatible',
    protocol: 'openai_compatible',
    defaultBaseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    requiresKey: false,
    suggestedModels: [],
    inputPerMillionUsd: 0.5,
    outputPerMillionUsd: 1.5,
  },
];

export const LoginGate: React.FC<LoginGateProps> = ({ presets, onAuthenticated }) => {
  const effectivePresets = presets.length > 0 ? presets : FALLBACK_PRESETS;
  const [displayName, setDisplayName] = useState('Staff Engineer');
  const [email, setEmail] = useState('engineer@workspace.dev');
  const [provider, setProvider] = useState<LlmProviderId>('openai');
  const [baseUrl, setBaseUrl] = useState('https://api.openai.com/v1');
  const [model, setModel] = useState('gpt-4o-mini');
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activePreset = effectivePresets.find((p) => p.id === provider) ?? effectivePresets[0];

  const handleSelectProvider = (nextId: LlmProviderId) => {
    setProvider(nextId);
    const nextPreset = effectivePresets.find((p) => p.id === nextId);
    if (nextPreset) {
      setBaseUrl(nextPreset.defaultBaseUrl);
      setModel(nextPreset.defaultModel);
    }
    setTestResult(null);
    setError(null);
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setError(null);
    setTestResult(null);
    try {
      const res = await devmindApi.testLlmConnection({
        provider,
        baseUrl,
        model,
        apiKey,
      });
      setTestResult({
        ok: true,
        message: `Connected to ${res.model} in ${res.latencyMs}ms.`,
      });
    } catch (err) {
      setTestResult({
        ok: false,
        message: err instanceof Error ? err.message : 'Connection failed.',
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSubmit = async (sandboxOnly: boolean) => {
    setError(null);
    setSubmitting(true);
    try {
      const res = await devmindApi.login({
        displayName: displayName.trim() || 'Developer',
        email: email.trim() || 'developer@workspace.local',
        provider,
        baseUrl,
        model,
        apiKey,
        sandboxOnly,
      });
      onAuthenticated(res.token, res.session);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="h-screen w-screen overflow-auto bg-[#090B10] text-[#E6E9F2] flex items-stretch">
      {/* Left Architectural Showcase Column */}
      <div className="hidden lg:flex lg:w-[46%] flex-col justify-between p-12 bg-[#0D1018] border-r border-[#1E2433] relative overflow-hidden">
        <div
          className="pointer-events-none absolute -top-32 -left-32 w-[420px] h-[420px] rounded-full opacity-25 blur-3xl"
          style={{ background: 'radial-gradient(circle, #5B7CFF 0%, transparent 70%)' }}
        />

        <div className="relative z-10 space-y-8">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-[8px] bg-[#5B7CFF] flex items-center justify-center text-[#090B10] font-bold text-[16px]">
              D
            </div>
            <div>
              <div className="text-[16px] font-bold tracking-tight text-[#E6E9F2]">DevMind AI</div>
              <div className="text-[12px] text-[#6B728A]">Autonomous Software Engineering Studio</div>
            </div>
          </div>

          <div className="space-y-4 max-w-md pt-4">
            <h1 className="text-[30px] font-semibold tracking-tight leading-[1.18] text-[#E6E9F2] [text-wrap:balance]">
              Connect your own LLM. Engineer with real sandbox proof.
            </h1>
            <p className="text-[14px] text-[#A3AABF] leading-relaxed">
              DevMind AI routes directly through your own LLM provider API — OpenAI, OpenRouter,
              Anthropic, Groq, DeepSeek, or local Ollama — paired with live repository indexing,
              approval checkpoints, and V8 test coverage verification.
            </p>
          </div>

          <div className="space-y-4 pt-4 max-w-md">
            <div className="flex items-start gap-3.5">
              <KeyRound className="w-4 h-4 text-[#5B7CFF] mt-0.5 shrink-0" />
              <div>
                <div className="text-[13px] font-semibold text-[#E6E9F2]">
                  Bring Your Own LLM Gateway
                </div>
                <div className="text-[12px] text-[#A3AABF]">
                  Zero vendor lock-in. Your API key stays strictly in active server session memory
                  and is never written to disk or exposed back to the browser.
                </div>
              </div>
            </div>

            <div className="flex items-start gap-3.5">
              <Cpu className="w-4 h-4 text-[#2FD68B] mt-0.5 shrink-0" />
              <div>
                <div className="text-[13px] font-semibold text-[#E6E9F2]">
                  Real-Time Synced Workspace & Repository Brain
                </div>
                <div className="text-[12px] text-[#A3AABF]">
                  Edit code directly with live incremental AST re-indexing, dependency graph
                  traversal, and Server-Sent Events synchronization.
                </div>
              </div>
            </div>

            <div className="flex items-start gap-3.5">
              <ShieldCheck className="w-4 h-4 text-[#F5B642] mt-0.5 shrink-0" />
              <div>
                <div className="text-[13px] font-semibold text-[#E6E9F2]">
                  Approval-Gated Patches & Isolated V8 Coverage
                </div>
                <div className="text-[12px] text-[#A3AABF]">
                  Inspect unified diffs, roll back instantly, and verify fixes with real isolated
                  sandbox test execution and per-file coverage metrics.
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="relative z-10 flex items-center justify-between pt-8 border-t border-[#1E2433] text-[12px] text-[#6B728A]">
          <span className="flex items-center gap-2">
            <Monitor className="w-3.5 h-3.5 text-[#A3AABF]" />
            <span>Windows 11 Desktop (.exe) Electron package ready</span>
          </span>
          <span className="font-mono">v1.0.0</span>
        </div>
      </div>

      {/* Right Interactive Sign-In & BYOK LLM Connector */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-lg space-y-6">
          <div className="space-y-1">
            <h2 className="text-[22px] font-semibold tracking-tight text-[#E6E9F2]">
              Sign in & connect your LLM API
            </h2>
            <p className="text-[13px] text-[#A3AABF]">
              Configure your preferred provider below. Once inside, every AI chat, root-cause debug,
              and autonomous patch uses your connected endpoint.
            </p>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleSubmit(false);
            }}
            className="bg-[#10131C] border border-[#1E2433] rounded-[12px] p-6 space-y-5"
          >
            {/* User Identity */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div className="space-y-1.5">
                <label htmlFor="login-name" className="block text-[12px] font-medium text-[#A3AABF]">
                  Developer Name
                </label>
                <input
                  id="login-name"
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full bg-[#090B10] border border-[#262E42] focus:border-[#5B7CFF] rounded-[7px] px-3 py-2 text-[13px] text-[#E6E9F2] outline-none"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="login-email" className="block text-[12px] font-medium text-[#A3AABF]">
                  Workspace Email
                </label>
                <input
                  id="login-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-[#090B10] border border-[#262E42] focus:border-[#5B7CFF] rounded-[7px] px-3 py-2 text-[13px] text-[#E6E9F2] outline-none"
                />
              </div>
            </div>

            {/* Provider Selector Grid */}
            <div className="space-y-2">
              <span className="block text-[12px] font-medium text-[#A3AABF]">
                Select Your LLM Provider
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {effectivePresets.map((p) => {
                  const selected = p.id === provider;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handleSelectProvider(p.id)}
                      className={`px-2.5 py-2 rounded-[7px] text-[12px] font-medium border text-left transition-colors whitespace-nowrap truncate ${
                        selected
                          ? 'bg-[#5B7CFF]/15 border-[#5B7CFF] text-[#E6E9F2]'
                          : 'bg-[#090B10] border-[#1E2433] text-[#A3AABF] hover:text-[#E6E9F2] hover:border-[#2B3347]'
                      }`}
                    >
                      {p.name.replace(' Claude', '').replace(' (Local)', '').replace(' OpenAI-Compatible', '')}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Endpoint & Model */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div className="space-y-1.5">
                <label htmlFor="llm-base-url" className="block text-[12px] font-medium text-[#A3AABF]">
                  API Base URL
                </label>
                <input
                  id="llm-base-url"
                  type="url"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="https://api.openai.com/v1"
                  className="w-full bg-[#090B10] border border-[#262E42] focus:border-[#5B7CFF] rounded-[7px] px-3 py-2 font-mono text-[12px] text-[#E6E9F2] outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="llm-model" className="block text-[12px] font-medium text-[#A3AABF]">
                  Model ID
                </label>
                <input
                  id="llm-model"
                  type="text"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="gpt-4o-mini"
                  className="w-full bg-[#090B10] border border-[#262E42] focus:border-[#5B7CFF] rounded-[7px] px-3 py-2 font-mono text-[12px] text-[#E6E9F2] outline-none"
                />
              </div>
            </div>

            {/* Suggested Model Shortcuts */}
            {activePreset && activePreset.suggestedModels.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-[#6B728A]">Quick models:</span>
                {activePreset.suggestedModels.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setModel(m)}
                    className={`px-2 py-0.5 rounded-[5px] font-mono text-[11px] border transition-colors ${
                      model === m
                        ? 'bg-[#161A26] border-[#5B7CFF] text-[#E6E9F2]'
                        : 'bg-[#090B10] border-[#1E2433] text-[#A3AABF] hover:text-[#E6E9F2]'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            )}

            {/* User LLM API Key */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="llm-api-key" className="text-[12px] font-medium text-[#A3AABF]">
                  Your LLM API Key {!activePreset?.requiresKey && '(Optional for Local Ollama)'}
                </label>
                <span className="flex items-center gap-1 text-[11px] text-[#6B728A]">
                  <Lock className="w-3 h-3" />
                  <span>Session memory only</span>
                </span>
              </div>
              <div className="relative">
                <input
                  id="llm-api-key"
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={
                    provider === 'anthropic'
                      ? 'sk-ant-...'
                      : provider === 'openrouter'
                        ? 'sk-or-v1-...'
                        : provider === 'groq'
                          ? 'gsk_...'
                          : provider === 'ollama'
                            ? 'Leave empty for local Ollama'
                            : 'sk-...'
                  }
                  className="w-full bg-[#090B10] border border-[#262E42] focus:border-[#5B7CFF] rounded-[7px] pl-3 pr-10 py-2 font-mono text-[12px] text-[#E6E9F2] outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowKey((v) => !v)}
                  aria-label={showKey ? 'Hide API key' : 'Show API key'}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#6B728A] hover:text-[#E6E9F2]"
                >
                  {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Live Connection Test Result */}
            {testResult && (
              <div
                className={`px-3 py-2 rounded-[7px] text-[12px] border flex items-center gap-2 ${
                  testResult.ok
                    ? 'bg-[#2FD68B]/10 border-[#2FD68B]/35 text-[#2FD68B]'
                    : 'bg-[#FF5468]/10 border-[#FF5468]/35 text-[#FF5468]'
                }`}
              >
                {testResult.ok ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                )}
                <span className="break-words">{testResult.message}</span>
              </div>
            )}

            {error && (
              <div className="px-3 py-2 rounded-[7px] text-[12px] bg-[#FF5468]/10 border border-[#FF5468]/35 text-[#FF5468]">
                {error}
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-wrap items-center gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => void handleTestConnection()}
                disabled={testing || !baseUrl.trim() || !model.trim()}
                className="flex items-center gap-1.5 px-3.5 py-2.5 text-[12px] font-medium bg-[#161A26] hover:bg-[#1E2433] disabled:opacity-50 text-[#E6E9F2] border border-[#2B3347] rounded-[7px] transition-colors whitespace-nowrap"
              >
                <Zap className="w-3.5 h-3.5 text-[#F5B642]" />
                <span>{testing ? 'Testing...' : 'Test Connection'}</span>
              </button>

              <button
                type="submit"
                disabled={submitting}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-[13px] font-semibold bg-[#5B7CFF] hover:bg-[#7C96FF] disabled:opacity-50 text-[#090B10] rounded-[7px] transition-colors whitespace-nowrap"
              >
                <span>{submitting ? 'Connecting...' : 'Connect LLM & Launch Studio'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>

            <div className="pt-3 border-t border-[#1E2433] flex items-center justify-between gap-2">
              <span className="text-[12px] text-[#6B728A]">
                Want to edit code, scan security, and run sandbox tests first?
              </span>
              <button
                type="button"
                onClick={() => void handleSubmit(true)}
                disabled={submitting}
                className="flex items-center gap-1 text-[12px] font-medium text-[#7C96FF] hover:text-[#E6E9F2] whitespace-nowrap"
              >
                <Terminal className="w-3.5 h-3.5" />
                <span>Sandbox Mode</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
