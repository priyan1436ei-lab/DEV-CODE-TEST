import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Blocks,
  CheckCircle2,
  Code2,
  Eye,
  EyeOff,
  FolderGit2,
  KeyRound,
  Loader2,
  Monitor,
  ShieldCheck,
} from 'lucide-react';
import { devmindApi, type ProviderPreset } from '../services/api';
import type { LlmProviderId, PublicUserSession } from '../types/devmind';

interface LoginGateProps {
  onAuthenticated: (token: string, session: PublicUserSession) => void;
}

export const LoginGate: React.FC<LoginGateProps> = ({ onAuthenticated }) => {
  const [presets, setPresets] = useState<ProviderPreset[]>([]);
  const [displayName, setDisplayName] = useState('Developer');
  const [email, setEmail] = useState('dev@workspace.local');
  const [provider, setProvider] = useState<LlmProviderId>('openai');
  const [baseUrl, setBaseUrl] = useState('https://api.openai.com/v1');
  const [model, setModel] = useState('gpt-4o-mini');
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    message: string;
    latencyMs?: number;
  } | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    devmindApi
      .getPresets()
      .then((res) => {
        setPresets(res.presets);
        const first = res.presets[0];
        if (first) {
          setProvider(first.id);
          setBaseUrl(first.defaultBaseUrl);
          setModel(first.defaultModel);
        }
      })
      .catch(() => {
        // Fallback defaults remain usable if server is still warming up.
      });
  }, []);

  const currentPreset = presets.find((p) => p.id === provider);

  const handleSelectProvider = (nextProvider: LlmProviderId) => {
    setProvider(nextProvider);
    setTestResult(null);
    setError(null);
    const preset = presets.find((p) => p.id === nextProvider);
    if (preset) {
      setBaseUrl(preset.defaultBaseUrl);
      setModel(preset.defaultModel);
    }
  };

  const handleVerifyConnection = async () => {
    setError(null);
    setTestResult(null);
    setTesting(true);
    try {
      const res = await devmindApi.testLlmConnection({
        provider,
        baseUrl: baseUrl.trim(),
        model: model.trim(),
        apiKey: apiKey.trim(),
      });
      setTestResult({
        ok: true,
        latencyMs: res.latencyMs,
        message: `Connected to ${res.model} (${res.latencyMs}ms).`,
      });
    } catch (err) {
      setTestResult({
        ok: false,
        message: err instanceof Error ? err.message : 'Unable to reach provider endpoint.',
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSubmit = async (localWorkspaceOnly: boolean) => {
    setError(null);
    setSubmitting(true);
    try {
      const res = await devmindApi.login({
        displayName: displayName.trim() || 'Developer',
        email: email.trim() || 'dev@workspace.local',
        provider,
        baseUrl: baseUrl.trim(),
        model: model.trim(),
        apiKey: localWorkspaceOnly ? '' : apiKey.trim(),
        localWorkspaceOnly,
      });
      onAuthenticated(res.token, res.session);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[var(--surface-chrome)] text-[var(--ink-primary)] flex flex-col">
      {/* Top Desktop Header Strip */}
      <header className="h-11 px-5 border-b border-[var(--border-hairline)] bg-[var(--surface-sidebar)] flex items-center justify-between win-drag-region">
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 rounded-[4px] bg-[var(--accent-primary)] flex items-center justify-center text-[var(--accent-ink)]">
            <Code2 className="w-3.5 h-3.5" />
          </div>
          <span className="text-xs font-semibold tracking-tight text-[var(--ink-primary)]">
            DevMind Studio
          </span>
          <span className="text-[11px] text-[var(--ink-muted)] font-mono">v2.1.0 · Windows x64</span>
        </div>

        <div className="flex items-center gap-2 text-[11px] text-[var(--ink-muted)] win-no-drag">
          <Monitor className="w-3.5 h-3.5" />
          <span>Local Desktop Runtime</span>
        </div>
      </header>

      {/* Main Split Content */}
      <main className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-[960px] grid grid-cols-1 lg:grid-cols-12 border border-[var(--border-hairline)] rounded-[6px] bg-[var(--surface-canvas)] overflow-hidden shadow-sm">
          {/* Left Product Overview Pane */}
          <div className="lg:col-span-5 p-8 bg-[var(--surface-sidebar)] border-b lg:border-b-0 lg:border-r border-[var(--border-hairline)] flex flex-col justify-between gap-8">
            <div className="space-y-4">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--accent-primary)]">
                Desktop Engineering Environment
              </div>
              <h1 className="text-2xl font-semibold tracking-tight text-[var(--ink-primary)] leading-tight">
                Code editor, extension host, and repository governance in one workspace.
              </h1>
              <p className="text-xs text-[var(--ink-secondary)] leading-relaxed">
                Connect your preferred OpenAI-compatible, Anthropic, or local Ollama endpoint — or open the local workspace immediately to edit files, run extensions, and inspect architecture.
              </p>

              <div className="pt-3 space-y-3 border-t border-[var(--border-hairline)]">
                <div className="flex items-start gap-2.5">
                  <Blocks className="w-4 h-4 text-[var(--accent-primary)] shrink-0 mt-0.5" />
                  <div>
                    <div className="text-xs font-semibold text-[var(--ink-primary)]">
                      VS Code-Style Extension Host
                    </div>
                    <p className="text-[11px] text-[var(--ink-secondary)] mt-0.5">
                      Install formatters, linters, and diagnostics with strict permission scopes and dependency resolution.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-2.5">
                  <FolderGit2 className="w-4 h-4 text-[var(--accent-primary)] shrink-0 mt-0.5" />
                  <div>
                    <div className="text-xs font-semibold text-[var(--ink-primary)]">
                      AST Repository Indexing & Live Sync
                    </div>
                    <p className="text-[11px] text-[var(--ink-secondary)] mt-0.5">
                      Direct disk persistence, dependency graph inspection, and unified diff review with one-click rollback.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-2.5">
                  <ShieldCheck className="w-4 h-4 text-[var(--accent-primary)] shrink-0 mt-0.5" />
                  <div>
                    <div className="text-xs font-semibold text-[var(--ink-primary)]">
                      Bring Your Own Model Key
                    </div>
                    <p className="text-[11px] text-[var(--ink-secondary)] mt-0.5">
                      Credentials remain in server session memory only and are never exposed in client bundles or logs.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-[var(--border-hairline)] text-[11px] text-[var(--ink-muted)] font-mono flex items-center justify-between">
              <span>Engine Core 2.1.0</span>
              <span>Win11 Fluent UI</span>
            </div>
          </div>

          {/* Right Sign-In & Provider Configuration Form */}
          <div className="lg:col-span-7 p-8 space-y-5">
            <div>
              <h2 className="text-base font-semibold text-[var(--ink-primary)]">
                Workspace Sign-In & Model Endpoint
              </h2>
              <p className="text-xs text-[var(--ink-secondary)] mt-1">
                Configure your provider key for code patching and repository queries, or continue offline in Local Workspace mode.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-[11px] font-medium text-[var(--ink-secondary)] mb-1">
                  Display Name
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full h-9 px-3 text-xs rounded-[4px] bg-[var(--surface-elevated)] border border-[var(--border-hairline)] text-[var(--ink-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-[var(--ink-secondary)] mb-1">
                  Workspace Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full h-9 px-3 text-xs rounded-[4px] bg-[var(--surface-elevated)] border border-[var(--border-hairline)] text-[var(--ink-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                />
              </div>
            </div>

            {/* Provider Selector */}
            <div>
              <label className="block text-[11px] font-medium text-[var(--ink-secondary)] mb-1.5">
                Model Provider
              </label>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
                {(presets.length > 0
                  ? presets
                  : [
                      { id: 'openai' as LlmProviderId, name: 'OpenAI' },
                      { id: 'anthropic' as LlmProviderId, name: 'Anthropic' },
                      { id: 'openrouter' as LlmProviderId, name: 'OpenRouter' },
                      { id: 'ollama' as LlmProviderId, name: 'Ollama' },
                    ]
                ).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelectProvider(item.id)}
                    className={`h-8 px-2.5 text-xs font-medium rounded-[4px] border text-left truncate transition-colors ${
                      provider === item.id
                        ? 'border-[var(--accent-primary)] bg-[var(--accent-soft)] text-[var(--accent-primary)]'
                        : 'border-[var(--border-hairline)] bg-[var(--surface-elevated)] text-[var(--ink-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--ink-primary)]'
                    }`}
                  >
                    {item.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-[11px] font-medium text-[var(--ink-secondary)] mb-1">
                  API Base URL
                </label>
                <input
                  type="url"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="https://api.openai.com/v1"
                  className="w-full h-9 px-3 text-xs font-mono rounded-[4px] bg-[var(--surface-elevated)] border border-[var(--border-hairline)] text-[var(--ink-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-[var(--ink-secondary)] mb-1">
                  Model Identifier
                </label>
                <input
                  type="text"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  list="provider-model-suggestions"
                  placeholder="gpt-4o-mini"
                  className="w-full h-9 px-3 text-xs font-mono rounded-[4px] bg-[var(--surface-elevated)] border border-[var(--border-hairline)] text-[var(--ink-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                />
                {currentPreset && (
                  <datalist id="provider-model-suggestions">
                    {currentPreset.suggestedModels.map((m) => (
                      <option key={m} value={m} />
                    ))}
                  </datalist>
                )}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-medium text-[var(--ink-secondary)] inline-flex items-center gap-1">
                  <KeyRound className="w-3 h-3" />
                  Provider API Key
                </label>
                <span className="text-[11px] text-[var(--ink-muted)]">
                  {currentPreset?.requiresKey === false ? 'Optional for local Ollama' : 'Stored in session memory'}
                </span>
              </div>
              <div className="relative">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={currentPreset?.requiresKey === false ? 'Not required for local server' : 'sk-...'}
                  className="w-full h-9 pl-3 pr-9 text-xs font-mono rounded-[4px] bg-[var(--surface-elevated)] border border-[var(--border-hairline)] text-[var(--ink-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                />
                <button
                  type="button"
                  onClick={() => setShowKey((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--ink-muted)] hover:text-[var(--ink-primary)]"
                  title={showKey ? 'Hide key' : 'Show key'}
                >
                  {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {testResult && (
              <div
                className={`px-3 py-2 rounded-[4px] border text-xs flex items-center gap-2 ${
                  testResult.ok
                    ? 'border-[var(--status-success)]/40 bg-[var(--status-success)]/10 text-[var(--status-success)]'
                    : 'border-[var(--status-danger)]/40 bg-[var(--status-danger)]/10 text-[var(--status-danger)]'
                }`}
              >
                {testResult.ok ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0" />
                )}
                <span>{testResult.message}</span>
              </div>
            )}

            {error && (
              <div className="px-3 py-2 rounded-[4px] border border-[var(--status-danger)]/40 bg-[var(--status-danger)]/10 text-xs text-[var(--status-danger)] flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="pt-2 flex flex-wrap items-center justify-between gap-2.5 border-t border-[var(--border-hairline)]">
              <button
                type="button"
                disabled={testing || submitting}
                onClick={handleVerifyConnection}
                className="h-9 px-3.5 text-xs font-medium rounded-[4px] border border-[var(--border-strong)] bg-[var(--surface-elevated)] text-[var(--ink-primary)] hover:bg-[var(--surface-hover)] disabled:opacity-40 inline-flex items-center gap-1.5 transition-colors"
              >
                {testing && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Verify Connection
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => handleSubmit(true)}
                  className="h-9 px-3.5 text-xs font-medium rounded-[4px] border border-[var(--border-strong)] bg-[var(--surface-elevated)] text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:bg-[var(--surface-hover)] disabled:opacity-40 transition-colors"
                >
                  Open Local Workspace
                </button>

                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => handleSubmit(false)}
                  className="h-9 px-4 text-xs font-medium rounded-[4px] bg-[var(--accent-primary)] text-[var(--accent-ink)] hover:bg-[var(--accent-hover)] disabled:opacity-40 inline-flex items-center gap-1.5 transition-colors"
                >
                  {submitting ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <>
                      Connect & Open Studio
                      <ArrowRight className="w-3.5 h-3.5" />
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};
