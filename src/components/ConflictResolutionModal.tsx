import React, { useState } from 'react';
import { AlertTriangle, Cloud, HardDrive, Loader2, X } from 'lucide-react';
import type { SyncConflictRecord } from '../types/devmind';

interface ConflictResolutionModalProps {
  open: boolean;
  conflicts: SyncConflictRecord[];
  onClose: () => void;
  onResolve: (conflict: SyncConflictRecord, resolution: 'keep-local' | 'keep-cloud') => Promise<void>;
}

export const ConflictResolutionModal: React.FC<ConflictResolutionModalProps> = ({
  open,
  conflicts,
  onClose,
  onResolve,
}) => {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const handleAction = async (
    conflict: SyncConflictRecord,
    resolution: 'keep-local' | 'keep-cloud'
  ) => {
    setBusyId(`${conflict.id}:${resolution}`);
    setError(null);
    try {
      await onResolve(conflict, resolution);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resolve conflict.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Resolve Cloud Sync Conflicts"
    >
      <div className="w-full max-w-2xl max-h-[82vh] apple-sheet flex flex-col overflow-hidden">
        <div className="px-5 py-3.5 border-b border-[var(--border-hairline)] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-4 h-4 text-[var(--status-warning)] shrink-0" />
            <div>
              <h2 className="text-sm font-semibold text-[var(--ink-primary)]">
                Sync Conflicts Detected ({conflicts.length})
              </h2>
              <p className="text-[11px] text-[var(--ink-secondary)]">
                Newer cloud changes were found in Firestore. Choose which version to keep — cloud data is never silently overwritten.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-lg hover:bg-[var(--surface-hover)] flex items-center justify-center text-[var(--ink-muted)] hover:text-[var(--ink-primary)]"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="mx-5 mt-3 px-3 py-2 rounded-lg border border-[var(--status-danger)]/40 bg-[var(--status-danger)]/10 text-xs text-[var(--status-danger)]">
            {error}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {conflicts.length === 0 ? (
            <div className="py-10 text-center text-xs text-[var(--ink-muted)]">
              All synchronization conflicts are resolved.
            </div>
          ) : (
            conflicts.map((conflict) => (
              <div
                key={conflict.id}
                className="p-4 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-subtle)] space-y-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-semibold text-[var(--ink-primary)]">
                    {conflict.title}
                  </div>
                  <span className="text-[10px] font-mono uppercase text-[var(--status-warning)]">
                    {conflict.entityType}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="p-3 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-canvas)] space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] font-medium text-[var(--ink-primary)]">
                      <span className="inline-flex items-center gap-1.5">
                        <HardDrive className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                        Local Workspace
                      </span>
                      <span className="font-mono text-[10px] text-[var(--ink-muted)]">
                        {new Date(conflict.localUpdatedAt).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-[11px] font-mono text-[var(--ink-secondary)] break-words">
                      {conflict.localSummary}
                    </p>
                  </div>

                  <div className="p-3 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-canvas)] space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] font-medium text-[var(--ink-primary)]">
                      <span className="inline-flex items-center gap-1.5">
                        <Cloud className="w-3.5 h-3.5 text-[var(--status-info)]" />
                        Firebase Cloud
                      </span>
                      <span className="font-mono text-[10px] text-[var(--ink-muted)]">
                        {new Date(conflict.cloudUpdatedAt).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-[11px] font-mono text-[var(--ink-secondary)] break-words">
                      {conflict.cloudSummary}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    disabled={busyId !== null}
                    onClick={() => handleAction(conflict, 'keep-cloud')}
                    className="h-7 px-3 rounded-lg border border-[var(--border-strong)] bg-[var(--surface-canvas)] hover:bg-[var(--surface-hover)] text-xs font-medium text-[var(--ink-primary)] disabled:opacity-40 inline-flex items-center gap-1.5"
                  >
                    {busyId === `${conflict.id}:keep-cloud` && (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    )}
                    Accept Cloud
                  </button>
                  <button
                    type="button"
                    disabled={busyId !== null}
                    onClick={() => handleAction(conflict, 'keep-local')}
                    className="h-7 px-3 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-xs font-medium text-[var(--accent-ink)] disabled:opacity-40 inline-flex items-center gap-1.5"
                  >
                    {busyId === `${conflict.id}:keep-local` && (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    )}
                    Keep Local & Push
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
