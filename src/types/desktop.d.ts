export interface DevMindDesktopDiagnostics {
  userDataPath: string;
  dataDir: string;
  startupLogPath: string;
  vaultAvailable: boolean;
  recentLogs: string[];
}

export interface DevMindDesktopBridge {
  isDesktop: boolean;
  isDesktopApp: boolean;
  version?: string;
  platform: string;
  arch: string;
  minimize: () => Promise<void>;
  toggleMaximize: () => Promise<boolean>;
  close: () => Promise<void>;
  isMaximized: () => Promise<boolean>;
  getSystemInfo: () => Promise<{
    platform: string;
    arch: string;
    release: string;
    osRelease?: string;
    electronVersion: string;
    nodeVersion: string;
    memoryMb: number;
    totalMemoryGb?: number;
    appVersion?: string;
    userDataPath?: string;
    vaultAvailable?: boolean;
  }>;
  onMaximizedChanged: (callback: (isMaximized: boolean) => void) => () => void;
  // Phase 5: Secure OS-backed credential vault (Electron safeStorage)
  vaultIsAvailable?: () => Promise<boolean>;
  vaultGet?: (key: string) => Promise<string | null>;
  vaultSet?: (key: string, value: string) => Promise<boolean>;
  vaultDelete?: (key: string) => Promise<boolean>;
  // Phase 5: Network reconnection monitoring & recovery diagnostics
  isNetworkOnline?: () => Promise<boolean>;
  onNetworkStatusChanged?: (callback: (isOnline: boolean) => void) => () => void;
  getDiagnostics?: () => Promise<DevMindDesktopDiagnostics>;
}

declare global {
  interface Window {
    devmindDesktop?: DevMindDesktopBridge;
  }
}

export {};
