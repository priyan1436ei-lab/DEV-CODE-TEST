export interface DevMindDesktopBridge {
  isDesktop: boolean;
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
    electronVersion: string;
    nodeVersion: string;
    memoryMb: number;
  }>;
  onMaximizedChanged: (callback: (isMaximized: boolean) => void) => () => void;
}

declare global {
  interface Window {
    devmindDesktop?: DevMindDesktopBridge;
  }
}

export {};
