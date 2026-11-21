import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Blocks,
  Check,
  Code2,
  Copy,
  FilePlus2,
  GitCompare,
  Info,
  Loader2,
  Play,
  RotateCcw,
  Save,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import type {
  CodeChange,
  ExtensionCommandContribution,
  ExtensionDiagnostic,
  RepoFile,
  SecurityFinding,
} from '../types/devmind';

export interface ActiveExtensionCommand extends ExtensionCommandContribution {
  extensionId: string;
  extensionName: string;
}

interface CodeEditorViewProps {
  file: RepoFile | null;
  highlightLine: number | null;
  pendingDiff: CodeChange | null;
  securityFindings: SecurityFinding[];
  extensionDiagnostics: ExtensionDiagnostic[];
  activeCommands: ActiveExtensionCommand[];
  onSaveFile: (path: string, content: string) => Promise<void>;
  onCreateFile: (path: string, content: string) => Promise<void>;
  onDeleteFile: (path: string) => Promise<void>;
  onRunExtensionCommand: (commandId: string, filePath?: string) => Promise<void>;
  onCursorChange?: (pos: { line: number; col: number }) => void;
  onClearDiff: () => void;
}

export const CodeEditorView: React.FC<CodeEditorViewProps> = ({
  file,
  highlightLine,
  pendingDiff,
  securityFindings,
  extensionDiagnostics,
  activeCommands,
  onSaveFile,
  onCreateFile,
  onDeleteFile,
  onRunExtensionCommand,
  onCursorChange,
  onClearDiff,
}) => {
  const [viewMode, setViewMode] = useState<'code' | 'diff'>('code');
  const [draft, setDraft] = useState<string>(file?.content ?? '');
  const [saving, setSaving] = useState(false);
  const [autoSync, setAutoSync] = useState(true);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [runningCmdId, setRunningCmdId] = useState<string | null>(null);

  const [creatingFile, setCreatingFile] = useState(false);
  const [newFilePath, setNewFilePath] = useState('src/utils/helper.ts');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const gutterRef = useRef<HTMLDivElement | null>(null);
  const activeFilePathRef = useRef<string | null>(file?.path ?? null);
  const lastServerContentRef = useRef<string>(file?.content ?? '');
  const isDirtyRef = useRef<boolean>(false);

  const isDirty = file ? draft !== file.content : false;
  isDirtyRef.current = isDirty;

  // Switch file or accept remote updates only when not clobbering active unsaved typing
  useEffect(() => {
    const incomingPath = file?.path ?? null;
    const incomingContent = file?.content ?? '';

    if (incomingPath !== activeFilePathRef.current) {
      activeFilePathRef.current = incomingPath;
      lastServerContentRef.current = incomingContent;
      setDraft(incomingContent);
      setConfirmDelete(false);
      setSyncNotice(null);
      return;
    }

    if (incomingContent !== lastServerContentRef.current) {
      const wasDirty = isDirtyRef.current;
      lastServerContentRef.current = incomingContent;
      if (!wasDirty) {
        setDraft(incomingContent);
      }
    }
  }, [file?.path, file?.content]);

  // Switch automatically to diff tab when a diff is selected
  useEffect(() => {
    if (pendingDiff && file && pendingDiff.filePath === file.path) {
      setViewMode('diff');
    } else if (!pendingDiff) {
      setViewMode('code');
    }
  }, [pendingDiff, file]);

  // Jump cursor to highlighted line
  useEffect(() => {
    if (!highlightLine || !textareaRef.current || viewMode !== 'code') return;
    const lines = draft.split('\n');
    const clampedLine = Math.max(1, Math.min(highlightLine, lines.length));
    let charOffset = 0;
    for (let i = 0; i < clampedLine - 1; i++) {
      charOffset += lines[i].length + 1;
    }
    const ta = textareaRef.current;
    ta.focus();
    ta.setSelectionRange(charOffset, charOffset + (lines[clampedLine - 1]?.length ?? 0));
    const lineHeight = 20;
    ta.scrollTop = Math.max(0, (clampedLine - 6) * lineHeight);
    if (gutterRef.current) {
      gutterRef.current.scrollTop = ta.scrollTop;
    }
    onCursorChange?.({ line: clampedLine, col: 1 });
  }, [highlightLine, file?.path, viewMode]);

  // Debounced auto-sync to disk & Extension Host onFileSave
  useEffect(() => {
    if (!autoSync || !file || !isDirty) return;
    const timer = window.setTimeout(async () => {
      setSaving(true);
      try {
        await onSaveFile(file.path, draft);
        lastServerContentRef.current = draft;
        setSyncNotice('Synced');
      } catch (err) {
        setSyncNotice(err instanceof Error ? err.message : 'Sync failed');
      } finally {
        setSaving(false);
      }
    }, 900);
    return () => window.clearTimeout(timer);
  }, [autoSync, draft, file, isDirty, onSaveFile]);

  const handleManualSave = async () => {
    if (!file || saving) return;
    setSaving(true);
    try {
      await onSaveFile(file.path, draft);
      lastServerContentRef.current = draft;
      setSyncNotice('Saved');
    } catch (err) {
      setSyncNotice(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleCursorUpdate = (el: HTMLTextAreaElement) => {
    if (!onCursorChange) return;
    const before = el.value.slice(0, el.selectionStart);
    const lines = before.split('\n');
    onCursorChange({ line: lines.length, col: lines[lines.length - 1].length + 1 });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      handleManualSave();
      return;
    }

    if (e.key === 'Tab') {
      e.preventDefault();
      const target = e.currentTarget;
      const start = target.selectionStart;
      const end = target.selectionEnd;
      const updated = draft.substring(0, start) + '  ' + draft.substring(end);
      setDraft(updated);
      window.requestAnimationFrame(() => {
        if (textareaRef.current) {
          textareaRef.current.selectionStart = start + 2;
          textareaRef.current.selectionEnd = start + 2;
          handleCursorUpdate(textareaRef.current);
        }
      });
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(draft);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard may be unavailable in restricted frames
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = newFilePath.trim().replace(/^\/+/, '');
    if (!cleaned) return;
    await onCreateFile(cleaned, `// ${cleaned}\n\nexport {};\n`);
    setCreatingFile(false);
    setNewFilePath('');
  };

  const handleRunCommand = async (cmdId: string) => {
    if (!file || runningCmdId) return;
    setRunningCmdId(cmdId);
    try {
      // Save unsaved edits first so extension transforms operate on latest buffer
      if (isDirty) {
        await onSaveFile(file.path, draft);
        lastServerContentRef.current = draft;
      }
      await onRunExtensionCommand(cmdId, file.path);
      setSyncNotice('Extension applied');
    } catch (err) {
      setSyncNotice(err instanceof Error ? err.message : 'Command failed');
    } finally {
      setRunningCmdId(null);
    }
  };

  const fileSecurityFindings = useMemo(
    () => (file ? securityFindings.filter((f) => f.filePath === file.path && f.status === 'open') : []),
    [file, securityFindings]
  );

  const fileExtDiagnostics = useMemo(
    () => (file ? extensionDiagnostics.filter((d) => d.filePath === file.path) : []),
    [file, extensionDiagnostics]
  );

  const fileCommands = useMemo(
    () => activeCommands.filter((c) => c.requiresActiveFile),
    [activeCommands]
  );

  const lineNumbers = useMemo(() => {
    const total = Math.max(1, draft.split('\n').length);
    return Array.from({ length: total }, (_, idx) => idx + 1);
  }, [draft]);

  const issueLinesMap = useMemo(() => {
    const map = new Map<number, 'error' | 'warning' | 'info'>();
    for (const f of fileSecurityFindings) {
      map.set(f.line, f.severity === 'critical' || f.severity === 'high' ? 'error' : 'warning');
    }
    for (const d of fileExtDiagnostics) {
      const existing = map.get(d.line);
      if (!existing || d.severity === 'error') {
        map.set(d.line, d.severity);
      }
    }
    return map;
  }, [fileSecurityFindings, fileExtDiagnostics]);

  if (!file) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-[var(--surface-canvas)] text-[var(--ink-secondary)] p-8 text-center">
        <Code2 className="w-8 h-8 text-[var(--ink-muted)] mb-3" />
        <p className="text-sm font-medium text-[var(--ink-primary)]">No file open</p>
        <p className="text-xs text-[var(--ink-muted)] mt-1 max-w-sm">
          Select a source file from the Explorer sidebar or press Ctrl+K to open any file or run an extension command.
        </p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-[var(--surface-canvas)] overflow-hidden">
      {/* Editor Header Bar */}
      <div className="h-10 px-3 border-b border-[var(--border-hairline)] bg-[var(--surface-elevated)] flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-mono font-medium text-[var(--ink-primary)] truncate">
            {file.path}
          </span>
          {isDirty && (
            <span className="text-[11px] font-medium text-[var(--status-warning)] shrink-0">
              Unsaved
            </span>
          )}
          {!isDirty && syncNotice && (
            <span className="text-[11px] text-[var(--ink-muted)] shrink-0">· {syncNotice}</span>
          )}
          <span className="text-[11px] font-mono text-[var(--ink-muted)] hidden sm:inline">
            · {file.language} · {lineNumbers.length} lines
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {pendingDiff && pendingDiff.filePath === file.path && (
            <div className="flex items-center border border-[var(--border-hairline)] rounded-[3px] overflow-hidden mr-1">
              <button
                type="button"
                onClick={() => setViewMode('code')}
                className={`h-6 px-2 text-[11px] font-medium ${
                  viewMode === 'code'
                    ? 'bg-[var(--accent-soft)] text-[var(--accent-primary)]'
                    : 'bg-[var(--surface-canvas)] text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]'
                }`}
              >
                Editor
              </button>
              <button
                type="button"
                onClick={() => setViewMode('diff')}
                className={`h-6 px-2 text-[11px] font-medium inline-flex items-center gap-1 ${
                  viewMode === 'diff'
                    ? 'bg-[var(--accent-soft)] text-[var(--accent-primary)]'
                    : 'bg-[var(--surface-canvas)] text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]'
                }`}
              >
                <GitCompare className="w-3 h-3" />
                Diff
              </button>
            </div>
          )}

          <label className="hidden md:inline-flex items-center gap-1.5 text-[11px] text-[var(--ink-secondary)] mr-1 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoSync}
              onChange={(e) => setAutoSync(e.target.checked)}
              className="accent-[var(--accent-primary)] rounded"
            />
            Auto-Sync
          </label>

          <button
            type="button"
            onClick={handleManualSave}
            disabled={!isDirty || saving}
            title="Save file (Ctrl+S)"
            className="h-7 px-2.5 text-xs font-medium rounded-[3px] bg-[var(--accent-primary)] text-[var(--accent-ink)] hover:bg-[var(--accent-hover)] disabled:opacity-40 inline-flex items-center gap-1.5 transition-colors"
          >
            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
            Save
          </button>

          {isDirty && (
            <button
              type="button"
              onClick={() => setDraft(file.content)}
              title="Revert unsaved edits"
              className="h-7 px-2 text-xs rounded-[3px] border border-[var(--border-hairline)] text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:bg-[var(--surface-hover)]"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            type="button"
            onClick={handleCopy}
            title="Copy buffer"
            className="h-7 px-2 text-xs rounded-[3px] border border-[var(--border-hairline)] text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:bg-[var(--surface-hover)]"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-[var(--status-success)]" /> : <Copy className="w-3.5 h-3.5" />}
          </button>

          <button
            type="button"
            onClick={() => setCreatingFile((v) => !v)}
            title="New file"
            className="h-7 px-2 text-xs rounded-[3px] border border-[var(--border-hairline)] text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:bg-[var(--surface-hover)]"
          >
            <FilePlus2 className="w-3.5 h-3.5" />
          </button>

          {confirmDelete ? (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={async () => {
                  await onDeleteFile(file.path);
                  setConfirmDelete(false);
                }}
                className="h-7 px-2 text-[11px] font-medium rounded-[3px] bg-[var(--status-danger)] text-white"
              >
                Delete
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="h-7 px-2 text-[11px] rounded-[3px] border border-[var(--border-hairline)] text-[var(--ink-secondary)]"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              title="Delete file"
              className="h-7 px-2 text-xs rounded-[3px] border border-[var(--border-hairline)] text-[var(--ink-secondary)] hover:text-[var(--status-danger)] hover:bg-[var(--surface-hover)]"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Contributed Extension Actions Strip (Dynamic from Active Extensions) */}
      {fileCommands.length > 0 && viewMode === 'code' && (
        <div className="h-8 px-3 border-b border-[var(--border-hairline)] bg-[var(--surface-subtle)] flex items-center gap-2 overflow-x-auto shrink-0">
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--ink-muted)] shrink-0">
            <Blocks className="w-3 h-3 text-[var(--accent-primary)]" />
            Extension Actions:
          </span>
          {fileCommands.map((cmd) => (
            <button
              key={cmd.id}
              type="button"
              disabled={runningCmdId !== null}
              onClick={() => handleRunCommand(cmd.id)}
              title={`${cmd.extensionName}: ${cmd.description}`}
              className="h-5 px-2 text-[11px] rounded-[3px] border border-[var(--border-hairline)] bg-[var(--surface-canvas)] text-[var(--ink-primary)] hover:border-[var(--accent-primary)] hover:text-[var(--accent-primary)] disabled:opacity-40 inline-flex items-center gap-1 shrink-0 transition-colors"
            >
              {runningCmdId === cmd.id ? (
                <Loader2 className="w-2.5 h-2.5 animate-spin" />
              ) : (
                <Play className="w-2.5 h-2.5 text-[var(--accent-primary)]" />
              )}
              {cmd.title}
            </button>
          ))}
        </div>
      )}

      {/* Inline New File Creation Bar */}
      {creatingFile && (
        <form
          onSubmit={handleCreateSubmit}
          className="px-3 py-2 border-b border-[var(--border-hairline)] bg-[var(--surface-subtle)] flex items-center gap-2 shrink-0"
        >
          <span className="text-xs text-[var(--ink-secondary)]">New file path:</span>
          <input
            type="text"
            value={newFilePath}
            onChange={(e) => setNewFilePath(e.target.value)}
            placeholder="src/services/example.ts"
            autoFocus
            className="flex-1 max-w-sm h-7 px-2.5 text-xs font-mono rounded-[3px] bg-[var(--surface-canvas)] border border-[var(--border-strong)] text-[var(--ink-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
          />
          <button
            type="submit"
            className="h-7 px-3 text-xs font-medium rounded-[3px] bg-[var(--accent-primary)] text-[var(--accent-ink)]"
          >
            Create
          </button>
          <button
            type="button"
            onClick={() => setCreatingFile(false)}
            className="h-7 px-2.5 text-xs rounded-[3px] border border-[var(--border-hairline)] text-[var(--ink-secondary)]"
          >
            Cancel
          </button>
        </form>
      )}

      {/* Inline File Diagnostics & Security Findings Banner */}
      {(fileSecurityFindings.length > 0 || fileExtDiagnostics.length > 0) && viewMode === 'code' && (
        <div className="px-3 py-1.5 border-b border-[var(--border-hairline)] bg-[var(--surface-elevated)] flex items-center gap-3 overflow-x-auto shrink-0 text-[11px]">
          {fileSecurityFindings.slice(0, 2).map((finding) => (
            <div key={finding.id} className="inline-flex items-center gap-1.5 text-[var(--status-danger)] shrink-0">
              <ShieldAlert className="w-3.5 h-3.5" />
              <span className="font-mono">L{finding.line}</span>
              <span>{finding.title}</span>
              <span className="text-[var(--ink-muted)]">({finding.cwe})</span>
            </div>
          ))}
          {fileExtDiagnostics.slice(0, 3).map((diag) => (
            <div
              key={diag.id}
              className={`inline-flex items-center gap-1.5 shrink-0 ${
                diag.severity === 'error'
                  ? 'text-[var(--status-danger)]'
                  : diag.severity === 'warning'
                  ? 'text-[var(--status-warning)]'
                  : 'text-[var(--status-info)]'
              }`}
            >
              {diag.severity === 'error' ? (
                <AlertCircle className="w-3.5 h-3.5" />
              ) : diag.severity === 'warning' ? (
                <AlertTriangle className="w-3.5 h-3.5" />
              ) : (
                <Info className="w-3.5 h-3.5" />
              )}
              <span className="font-mono">L{diag.line}</span>
              <span className="text-[var(--ink-primary)]">{diag.message}</span>
              <span className="text-[var(--ink-muted)]">[{diag.source}]</span>
            </div>
          ))}
        </div>
      )}

      {/* Main Editor Canvas or Unified Diff View */}
      {viewMode === 'diff' && pendingDiff ? (
        <div className="flex-1 overflow-auto bg-[var(--surface-canvas)] p-4 font-mono text-xs">
          <div className="mb-3 flex items-center justify-between border-b border-[var(--border-hairline)] pb-2">
            <div>
              <div className="text-xs font-sans font-semibold text-[var(--ink-primary)]">
                Proposed Patch Diff — {pendingDiff.filePath}
              </div>
              <p className="text-[11px] font-sans text-[var(--ink-secondary)] mt-0.5">
                {pendingDiff.rationale}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                onClearDiff();
                setViewMode('code');
              }}
              className="h-7 px-2.5 text-xs font-sans rounded-[3px] border border-[var(--border-hairline)] text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]"
            >
              Close Diff
            </button>
          </div>
          <pre className="leading-5 whitespace-pre-wrap">
            {pendingDiff.diffText.split('\n').map((line, i) => {
              let cls = 'text-[var(--ink-secondary)]';
              if (line.startsWith('+') && !line.startsWith('+++')) {
                cls = 'bg-[var(--status-success)]/12 text-[var(--status-success)]';
              } else if (line.startsWith('-') && !line.startsWith('---')) {
                cls = 'bg-[var(--status-danger)]/12 text-[var(--status-danger)]';
              } else if (line.startsWith('@@')) {
                cls = 'text-[var(--accent-primary)] font-semibold';
              }
              return (
                <div key={i} className={`px-2 ${cls}`}>
                  {line || ' '}
                </div>
              );
            })}
          </pre>
        </div>
      ) : (
        <div className="flex-1 flex min-h-0 overflow-hidden bg-[var(--surface-canvas)] relative">
          {/* Synchronized Line Number Gutter */}
          <div
            ref={gutterRef}
            aria-hidden="true"
            className="w-12 shrink-0 py-3 bg-[var(--surface-sidebar)] border-r border-[var(--border-hairline)] text-right pr-2.5 font-mono text-xs leading-5 text-[var(--ink-muted)] select-none overflow-hidden"
          >
            {lineNumbers.map((num) => {
              const issue = issueLinesMap.get(num);
              const isHighlighted = highlightLine === num;
              return (
                <div
                  key={num}
                  className={`h-5 flex items-center justify-end gap-1 ${
                    isHighlighted
                      ? 'text-[var(--accent-primary)] font-semibold'
                      : issue === 'error'
                      ? 'text-[var(--status-danger)] font-semibold'
                      : issue === 'warning'
                      ? 'text-[var(--status-warning)]'
                      : ''
                  }`}
                >
                  {issue && (
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        issue === 'error'
                          ? 'bg-[var(--status-danger)]'
                          : issue === 'warning'
                          ? 'bg-[var(--status-warning)]'
                          : 'bg-[var(--status-info)]'
                      }`}
                    />
                  )}
                  <span>{num}</span>
                </div>
              );
            })}
          </div>

          {/* Native Editable Code Surface */}
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              handleCursorUpdate(e.target);
            }}
            onClick={(e) => handleCursorUpdate(e.currentTarget)}
            onKeyUp={(e) => handleCursorUpdate(e.currentTarget)}
            onKeyDown={handleKeyDown}
            onScroll={(e) => {
              if (gutterRef.current) {
                gutterRef.current.scrollTop = e.currentTarget.scrollTop;
              }
            }}
            spellCheck={false}
            autoCapitalize="off"
            autoComplete="off"
            autoCorrect="off"
            aria-label={`Code editor for ${file.path}`}
            className="flex-1 w-full h-full py-3 px-4 bg-[var(--surface-canvas)] text-[var(--ink-primary)] font-mono text-xs leading-5 resize-none focus:outline-none overflow-auto whitespace-pre"
          />
        </div>
      )}
    </div>
  );
};
