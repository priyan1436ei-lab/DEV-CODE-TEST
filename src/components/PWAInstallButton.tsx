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
        className="h-6 px-2 text-[11px] font-medium rounded-[3px] border border-[var(--border-strong)] bg-[var(--surface-elevated)] text-[var(--ink-primary)] hover:bg-[var(--surface-hover)] inline-flex items-center gap-1.5 transition-colors"
        title="Install DevMind Studio for offline desktop access"
      >
        <Download className="w-3 h-3 text-[var(--accent-primary)]" />
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
          className="h-6 px-2 text-[11px] font-medium rounded-[3px] border border-[var(--border-strong)] bg-[var(--surface-elevated)] text-[var(--ink-primary)] hover:bg-[var(--surface-hover)] inline-flex items-center gap-1.5 transition-colors"
        >
          <Download className="w-3 h-3 text-[var(--accent-primary)]" />
          <span>Install</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div className="w-full max-w-sm rounded-[6px] border border-[var(--border-strong)] bg-[var(--surface-elevated)] p-5 shadow-xl space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-[var(--ink-primary)]">
                  Install DevMind Studio
                </h3>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  className="w-6 h-6 flex items-center justify-center rounded-[3px] text-[var(--ink-muted)] hover:text-[var(--ink-primary)] hover:bg-[var(--surface-hover)]"
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
                className="w-full h-8 rounded-[4px] bg-[var(--accent-primary)] text-[var(--accent-ink)] text-xs font-medium hover:bg-[var(--accent-hover)] transition-colors"
              >
                Got it
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
