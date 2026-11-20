import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Code2, Command, FileCode2, Play, Search } from 'lucide-react';
import type { Project, ScreenId } from '../types/devmind';

interface CommandPaletteProps {
  open: boolean;
  project: Project;
  onClose: () => void;
  onOpenFileAtLine: (filePath: string, line?: number) => void;
  onNavigate: (screen: ScreenId) => void;
  onRunSandboxTests: () => Promise<void>;
  onLaunchMilestoneDemo: () => void;
  onToggleRightPanel: () => void;
}

interface PaletteItem {
  id: string;
  label: string;
  sublabel: string;
  kind: 'action' | 'screen' | 'file' | 'symbol';
  run: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  open,
  project,
  onClose,
  onOpenFileAtLine,
  onNavigate,
  onRunSandboxTests,
  onLaunchMilestoneDemo,
  onToggleRightPanel,
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [open]);

  const items = useMemo<PaletteItem[]>(() => {
    const base: PaletteItem[] = [
      {
        id: 'act-demo',
        label: 'Run Autonomous Security Fix & Verify',
        sublabel: 'Autonomous Agent · Milestone End-to-End Task',
        kind: 'action',
        run: () => {
          onLaunchMilestoneDemo();
          onClose();
        },
      },
      {
        id: 'act-tests',
        label: 'Run Sandbox Test Suite',
        sublabel: 'Execute node --test inside isolated disposable sandbox',
        kind: 'action',
        run: () => {
          void onRunSandboxTests();
          onClose();
        },
      },
      {
        id: 'act-toggle-ai',
        label: 'Toggle AI Engineering Panel (Ctrl+J)',
        sublabel: 'Show or hide the right-hand AI workspace',
        kind: 'action',
        run: () => {
          onToggleRightPanel();
          onClose();
        },
      },
      {
        id: 'scr-dash',
        label: 'Go to Dashboard',
        sublabel: 'Screen · Project health, KPIs, budget',
        kind: 'screen',
        run: () => {
          onNavigate('dashboard');
          onClose();
        },
      },
      {
        id: 'scr-brain',
        label: 'Go to Repository Brain & Dependency Graph',
        sublabel: 'Screen · Knowledge graph and hybrid code search',
        kind: 'screen',
        run: () => {
          onNavigate('brain');
          onClose();
        },
      },
      {
        id: 'scr-debug',
        label: 'Go to Debugging Center',
        sublabel: 'Screen · Stack trace analysis and root-cause patches',
        kind: 'screen',
        run: () => {
          onNavigate('debugging');
          onClose();
        },
      },
      {
        id: 'scr-sec',
        label: 'Go to Security Center',
        sublabel: 'Screen · Static CWE findings and secret scanning',
        kind: 'screen',
        run: () => {
          onNavigate('security');
          onClose();
        },
      },
      {
        id: 'scr-hist',
        label: 'Go to Agent Execution History',
        sublabel: 'Screen · Tasks, approvals, diffs, rollbacks',
        kind: 'screen',
        run: () => {
          onNavigate('history');
          onClose();
        },
      },
      {
        id: 'scr-settings',
        label: 'Go to Governance, Policy & Usage',
        sublabel: 'Screen · Permission matrix, Model Gateway, budget',
        kind: 'screen',
        run: () => {
          onNavigate('settings');
          onClose();
        },
      },
    ];

    for (const f of project.files) {
      base.push({
        id: `file-${f.path}`,
        label: f.path,
        sublabel: `File · ${f.language} · ${f.lineCount} lines`,
        kind: 'file',
        run: () => {
          onOpenFileAtLine(f.path, 1);
          onClose();
        },
      });
    }

    for (const sym of project.symbols) {
      base.push({
        id: `sym-${sym.id}`,
        label: sym.name,
        sublabel: `Symbol (${sym.kind}) · ${sym.filePath}:${sym.startLine}`,
        kind: 'symbol',
        run: () => {
          onOpenFileAtLine(sym.filePath, sym.startLine);
          onClose();
        },
      });
    }

    const q = query.trim().toLowerCase();
    if (!q) return base.slice(0, 14);
    return base
      .filter((it) => it.label.toLowerCase().includes(q) || it.sublabel.toLowerCase().includes(q))
      .slice(0, 14);
  }, [
    project.files,
    project.symbols,
    query,
    onClose,
    onLaunchMilestoneDemo,
    onNavigate,
    onOpenFileAtLine,
    onRunSandboxTests,
    onToggleRightPanel,
  ]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center pt-[12vh] px-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Command Palette"
    >
      <div
        className="modal-animate-in w-full max-w-xl bg-[#151821] border border-[#353B50] rounded-[14px] overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 h-12 border-b border-[#262B3A]">
          <Search className="w-4 h-4 text-[#6B728A] shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSelectedIndex((i) => Math.min(items.length - 1, i + 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSelectedIndex((i) => Math.max(0, i - 1));
              } else if (e.key === 'Enter' && items[selectedIndex]) {
                e.preventDefault();
                items[selectedIndex].run();
              } else if (e.key === 'Escape') {
                onClose();
              }
            }}
            placeholder="Search files, symbols, screens, or commands..."
            className="flex-1 bg-transparent text-[13px] text-[#E6E9F2] placeholder-[#6B728A] outline-none"
          />
          <span className="font-mono text-[11px] text-[#6B728A]">ESC</span>
        </div>

        <div className="max-h-80 overflow-y-auto py-1.5">
          {items.length === 0 ? (
            <div className="px-4 py-8 text-center text-[12px] text-[#6B728A]">
              No matching commands, files, or symbols found.
            </div>
          ) : (
            items.map((item, idx) => (
              <button
                key={item.id}
                onMouseEnter={() => setSelectedIndex(idx)}
                onClick={item.run}
                className={`w-full flex items-center justify-between gap-3 px-4 py-2 text-left transition-colors duration-120 ${
                  idx === selectedIndex ? 'bg-[#1C2030] text-[#E6E9F2]' : 'text-[#A3AABF]'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  {item.kind === 'action' ? (
                    <Play className="w-3.5 h-3.5 text-[#6C7BFF] shrink-0" />
                  ) : item.kind === 'file' ? (
                    <FileCode2 className="w-3.5 h-3.5 text-[#4DB8FF] shrink-0" />
                  ) : item.kind === 'symbol' ? (
                    <Code2 className="w-3.5 h-3.5 text-[#3DD68C] shrink-0" />
                  ) : (
                    <Command className="w-3.5 h-3.5 text-[#A3AABF] shrink-0" />
                  )}
                  <div className="min-w-0">
                    <div className="text-[13px] font-medium truncate font-mono">{item.label}</div>
                    <div className="text-[11px] text-[#6B728A] truncate">{item.sublabel}</div>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
