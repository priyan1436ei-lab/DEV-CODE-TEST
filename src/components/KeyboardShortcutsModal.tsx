import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard, Search, X } from 'lucide-react';

export type ShortcutCategory =
  | 'Navigation'
  | 'Panels'
  | 'Editor'
  | 'Command Palette'
  | 'Window & Appearance';

export interface KeyboardShortcutEntry {
  id: string;
  category: ShortcutCategory;
  action: string;
  description: string;
  macKeys: string[];
  winKeys: string[];
  keywords?: string[];
}

export const DEVMIND_KEYBOARD_SHORTCUTS: KeyboardShortcutEntry[] = [
  // Navigation
  {
    id: 'spotlight-search',
    category: 'Navigation',
    action: 'Open Spotlight Command Palette',
    description: 'Search files, AST symbols, workspace views, and active extension commands.',
    macKeys: ['⌘', 'K'],
    winKeys: ['Ctrl', 'K'],
    keywords: ['search', 'palette', 'spotlight', 'commands', 'files', 'symbols'],
  },
  {
    id: 'shortcuts-help',
    category: 'Navigation',
    action: 'Open Keyboard Shortcuts Help',
    description: 'Display this searchable keyboard shortcut cheat sheet overlay.',
    macKeys: ['⌘', '/'],
    winKeys: ['Ctrl', '/'],
    keywords: ['help', 'cheat sheet', 'hotkeys', 'keymap', 'question', 'f1'],
  },
  {
    id: 'shortcuts-help-quick',
    category: 'Navigation',
    action: 'Quick Open Help Overlay',
    description: 'Press Shift + ? anywhere outside an input field (or F1) to open shortcuts.',
    macKeys: ['Shift', '?'],
    winKeys: ['Shift', '?'],
    keywords: ['help', 'question mark', 'shortcuts', 'quick'],
  },
  {
    id: 'nav-editor',
    category: 'Navigation',
    action: 'Switch to Code Editor',
    description: 'Open the repository source editor and file explorer workspace.',
    macKeys: ['⌘', '1'],
    winKeys: ['Ctrl', '1'],
    keywords: ['code', 'editor', 'explorer', 'view'],
  },
  {
    id: 'nav-dashboard',
    category: 'Navigation',
    action: 'Switch to Workspace Overview',
    description: 'View indexed repositories, agent job timelines, security summary, and spend cap.',
    macKeys: ['⌘', '2'],
    winKeys: ['Ctrl', '2'],
    keywords: ['dashboard', 'overview', 'timeline', 'tasks'],
  },
  {
    id: 'nav-brain',
    category: 'Navigation',
    action: 'Switch to Architecture & Symbol Index',
    description: 'Inspect module dependency graph and run hybrid repository search.',
    macKeys: ['⌘', '3'],
    winKeys: ['Ctrl', '3'],
    keywords: ['brain', 'ast', 'architecture', 'graph', 'symbols'],
  },
  {
    id: 'nav-extensions',
    category: 'Navigation',
    action: 'Switch to Extensions Marketplace',
    description: 'Install, enable, disable, and trigger Extension Host commands.',
    macKeys: ['⌘', '4'],
    winKeys: ['Ctrl', '4'],
    keywords: ['extensions', 'plugins', 'marketplace', 'host'],
  },
  {
    id: 'nav-debugging',
    category: 'Navigation',
    action: 'Switch to Diagnostics & Root Cause',
    description: 'Analyze stack traces, compiler problems, and runtime diagnostics.',
    macKeys: ['⌘', '5'],
    winKeys: ['Ctrl', '5'],
    keywords: ['debug', 'diagnostics', 'stack trace', 'errors'],
  },
  {
    id: 'nav-security',
    category: 'Navigation',
    action: 'Switch to Security Center',
    description: 'Review static CWE findings, redaction counts, and remediation actions.',
    macKeys: ['⌘', '6'],
    winKeys: ['Ctrl', '6'],
    keywords: ['security', 'cwe', 'vulnerabilities', 'scan'],
  },
  {
    id: 'nav-history',
    category: 'Navigation',
    action: 'Switch to Task Execution History',
    description: 'Inspect multi-step engineering patches, priorities, and rollback snapshots.',
    macKeys: ['⌘', '7'],
    winKeys: ['Ctrl', '7'],
    keywords: ['history', 'tasks', 'rollback', 'diff', 'patches'],
  },
  {
    id: 'nav-settings',
    category: 'Navigation',
    action: 'Open Settings & Desktop Runtime',
    description: 'Configure appearance, BYOK provider credentials, policies, and packaging.',
    macKeys: ['⌘', ','],
    winKeys: ['Ctrl', ','],
    keywords: ['settings', 'preferences', 'policy', 'budget', 'api'],
  },

  // Panels
  {
    id: 'toggle-sidebar',
    category: 'Panels',
    action: 'Toggle Explorer Sidebar',
    description: 'Show or collapse the left workspace navigation and repository file tree.',
    macKeys: ['⌘', 'B'],
    winKeys: ['Ctrl', 'B'],
    keywords: ['sidebar', 'explorer', 'files', 'tree', 'layout'],
  },
  {
    id: 'toggle-console',
    category: 'Panels',
    action: 'Toggle Bottom Console Panel',
    description: 'Expand or collapse the Problems, Extensions Log, and Audit Trail workbench.',
    macKeys: ['⌘', 'J'],
    winKeys: ['Ctrl', 'J'],
    keywords: ['console', 'terminal', 'problems', 'output', 'audit', 'bottom'],
  },
  {
    id: 'toggle-inspector',
    category: 'Panels',
    action: 'Toggle AI Workspace Inspector',
    description: 'Show or hide the right-hand engineering task and repository chat inspector.',
    macKeys: ['⌘', '.'],
    winKeys: ['Ctrl', '.'],
    keywords: ['inspector', 'agent', 'chat', 'right panel', 'tasks'],
  },

  // Editor
  {
    id: 'editor-save',
    category: 'Editor',
    action: 'Save Active File',
    description: 'Save changes to the workspace (automatically queues in IndexedDB when offline).',
    macKeys: ['⌘', 'S'],
    winKeys: ['Ctrl', 'S'],
    keywords: ['save', 'write', 'offline', 'indexeddb', 'file'],
  },
  {
    id: 'editor-indent',
    category: 'Editor',
    action: 'Insert 2-Space Indentation',
    description: 'Insert two spaces at the active cursor position inside the code editor.',
    macKeys: ['Tab'],
    winKeys: ['Tab'],
    keywords: ['indent', 'spaces', 'tab', 'format'],
  },

  // Command Palette
  {
    id: 'palette-navigate',
    category: 'Command Palette',
    action: 'Navigate Search Results',
    description: 'Move selection up or down through Spotlight Command Palette items.',
    macKeys: ['↑', '↓'],
    winKeys: ['↑', '↓'],
    keywords: ['arrows', 'up', 'down', 'select', 'list'],
  },
  {
    id: 'palette-execute',
    category: 'Command Palette',
    action: 'Run Selected Item',
    description: 'Open the highlighted file, jump to a symbol, or invoke an extension command.',
    macKeys: ['↵'],
    winKeys: ['Enter'],
    keywords: ['enter', 'return', 'open', 'execute', 'confirm'],
  },
  {
    id: 'dismiss-overlay',
    category: 'Command Palette',
    action: 'Dismiss Modal or Menu',
    description: 'Close the Command Palette, Shortcuts Help overlay, or active toolbar menu.',
    macKeys: ['Esc'],
    winKeys: ['Esc'],
    keywords: ['escape', 'close', 'cancel', 'dismiss'],
  },

  // Window & Appearance
  {
    id: 'toggle-theme',
    category: 'Window & Appearance',
    action: 'Toggle Light / Dark Appearance',
    description: 'Switch immediately between macOS Light Porcelain and Dark Obsidian themes.',
    macKeys: ['⌘', 'Shift', 'L'],
    winKeys: ['Ctrl', 'Shift', 'L'],
    keywords: ['theme', 'dark mode', 'light mode', 'appearance', 'color'],
  },
  {
    id: 'window-maximize',
    category: 'Window & Appearance',
    action: 'Maximize / Restore Desktop Window',
    description: 'Double-click the unified top toolbar to toggle full window size on desktop.',
    macKeys: ['Double-Click', 'Titlebar'],
    winKeys: ['Double-Click', 'Titlebar'],
    keywords: ['window', 'maximize', 'restore', 'desktop', 'electron'],
  },
];

