import React, { useState } from 'react';
import { Download, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={() => void install()}
        className="h-7 px-2.5 text-[11px] font-medium rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-elevated)] text-[var(--ink-primary)] hover:bg-[var(--surface-hover)] inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
        title="Install DevMind Studio for offline desktop access"
      >
        <Download className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
        <span className="hidden md:inline">Install App</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className="h-7 px-2.5 text-[11px] font-medium rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-elevated)] text-[var(--ink-primary)] hover:bg-[var(--surface-hover)] inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
        >
          <Download className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
          <span>Install</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="w-full max-w-sm apple-sheet p-5 space-y-3.5">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-[var(--ink-primary)]">
                  Install DevMind Studio
                </h3>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  className="w-7 h-7 flex items-center justify-center rounded-full text-[var(--ink-muted)] hover:text-[var(--ink-primary)] hover:bg-[var(--surface-hover)]"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <p className="text-xs text-[var(--ink-secondary)] leading-relaxed">
                1. Tap the <strong>Share</strong> icon in Safari&apos;s toolbar.
                <br />
                2. Scroll down and select <strong>Add to Home Screen</strong> for full offline access.
              </p>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="w-full h-9 rounded-lg bg-[var(--accent-primary)] text-[var(--accent-ink)] text-xs font-medium hover:bg-[var(--accent-hover)] transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
