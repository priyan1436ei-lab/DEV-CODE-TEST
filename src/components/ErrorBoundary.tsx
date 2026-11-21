import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { FIREBASE_PROJECT_ID, FIRESTORE_DATABASE_ID } from '../firebase';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
  isQuotaError: boolean;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = {
      hasError: false,
      message: '',
      isQuotaError: false,
    };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    const raw = error?.message || 'Unexpected application error.';
    const isQuotaError = raw.includes('Quota exceeded');
    let friendly = raw;
    try {
      const parsed = JSON.parse(raw) as { error?: string; operationType?: string; path?: string };
      if (parsed && parsed.error) {
        friendly = `Firestore ${parsed.operationType || 'operation'} failed on ${parsed.path || 'database'}: ${parsed.error}`;
      }
    } catch {
      // Plain error message
    }
    return {
      hasError: true,
      message: friendly,
      isQuotaError,
    };
  }

  componentDidCatch(error: Error): void {
    console.error('Application ErrorBoundary caught error:', error);
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const upgradeUrl = `https://console.firebase.google.com/project/${FIREBASE_PROJECT_ID}/firestore/databases/${FIRESTORE_DATABASE_ID}/data?openUpgradeDialog=true`;

    return (
      <div className="min-h-screen w-full bg-[var(--surface-chrome)] text-[var(--ink-primary)] flex items-center justify-center p-6">
        <div className="w-full max-w-lg border border-[var(--border-strong)] rounded-[6px] bg-[var(--surface-elevated)] p-6 space-y-4 shadow-lg">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-[var(--status-danger)] shrink-0 mt-0.5" />
            <div>
              <h1 className="text-sm font-semibold text-[var(--ink-primary)]">
                {this.state.isQuotaError ? 'Firestore Daily Quota Exceeded' : 'Workspace Recovery Needed'}
              </h1>
              <p className="text-xs text-[var(--ink-secondary)] mt-1 leading-relaxed break-words">
                {this.state.message}
              </p>
            </div>
          </div>

          {this.state.isQuotaError && (
            <div className="p-3 rounded-[4px] border border-[var(--border-hairline)] bg-[var(--surface-canvas)] text-xs text-[var(--ink-secondary)] space-y-1.5">
              <p>
                Free-tier daily Firestore read/write quotas reset the next day. Details are available under the Spark plan (Enterprise edition) at firebase.google.com/pricing#cloud-firestore.
              </p>
              <a
                href={upgradeUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-block text-[var(--accent-primary)] hover:underline font-mono text-[11px]"
              >
                Open Firestore Database Upgrade Settings
              </a>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border-hairline)]">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="h-8 px-3.5 text-xs font-medium rounded-[4px] bg-[var(--accent-primary)] text-[var(--accent-ink)] hover:bg-[var(--accent-hover)] inline-flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Reload Studio
            </button>
          </div>
        </div>
      </div>
    );
  }
}
