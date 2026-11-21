import React from 'react';
import { AlertTriangle, CloudOff, KeyRound, RefreshCw } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import type { SyncStateStatus } from '../types/devmind';

interface OfflineIndicatorProps {
  syncStatus?: SyncStateStatus;
  syncing?: boolean;
  conflictCount?: number;
  lastError?: string | null;
  authExpired?: boolean;
  onSyncNow?: () => void;
  onOpenConflicts?: () => void;
  onReconnectFirebase?: () => void;
}

export const OfflineIndicator: React.FC<OfflineIndicatorProps> = ({
  syncStatus,
  syncing = false,
  conflictCount = 0,
  lastError = null,
  authExpired = false,
  onSyncNow,
  onOpenConflicts,
  onReconnectFirebase,
}) => {
  const { isOnline, pendingSyncCount } = useOnlineStatus();
  const effectiveStatus: SyncStateStatus =
    syncStatus ?? (!isOnline ? 'Offline' : pendingSyncCount > 0 ? 'Pending' : 'Synced');

  if (
    isOnline &&
    pendingSyncCount === 0 &&
    conflictCount === 0 &&
    effectiveStatus === 'Synced' &&
    !lastError &&
    !authExpired
  ) {
    return null;
  }

  const isConflict = effectiveStatus === 'Conflict' || conflictCount > 0;
  const isError = effectiveStatus === 'Error' || authExpired || Boolean(lastError);

  return (
    <div
      role="status"
      className={`fixed bottom-10 left-5 z-50 flex items-center gap-2.5 rounded-xl border px-3.5 py-2 text-xs font-medium apple-popover ${
        isError
          ? 'border-[var(--status-danger)]/45 text-[var(--ink-primary)]'
          : isConflict || !isOnline
          ? 'border-[var(--status-warning)]/45 text-[var(--ink-primary)]'
          : 'border-[var(--accent-primary)]/40 text-[var(--ink-primary)]'
      }`}
    >
      {isConflict || isError ? (
        <AlertTriangle
          className={`w-3.5 h-3.5 shrink-0 ${
            isError ? 'text-[var(--status-danger)]' : 'text-[var(--status-warning)]'
          }`}
        />
      ) : (
        <CloudOff
          className={`w-3.5 h-3.5 shrink-0 ${
            !isOnline ? 'text-[var(--status-warning)]' : 'text-[var(--accent-primary)]'
          }`}
        />
      )}

      <span className="max-w-[360px] truncate">
        {!isOnline
          ? pendingSyncCount > 0
            ? `Offline · ${pendingSyncCount} local edit${pendingSyncCount === 1 ? '' : 's'} queued in IndexedDB`
            : 'Offline Mode — Running locally via IndexedDB & local workspace'
          : isConflict
          ? `${conflictCount} cloud sync conflict${conflictCount === 1 ? '' : 's'} awaiting resolution`
          : authExpired
          ? 'Firebase session expired — reconnect to resume cloud sync'
          : isError && lastError
          ? `Sync Error: ${lastError}`
          : `${pendingSyncCount} offline change${pendingSyncCount === 1 ? '' : 's'} pending sync`}
      </span>

      {isConflict && onOpenConflicts && (
        <button
          type="button"
          onClick={onOpenConflicts}
          className="h-6 px-2.5 rounded-lg bg-[var(--status-warning)] text-black hover:opacity-90 inline-flex items-center gap-1 text-[11px] font-semibold transition-opacity"
        >
          Resolve
        </button>
      )}

      {authExpired && isOnline && onReconnectFirebase && (
        <button
          type="button"
          onClick={onReconnectFirebase}
          className="h-6 px-2.5 rounded-lg bg-[var(--accent-primary)] text-[var(--accent-ink)] hover:bg-[var(--accent-hover)] inline-flex items-center gap-1 text-[11px] font-medium transition-colors"
        >
          <KeyRound className="w-3 h-3" />
          Reconnect
        </button>
      )}

      {isOnline && (pendingSyncCount > 0 || (isError && !authExpired)) && onSyncNow && (
        <button
          type="button"
          disabled={syncing}
          onClick={onSyncNow}
          className="h-6 px-2.5 rounded-lg bg-[var(--accent-primary)] text-[var(--accent-ink)] hover:bg-[var(--accent-hover)] disabled:opacity-50 inline-flex items-center gap-1 text-[11px] font-medium transition-colors"
        >
          <RefreshCw className={`w-3 h-3 ${syncing ? 'animate-spin' : ''}`} />
          {syncing ? 'Syncing...' : 'Sync Now'}
        </button>
      )}
    </div>
  );
};
