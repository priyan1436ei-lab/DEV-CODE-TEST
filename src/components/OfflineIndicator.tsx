import React from 'react';
import { CloudOff, RefreshCw } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

interface OfflineIndicatorProps {
  syncing?: boolean;
  onSyncNow?: () => void;
}

export const OfflineIndicator: React.FC<OfflineIndicatorProps> = ({ syncing = false, onSyncNow }) => {
  const { isOnline, pendingSyncCount } = useOnlineStatus();

  if (isOnline && pendingSyncCount === 0) {
    return null;
  }

  return (
    <div
      role="status"
      className={`fixed bottom-10 left-5 z-50 flex items-center gap-2.5 rounded-xl border px-3.5 py-2 text-xs font-medium apple-popover ${
        !isOnline
          ? 'border-[var(--status-warning)]/40 text-[var(--ink-primary)]'
          : 'border-[var(--accent-primary)]/40 text-[var(--ink-primary)]'
      }`}
    >
      <CloudOff
        className={`w-3.5 h-3.5 shrink-0 ${
          !isOnline ? 'text-[var(--status-warning)]' : 'text-[var(--accent-primary)]'
        }`}
      />
      <span>
        {!isOnline
          ? pendingSyncCount > 0
            ? `Offline · ${pendingSyncCount} local edit${pendingSyncCount === 1 ? '' : 's'} queued in IndexedDB`
            : 'Offline Mode — Running locally via IndexedDB & Cache API'
          : `${pendingSyncCount} offline change${pendingSyncCount === 1 ? '' : 's'} ready to sync`}
      </span>
      {isOnline && pendingSyncCount > 0 && onSyncNow && (
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
