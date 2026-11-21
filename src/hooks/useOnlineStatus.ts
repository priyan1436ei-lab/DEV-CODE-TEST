import { useEffect, useState } from 'react';
import { subscribeOfflineQueueCount } from '../services/offlineStore';
import { setSyncOnlineStatus } from '../services/syncEngine';

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [pendingSyncCount, setPendingSyncCount] = useState(0);

  useEffect(() => {
    const update = (next: boolean) => {
      setIsOnline(next);
      setSyncOnlineStatus(next);
    };

    const handleOnline = () => update(true);
    const handleOffline = () => update(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Electron desktop net.isOnline() monitoring
    let unsubDesktopNet: (() => void) | undefined;
    if (window.devmindDesktop?.isNetworkOnline) {
      void window.devmindDesktop
        .isNetworkOnline()
        .then((desktopOnline) => update(Boolean(desktopOnline && navigator.onLine)))
        .catch(() => {});
    }
    if (window.devmindDesktop?.onNetworkStatusChanged) {
      unsubDesktopNet = window.devmindDesktop.onNetworkStatusChanged((desktopOnline) => {
        update(Boolean(desktopOnline));
      });
    }

    const unsubscribeQueue = subscribeOfflineQueueCount((count) => {
      setPendingSyncCount(count);
    });

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      unsubDesktopNet?.();
      unsubscribeQueue();
    };
  }, []);

  return { isOnline, pendingSyncCount };
}
