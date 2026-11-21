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
      className={`fixed bottom-8 left-14 z-50 flex items-center gap-2.5 rounded-[4px] border px-3 py-1.5 text-xs font-medium shadow-md ${
        !isOnline
          ? 'border-[var(--status-warning)]/50 bg-[var(--surface-elevated)] text-[var(--ink-primary)]'
          : 'border-[var(--accent-primary)]/50 bg-[var(--surface-elevated)] text-[var(--ink-primary)]'
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
            ? `Offline Mode (IndexedDB) · ${pendingSyncCount} local edit${pendingSyncCount === 1 ? '' : 's'} queued`
            : 'Offline Mode — Editing & search running locally via IndexedDB & Cache API'
          : `${pendingSyncCount} offline change${pendingSyncCount === 1 ? '' : 's'} ready to sync`}
      </span>
      {isOnline && pendingSyncCount > 0 && onSyncNow && (
        <button
          type="button"
          disabled={syncing}
          onClick={onSyncNow}
          className="h-6 px-2 rounded-[3px] bg-[var(--accent-primary)] text-[var(--accent-ink)] hover:bg-[var(--accent-hover)] disabled:opacity-50 inline-flex items-center gap-1 text-[11px] font-medium transition-colors"
        >
          <RefreshCw className={`w-3 h-3 ${syncing ? 'animate-spin' : ''}`} />
          {syncing ? 'Syncing...' : 'Sync Now'}
        </button>
      )}
    </div>
  );
};
