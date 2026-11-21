import React, { useEffect, useMemo, useState } from 'react';
import {
  Blocks,
  Code2,
  Compass,
  FileCode2,
  Play,
  Search,
  X,
} from 'lucide-react';
import type { ExtensionCommandContribution, Project, ScreenId } from '../types/devmind';

interface CommandPaletteProps {
  open: boolean;
  project: Project | null;
  activeFilePath: string | null;
  activeCommands: Array<ExtensionCommandContribution & { extensionId: string; extensionName: string }>;
  onClose: () => void;
  onNavigate: (screen: ScreenId) => void;
  onOpenFile: (filePath: string, line?: number) => void;
  onRunExtensionCommand: (commandId: string, filePath?: string) => Promise<void>;
  onReindex: () => void;
}

interface PaletteItem {
  id: string;
  group: 'Extension Command' | 'Navigation' | 'File' | 'Symbol';
  label: string;
  detail: string;
  action: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  open,
  project,
  activeFilePath,
  activeCommands,
  onClose,
  onNavigate,
  onOpenFile,
  onRunExtensionCommand,
  onReindex,
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIndex(0);
    }
  }, [open]);

  const items = useMemo<PaletteItem[]>(() => {
    const list: PaletteItem[] = [
      ...activeCommands.map((cmd) => ({
        id: `extcmd:${cmd.id}`,
        group: 'Extension Command' as const,
        label: `${cmd.category}: ${cmd.title}`,
        detail: `${cmd.extensionName}${cmd.requiresActiveFile && !activeFilePath ? ' (open file first)' : ''}`,
        action: () => {
          onRunExtensionCommand(cmd.id, activeFilePath || undefined);
          onClose();
        },
      })),
      {
        id: 'nav:explorer',
        group: 'Navigation',
        label: 'View: Code Editor',
        detail: 'Switch to source editor & explorer',
        action: () => {
          onNavigate('explorer');
          onClose();
        },
      },
      {
        id: 'nav:extensions',
        group: 'Navigation',
        label: 'View: Extensions Marketplace',
        detail: 'Install, enable, disable, and inspect extensions',
        action: () => {
          onNavigate('extensions');
          onClose();
        },
      },
      {
        id: 'nav:dashboard',
        group: 'Navigation',
        label: 'View: Workspace Overview',
        detail: 'Repositories, tasks, security, and spend overview',
        action: () => {
          onNavigate('dashboard');
          onClose();
        },
      },
      {
        id: 'nav:brain',
        group: 'Navigation',
        label: 'View: Architecture & Symbol Index',
        detail: 'Module dependency graph and hybrid search',
        action: () => {
          onNavigate('brain');
          onClose();
        },
      },
      {
        id: 'nav:debugging',
        group: 'Navigation',
        label: 'View: Diagnostics & Root Cause',
        detail: 'Analyze stack traces and active problems',
        action: () => {
          onNavigate('debugging');
          onClose();
        },
      },
      {
        id: 'nav:security',
        group: 'Navigation',
        label: 'View: Security Center',
        detail: 'Static CWE findings and remediation',
        action: () => {
          onNavigate('security');
          onClose();
        },
      },
      {
        id: 'nav:history',
        group: 'Navigation',
        label: 'View: Task Execution History',
        detail: 'Inspect patches, priorities, and rollback snapshots',
        action: () => {
          onNavigate('history');
          onClose();
        },
      },
      {
        id: 'nav:settings',
        group: 'Navigation',
        label: 'View: Settings & Windows Runtime',
        detail: 'Theme, provider key, policies, and .exe packaging',
        action: () => {
          onNavigate('settings');
          onClose();
        },
      },
      {
        id: 'act:reindex',
        group: 'Navigation',
        label: 'Workspace: Rebuild AST Index',
        detail: 'Re-parse repository symbols and dependency graph',
        action: () => {
          onReindex();
          onClose();
        },
      },
    ];

    if (project) {
      for (const file of project.files) {
        list.push({
          id: `file:${file.path}`,
          group: 'File',
          label: file.path,
          detail: `${file.language} · ${file.lineCount} lines`,
          action: () => {
            onOpenFile(file.path, 1);
            onClose();
          },
        });
      }
      for (const sym of project.symbols.slice(0, 40)) {
        list.push({
          id: `sym:${sym.id}`,
          group: 'Symbol',
          label: `${sym.name} (${sym.kind})`,
          detail: `${sym.filePath}:${sym.startLine}`,
          action: () => {
            onOpenFile(sym.filePath, sym.startLine);
            onClose();
          },
        });
      }
    }

    const q = query.trim().toLowerCase();
    if (!q) return list.slice(0, 18);
    return list
      .filter(
        (item) =>
          item.label.toLowerCase().includes(q) ||
          item.detail.toLowerCase().includes(q) ||
          item.group.toLowerCase().includes(q)
      )
      .slice(0, 20);
  }, [activeCommands, activeFilePath, project, query, onClose, onNavigate, onOpenFile, onRunExtensionCommand, onReindex]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/45 flex items-start justify-center pt-[12vh] px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-[6px] border border-[var(--border-strong)] bg-[var(--surface-elevated)] shadow-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-3.5 h-11 border-b border-[var(--border-hairline)] flex items-center gap-2.5 bg-[var(--surface-canvas)]">
          <Search className="w-4 h-4 text-[var(--ink-muted)] shrink-0" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose();
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSelectedIndex((i) => Math.min(items.length - 1, i + 1));
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSelectedIndex((i) => Math.max(0, i - 1));
              }
              if (e.key === 'Enter' && items[selectedIndex]) {
                e.preventDefault();
                items[selectedIndex].action();
              }
            }}
            autoFocus
            placeholder="Type a file name, symbol, view, or extension command..."
            className="flex-1 bg-transparent text-xs text-[var(--ink-primary)] placeholder:text-[var(--ink-muted)] focus:outline-none"
          />
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-[var(--ink-muted)] hover:text-[var(--ink-primary)]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="max-h-[360px] overflow-y-auto divide-y divide-[var(--border-hairline)]">
          {items.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-[var(--ink-muted)]">
              No matching commands, files, or symbols.
            </div>
          ) : (
            items.map((item, idx) => (
              <button
                key={item.id}
                type="button"
                onClick={item.action}
                onMouseEnter={() => setSelectedIndex(idx)}
                className={`w-full px-3.5 py-2 text-left flex items-center justify-between gap-3 text-xs transition-colors ${
                  idx === selectedIndex
                    ? 'bg-[var(--surface-active)] text-[var(--ink-primary)]'
                    : 'text-[var(--ink-secondary)] hover:bg-[var(--surface-hover)]'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  {item.group === 'Extension Command' ? (
                    <Play className="w-3.5 h-3.5 text-[var(--accent-primary)] shrink-0" />
                  ) : item.group === 'File' ? (
                    <FileCode2 className="w-3.5 h-3.5 text-[var(--ink-muted)] shrink-0" />
                  ) : item.group === 'Symbol' ? (
                    <Code2 className="w-3.5 h-3.5 text-[var(--ink-muted)] shrink-0" />
                  ) : (
                    <Compass className="w-3.5 h-3.5 text-[var(--ink-muted)] shrink-0" />
                  )}
                  <span className="truncate font-medium text-[var(--ink-primary)]">{item.label}</span>
                </div>
                <span className="text-[11px] font-mono text-[var(--ink-muted)] truncate max-w-[200px] shrink-0">
                  {item.detail}
                </span>
              </button>
            ))
          )}
        </div>

        <div className="px-3.5 py-1.5 border-t border-[var(--border-hairline)] bg-[var(--surface-chrome)] flex items-center justify-between text-[10px] font-mono text-[var(--ink-muted)]">
          <span className="inline-flex items-center gap-1">
            <Blocks className="w-3 h-3" />
            {activeCommands.length} active extension commands
          </span>
          <span>↑↓ Navigate · Enter Execute · Esc Close</span>
        </div>
      </div>
    </div>
  );
};
