import React, { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  AlertCircle,
  ArrowRight,
  Blocks,
  CheckCircle2,
  Cloud,
  Eye,
  EyeOff,
  FolderGit2,
  KeyRound,
  Loader2,
  LogOut,
  Monitor,
  ShieldCheck,
} from 'lucide-react';
import { signInWithGoogle, signOutFirebase } from '../firebase';
import { devmindApi, type ProviderPreset } from '../services/api';
import type { FirestoreUserProfile } from '../services/firestoreSync';
import type { LlmProviderId, PublicUserSession } from '../types/devmind';
import { PWAInstallButton } from './PWAInstallButton';

interface LoginGateProps {
  firebaseUser: User | null;
  firebaseAuthReady: boolean;
  cloudProfile: FirestoreUserProfile | null;
  loadingProfile: boolean;
  onAuthenticated: (
    token: string,
    session: PublicUserSession,
    profile?: FirestoreUserProfile | null
  ) => void;
}

export const LoginGate: React.FC<LoginGateProps> = ({
  firebaseUser,
  firebaseAuthReady,
  cloudProfile,
  loadingProfile,
  onAuthenticated,
}) => {
  const [presets, setPresets] = useState<ProviderPreset[]>([]);
  const [provider, setProvider] = useState<LlmProviderId>('openai');
  const [baseUrl, setBaseUrl] = useState('https://api.openai.com/v1');
  const [model, setModel] = useState('gpt-4o-mini');
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);

  const [signingInGoogle, setSigningInGoogle] = useState(false);

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
        if (first && !cloudProfile) {
          setProvider(first.id);
          setBaseUrl(first.defaultBaseUrl);
          setModel(first.defaultModel);
        }
      })
      .catch(() => {
        // Fallback defaults remain usable while backend warms up.
      });
  }, []);

  // Hydrate saved Firestore user preferences when cloudProfile arrives from App
  useEffect(() => {
    if (!cloudProfile) return;
    setProvider(cloudProfile.preferredProvider);
    setModel(cloudProfile.preferredModel);
    setBaseUrl(cloudProfile.preferredBaseUrl);
  }, [cloudProfile]);

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

  const handleGoogleSignIn = async () => {
    setError(null);
    setSigningInGoogle(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Google Sign-In failed.';
      if (!msg.includes('popup-closed-by-user')) {
        setError(msg);
      }
    } finally {
      setSigningInGoogle(false);
    }
  };

  const handleGoogleSignOut = async () => {
    setError(null);
    try {
      await signOutFirebase();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sign out.');
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

  const handleOpenStudio = async (localWorkspaceOnly: boolean) => {
    if (!firebaseUser) {
      setError('Please sign in with Google first so your workspace profile and cloud data are verified.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const res = await devmindApi.login({
        displayName: firebaseUser.displayName || cloudProfile?.displayName || 'Developer',
        email: firebaseUser.email || cloudProfile?.email || 'dev@workspace.local',
        provider,
        baseUrl: baseUrl.trim(),
        model: model.trim(),
        apiKey: localWorkspaceOnly ? '' : apiKey.trim(),
        localWorkspaceOnly,
      });
      onAuthenticated(res.token, res.session, cloudProfile);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Workspace session startup failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[var(--surface-chrome)] text-[var(--ink-primary)] flex flex-col">
      {/* Top Desktop Header Strip */}
      <header className="h-11 px-5 border-b border-[var(--border-hairline)] bg-[var(--surface-sidebar)] flex items-center justify-between win-drag-region">
        <div className="flex items-center gap-2.5">
          <img
            src="/icon.png"
            alt="DevMind Studio"
            className="w-6 h-6 object-contain shrink-0"
            draggable={false}
          />
          <span className="text-xs font-semibold tracking-tight text-[var(--ink-primary)]">
            DevMind Studio
          </span>
          <span className="text-[11px] text-[var(--ink-muted)] font-mono">v2.1.0 · Windows x64</span>
        </div>

        <div className="flex items-center gap-3 text-[11px] text-[var(--ink-muted)] win-no-drag">
          <PWAInstallButton />
          <span className="inline-flex items-center gap-1">
            <Cloud className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
            Firebase Auth & Firestore
          </span>
          <span className="hidden sm:inline-flex items-center gap-1">
            <Monitor className="w-3.5 h-3.5" />
            Local Desktop Runtime
          </span>
        </div>
      </header>

      {/* Main Split Content */}
      <main className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-[980px] grid grid-cols-1 lg:grid-cols-12 border border-[var(--border-hairline)] rounded-[6px] bg-[var(--surface-canvas)] overflow-hidden shadow-sm">
          {/* Left Product Overview Pane */}
          <div className="lg:col-span-5 p-8 bg-[var(--surface-sidebar)] border-b lg:border-b-0 lg:border-r border-[var(--border-hairline)] flex flex-col justify-between gap-8">
            <div className="space-y-4">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--accent-primary)]">
                Desktop Engineering Environment
              </div>
              <h1 className="text-2xl font-semibold tracking-tight text-[var(--ink-primary)] leading-tight">
                Sign in with Google to sync your IDE, extensions, and tasks.
              </h1>
              <p className="text-xs text-[var(--ink-secondary)] leading-relaxed">
                Your workspace preferences, installed extensions, task priorities, and repository metadata persist securely in Cloud Firestore under your Google identity while model API keys remain strictly local in memory.
              </p>

              <div className="pt-3 space-y-3 border-t border-[var(--border-hairline)]">
                <div className="flex items-start gap-2.5">
                  <Cloud className="w-4 h-4 text-[var(--accent-primary)] shrink-0 mt-0.5" />
                  <div>
                    <div className="text-xs font-semibold text-[var(--ink-primary)]">
                      Per-User Cloud Firestore Persistence
                    </div>
                    <p className="text-[11px] text-[var(--ink-secondary)] mt-0.5">
                      Strict owner-isolated security rules sync your profile, extension states, tasks, and projects across sessions.
                    </p>
                  </div>
                </div>

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
                      Dependency graph inspection, unified diff review, and one-click rollback snapshots.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-2.5">
                  <ShieldCheck className="w-4 h-4 text-[var(--accent-primary)] shrink-0 mt-0.5" />
                  <div>
                    <div className="text-xs font-semibold text-[var(--ink-primary)]">
                      Zero-Secret Cloud Storage
                    </div>
                    <p className="text-[11px] text-[var(--ink-secondary)] mt-0.5">
                      BYOK LLM API keys are never written to Firestore — they stay strictly in server session memory.
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
            {/* Step 1: Google Sign-In Identity */}
            <div className="space-y-3">
              <div>
                <h2 className="text-base font-semibold text-[var(--ink-primary)]">
                  1. Verify Account with Google
                </h2>
                <p className="text-xs text-[var(--ink-secondary)] mt-0.5">
                  Authenticate via Firebase Auth to unlock your private Firestore workspace data.
                </p>
              </div>

              {!firebaseAuthReady ? (
                <div className="h-11 px-4 rounded-[4px] border border-[var(--border-hairline)] bg-[var(--surface-elevated)] flex items-center gap-2 text-xs text-[var(--ink-secondary)]">
                  <Loader2 className="w-4 h-4 animate-spin text-[var(--accent-primary)]" />
                  Checking Firebase authentication state...
                </div>
              ) : !firebaseUser ? (
                <button
                  type="button"
                  disabled={signingInGoogle}
                  onClick={handleGoogleSignIn}
                  className="w-full h-11 px-4 rounded-[4px] border border-[var(--border-strong)] bg-[var(--surface-elevated)] hover:bg-[var(--surface-hover)] text-[var(--ink-primary)] text-xs font-semibold flex items-center justify-center gap-2.5 transition-colors disabled:opacity-50"
                >
                  {signingInGoogle ? (
                    <Loader2 className="w-4 h-4 animate-spin text-[var(--accent-primary)]" />
                  ) : (
                    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                      <path
                        fill="#4285F4"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                      />
                    </svg>
                  )}
                  <span>{signingInGoogle ? 'Opening Google Sign-In...' : 'Sign in with Google'}</span>
                </button>
              ) : (
                <div className="p-3 rounded-[4px] border border-[var(--status-success)]/40 bg-[var(--surface-elevated)] flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    {firebaseUser.photoURL ? (
                      <img
                        src={firebaseUser.photoURL}
                        alt={firebaseUser.displayName || 'Google account'}
                        referrerPolicy="no-referrer"
                        className="w-8 h-8 rounded-full border border-[var(--border-hairline)] shrink-0"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-[var(--accent-soft)] text-[var(--accent-primary)] flex items-center justify-center text-xs font-semibold shrink-0">
                        {(firebaseUser.displayName || firebaseUser.email || 'U').charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-[var(--ink-primary)] truncate flex items-center gap-1.5">
                        <span>{firebaseUser.displayName || 'Verified User'}</span>
                        <CheckCircle2 className="w-3.5 h-3.5 text-[var(--status-success)] shrink-0" />
                      </div>
                      <div className="text-[11px] font-mono text-[var(--ink-muted)] truncate">
                        {firebaseUser.email} {loadingProfile ? '· Syncing Firestore...' : '· Firestore Connected'}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleGoogleSignOut}
                    className="h-7 px-2.5 text-[11px] rounded-[3px] border border-[var(--border-hairline)] text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:bg-[var(--surface-hover)] inline-flex items-center gap-1 shrink-0"
                  >
                    <LogOut className="w-3 h-3" />
                    Switch
                  </button>
                </div>
              )}
            </div>

            {/* Step 2: Optional BYOK LLM Endpoint */}
            <div className="pt-4 border-t border-[var(--border-hairline)] space-y-4">
              <div>
                <h2 className="text-sm font-semibold text-[var(--ink-primary)]">
                  2. Model Provider Endpoint (Optional)
                </h2>
                <p className="text-xs text-[var(--ink-secondary)] mt-0.5">
                  Configure your BYOK endpoint for automated patching and repository queries, or launch directly in Local Workspace mode.
                </p>
              </div>

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
                    {currentPreset?.requiresKey === false ? 'Optional for local Ollama' : 'Session memory only · Never saved to cloud'}
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
                <span className="break-words">{error}</span>
              </div>
            )}

            <div className="pt-2 flex flex-wrap items-center justify-between gap-2.5 border-t border-[var(--border-hairline)]">
              <button
                type="button"
                disabled={testing || submitting || !firebaseUser}
                onClick={handleVerifyConnection}
                className="h-9 px-3.5 text-xs font-medium rounded-[4px] border border-[var(--border-strong)] bg-[var(--surface-elevated)] text-[var(--ink-primary)] hover:bg-[var(--surface-hover)] disabled:opacity-40 inline-flex items-center gap-1.5 transition-colors"
              >
                {testing && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Verify Connection
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={submitting || !firebaseUser || loadingProfile}
                  onClick={() => handleOpenStudio(true)}
                  className="h-9 px-3.5 text-xs font-medium rounded-[4px] border border-[var(--border-strong)] bg-[var(--surface-elevated)] text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:bg-[var(--surface-hover)] disabled:opacity-40 transition-colors"
                >
                  Open Local Workspace
                </button>

                <button
                  type="button"
                  disabled={submitting || !firebaseUser || loadingProfile}
                  onClick={() => handleOpenStudio(false)}
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