const CATEGORIES: Array<'All' | ShortcutCategory> = [
  'All',
  'Navigation',
  'Panels',
  'Editor',
  'Command Palette',
  'Window & Appearance',
];

interface KeyboardShortcutsModalProps {
  open: boolean;
  isMacPlatform: boolean;
  onClose: () => void;
}

export const KeyboardShortcutsModal: React.FC<KeyboardShortcutsModalProps> = ({
  open,
  isMacPlatform,
  onClose,
}) => {
  const [query, setQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<'All' | ShortcutCategory>('All');
  const [platformView, setPlatformView] = useState<'mac' | 'win'>(isMacPlatform ? 'mac' : 'win');
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedCategory('All');
      setPlatformView(isMacPlatform ? 'mac' : 'win');
      window.requestAnimationFrame(() => {
        searchInputRef.current?.focus();
      });
    }
  }, [open, isMacPlatform]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  const filteredShortcuts = useMemo(() => {
    const q = query.trim().toLowerCase();
    return DEVMIND_KEYBOARD_SHORTCUTS.filter((entry) => {
      if (selectedCategory !== 'All' && entry.category !== selectedCategory) {
        return false;
      }
      if (!q) return true;
      const keysText = [...entry.macKeys, ...entry.winKeys].join(' ').toLowerCase();
      const keywordsText = (entry.keywords || []).join(' ').toLowerCase();
      return (
        entry.action.toLowerCase().includes(q) ||
        entry.description.toLowerCase().includes(q) ||
        entry.category.toLowerCase().includes(q) ||
        keysText.includes(q) ||
        keywordsText.includes(q)
      );
    });
  }, [query, selectedCategory]);

  const groupedShortcuts = useMemo(() => {
    const groups = new Map<ShortcutCategory, KeyboardShortcutEntry[]>();
    for (const entry of filteredShortcuts) {
      const existing = groups.get(entry.category) ?? [];
      existing.push(entry);
      groups.set(entry.category, existing);
    }
    return Array.from(groups.entries());
  }, [filteredShortcuts]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcuts-modal-title"
      className="fixed inset-0 z-50 bg-black/45 backdrop-blur-[6px] flex items-start justify-center pt-[9vh] px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl apple-sheet overflow-hidden flex flex-col max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-[var(--border-hairline)] flex items-center justify-between gap-4 shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Keyboard className="w-4 h-4 text-[var(--accent-primary)] shrink-0" />
              <h2
                id="shortcuts-modal-title"
                className="text-sm font-semibold text-[var(--ink-primary)] tracking-[-0.01em]"
              >
                Keyboard Shortcuts
              </h2>
            </div>
            <p className="text-[11px] text-[var(--ink-muted)] mt-0.5 font-mono tabular-nums">
              DevMind AI · {DEVMIND_KEYBOARD_SHORTCUTS.length} workspace commands
            </p>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <div
              className="apple-segmented"
              role="group"
              aria-label="Keymap platform display"
            >
              <button
                type="button"
                data-active={platformView === 'mac'}
                onClick={() => setPlatformView('mac')}
                className="apple-segmented-item h-6 px-2.5 text-[11px] font-medium text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] whitespace-nowrap shrink-0"
              >
                macOS
              </button>
              <button
                type="button"
                data-active={platformView === 'win'}
                onClick={() => setPlatformView('win')}
                className="apple-segmented-item h-6 px-2.5 text-[11px] font-medium text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] whitespace-nowrap shrink-0"
              >
                Win / Linux
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close keyboard shortcuts help"
              className="w-7 h-7 rounded-full flex items-center justify-center text-[var(--ink-muted)] hover:text-[var(--ink-primary)] hover:bg-[var(--surface-hover)] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Search Input & Category Filter Bar */}
        <div className="px-5 py-3 border-b border-[var(--border-hairline)] space-y-2.5 bg-[var(--surface-subtle)] shrink-0">
          <div className="relative flex items-center">
            <Search className="w-4 h-4 text-[var(--ink-muted)] absolute left-3 pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder='Search shortcuts by action, category, or key (e.g. "save", "console", "K")...'
              className="w-full h-9 pl-9 pr-8 rounded-lg bg-[var(--surface-elevated)] border border-[var(--border-strong)] text-xs text-[var(--ink-primary)] placeholder:text-[var(--ink-muted)] focus:border-[var(--accent-primary)] transition-colors"
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  searchInputRef.current?.focus();
                }}
                aria-label="Clear search query"
                className="absolute right-2 w-5 h-5 rounded-full flex items-center justify-center text-[var(--ink-muted)] hover:text-[var(--ink-primary)] hover:bg-[var(--surface-hover)]"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          <div className="overflow-x-auto pb-0.5">
            <div
              className="apple-segmented"
              role="group"
              aria-label="Filter keyboard shortcuts by category"
            >
              {CATEGORIES.map((category) => (
                <button
                  key={category}
                  type="button"
                  data-active={selectedCategory === category}
                  onClick={() => setSelectedCategory(category)}
                  className="apple-segmented-item h-6 px-2.5 text-[11px] font-medium text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] whitespace-nowrap shrink-0"
                >
                  {category}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Scrollable Cheat Sheet */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {groupedShortcuts.length === 0 ? (
            <div className="py-10 text-center space-y-2.5">
              <p className="text-xs font-medium text-[var(--ink-primary)]">
                No keyboard shortcuts match &ldquo;{query.trim()}&rdquo;.
              </p>
              <p className="text-[11px] text-[var(--ink-muted)]">
                Try searching for actions like save, sidebar, inspector, palette, or theme.
              </p>
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  setSelectedCategory('All');
                  searchInputRef.current?.focus();
                }}
                className="h-7 px-3 text-xs font-medium rounded-lg border border-[var(--border-strong)] bg-[var(--surface-canvas)] text-[var(--ink-primary)] hover:bg-[var(--surface-hover)] transition-colors"
              >
                Reset Filters
              </button>
            </div>
          ) : (
            groupedShortcuts.map(([category, items]) => (
              <div key={category} className="space-y-1.5">
                <div className="flex items-center justify-between pb-1 border-b border-[var(--border-hairline)]">
                  <h3 className="text-xs font-semibold text-[var(--ink-primary)]">
                    {category}
                  </h3>
                  <span className="text-[11px] font-mono tabular-nums text-[var(--ink-muted)]">
                    {items.length} shortcut{items.length === 1 ? '' : 's'}
                  </span>
                </div>

                <div className="divide-y divide-[var(--border-hairline)]">
                  {items.map((item) => {
                    const keys = platformView === 'mac' ? item.macKeys : item.winKeys;
                    return (
                      <div
                        key={item.id}
                        className="py-2.5 flex items-center justify-between gap-4"
                      >
                        <div className="min-w-0">
                          <div className="text-[13px] font-medium text-[var(--ink-primary)] truncate">
                            {item.action}
                          </div>
                          <div className="text-[11px] text-[var(--ink-muted)] mt-0.5">
                            {item.description}
                          </div>
                        </div>

                        <div
                          className="flex items-center gap-1 shrink-0"
                          aria-label={keys.join(' plus ')}
                        >
                          {keys.map((keyLabel, index) => (
                            <React.Fragment key={`${item.id}-${index}`}>
                              {index > 0 && (
                                <span
                                  aria-hidden="true"
                                  className="text-[10px] font-mono text-[var(--ink-muted)]"
                                >
                                  +
                                </span>
                              )}
                              <kbd className="inline-flex items-center justify-center min-w-[24px] h-6 px-1.5 rounded-md font-mono text-[11px] font-medium text-[var(--ink-primary)] bg-[var(--surface-canvas)] border border-[var(--border-strong)] shadow-[0_1px_0_var(--border-strong)] whitespace-nowrap">
                                {keyLabel}
                              </kbd>
                            </React.Fragment>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-2.5 border-t border-[var(--border-hairline)] bg-[var(--surface-subtle)] flex items-center justify-between text-[11px] font-mono tabular-nums text-[var(--ink-muted)] shrink-0">
          <span>
            Showing {filteredShortcuts.length} of {DEVMIND_KEYBOARD_SHORTCUTS.length} shortcuts
          </span>
          <span>Press {platformView === 'mac' ? '⌘/' : 'Ctrl+/'} or ? · Esc to close</span>
        </div>
      </div>
    </div>
  );
};
