import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Code2,
  Copy,
  Eye,
  FileDiff,
  RotateCcw,
  Save,
  ShieldAlert,
  Trash2,
  X,
} from 'lucide-react';
import type { CodeChange, CodeSymbol, Project, SecurityFinding } from '../types/devmind';

interface CodeEditorViewProps {
  project: Project;
  openTabs: string[];
  activeFilePath: string | null;
  highlightLine: number | null;
  activeDiffChange: CodeChange | null;
  securityFindings: SecurityFinding[];
  onSelectTab: (path: string) => void;
  onCloseTab: (path: string) => void;
  onCloseDiff: () => void;
  onSaveFile: (path: string, content: string, silent?: boolean) => Promise<void>;
  onDeleteFile: (path: string) => Promise<void>;
  onJumpToLine: (path: string, line: number) => void;
}

function highlightCodeLine(line: string, language: string): React.ReactNode {
  if (language === 'markdown' || language === 'plaintext') {
    return line || '\u00A0';
  }
  const trimmed = line.trimStart();
  if (trimmed.startsWith('//') || trimmed.startsWith('#') || trimmed.startsWith('/*') || trimmed.startsWith('*')) {
    return <span className="text-[#6B728A] italic">{line}</span>;
  }

  const tokenRegex =
    /('(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`|\b(?:import|export|from|const|let|var|function|return|if|else|try|catch|throw|new|async|await|interface|type|class|extends|implements|for|while|switch|case|break|default|true|false|null|undefined|void|number|string|boolean|unknown)\b|\b\d+(?:\.\d+)?\b)/g;

  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = tokenRegex.exec(line)) !== null) {
    if (match.index > lastIndex) {
      parts.push(line.slice(lastIndex, match.index));
    }
    const token = match[0];
    if (token.startsWith("'") || token.startsWith('"') || token.startsWith('`')) {
      parts.push(
        <span key={key++} className="text-[#2FD68C]">
          {token}
        </span>
      );
    } else if (/^\d/.test(token)) {
      parts.push(
        <span key={key++} className="text-[#F5B642]">
          {token}
        </span>
      );
    } else {
      parts.push(
        <span key={key++} className="text-[#7C96FF]">
          {token}
        </span>
      );
    }
    lastIndex = match.index + token.length;
  }

  if (lastIndex < line.length) {
    parts.push(line.slice(lastIndex));
  }
  return parts.length > 0 ? parts : '\u00A0';
}

export const CodeEditorView: React.FC<CodeEditorViewProps> = ({
  project,
  openTabs,
  activeFilePath,
  highlightLine,
  activeDiffChange,
  securityFindings,
  onSelectTab,
  onCloseTab,
  onCloseDiff,
  onSaveFile,
  onDeleteFile,
  onJumpToLine,
}) => {
  const safeFiles = Array.isArray(project?.files) ? project.files : [];
  const safeSymbols = Array.isArray(project?.symbols) ? project.symbols : [];
  const safeFindings = Array.isArray(securityFindings) ? securityFindings : [];

  const activeFile = useMemo(
    () => safeFiles.find((f) => f.path === activeFilePath) ?? null,
    [safeFiles, activeFilePath]
  );

  const fileSymbols: CodeSymbol[] = useMemo(
    () => (activeFile ? safeSymbols.filter((s) => s.filePath === activeFile.path) : []),
    [safeSymbols, activeFile]
  );

  const fileFindings = useMemo(
    () => (activeFile ? safeFindings.filter((f) => f.filePath === activeFile.path) : []),
    [safeFindings, activeFile]
  );

  // Default directly to live interactive editing so typing ALWAYS works immediately!
  const [viewMode, setViewMode] = useState<'edit' | 'annotated'>('edit');
  const [draftContent, setDraftContent] = useState('');
  const [autoSync, setAutoSync] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const gutterRef = useRef<HTMLDivElement | null>(null);
  const lineRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const loadedPathRef = useRef<string>('');
  const lastLoadedHashRef = useRef<string>('');
  const draftRef = useRef<string>('');
  const inFlightSaveContentRef = useRef<string | null>(null);
  const lastJumpKeyRef = useRef<string>('');
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    draftRef.current = draftContent;
  }, [draftContent]);

  // Sync buffer cleanly: always load when switching files; when same file updates on server,
  // NEVER clobber in-progress user edits while typing or during an in-flight Auto-Sync save.
  useEffect(() => {
    if (!activeFile) {
      setDraftContent('');
      draftRef.current = '';
      loadedPathRef.current = '';
      lastLoadedHashRef.current = '';
      return;
    }

    const switchingFile = activeFile.path !== loadedPathRef.current;
    const hashKey = `${activeFile.path}:${activeFile.contentHash}`;

    if (switchingFile) {
      setDraftContent(activeFile.content);
      draftRef.current = activeFile.content;
      loadedPathRef.current = activeFile.path;
      lastLoadedHashRef.current = hashKey;
      inFlightSaveContentRef.current = null;
      setConfirmDelete(false);
      setCursorPos({ line: 1, col: 1 });
      return;
    }

    if (hashKey !== lastLoadedHashRef.current) {
      lastLoadedHashRef.current = hashKey;
      // If this server update is the echo of our own save (or user typed more while saving), keep user's draft!
      if (inFlightSaveContentRef.current !== null && activeFile.content === inFlightSaveContentRef.current) {
        inFlightSaveContentRef.current = null;
        return;
      }
      // If textarea is NOT currently focused (e.g. autonomous agent patch or rollback), accept server content
      const isFocused = document.activeElement === textareaRef.current;
      if (!isFocused || draftRef.current === activeFile.content) {
        setDraftContent(activeFile.content);
        draftRef.current = activeFile.content;
      }
    }
  }, [activeFile]);

  // Jump to an explicit target line ONLY once per unique jump request
  useEffect(() => {
    if (!highlightLine || !activeFile) return;
    const jumpKey = `${activeFile.path}:${highlightLine}:${viewMode}`;
    if (jumpKey === lastJumpKeyRef.current) return;
    lastJumpKeyRef.current = jumpKey;

    if (viewMode === 'annotated' && lineRefs.current[highlightLine]) {
      lineRefs.current[highlightLine]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else if (viewMode === 'edit' && textareaRef.current) {
      const lines = draftRef.current.split('\n');
      let charOffset = 0;
      for (let i = 0; i < Math.min(highlightLine - 1, lines.length); i++) {
        charOffset += lines[i].length + 1;
      }
      const ta = textareaRef.current;
      ta.focus();
      ta.setSelectionRange(charOffset, charOffset);
      const lineHeight = 21;
      ta.scrollTop = Math.max(0, (highlightLine - 6) * lineHeight);
      if (gutterRef.current) gutterRef.current.scrollTop = ta.scrollTop;
      setCursorPos({ line: highlightLine, col: 1 });
    }
  }, [highlightLine, activeFile?.path, viewMode]);

  const isDirty = activeFile !== null && draftContent !== activeFile.content;

  const persistDraft = async (silent = false) => {
    if (!activeFile) return;
    const snapshotToSave = draftRef.current;
    if (snapshotToSave === activeFile.content) return;
    setSaving(true);
    inFlightSaveContentRef.current = snapshotToSave;
    try {
      await onSaveFile(activeFile.path, snapshotToSave, silent);
    } catch {
      inFlightSaveContentRef.current = null;
    } finally {
      setSaving(false);
    }
  };

  // Real-time debounced Auto-Sync (saves & incrementally re-indexes 900ms after typing stops)
  useEffect(() => {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    if (!autoSync || !isDirty || !activeFile) return;

    autoSaveTimerRef.current = setTimeout(() => {
      void persistDraft(true);
    }, 900);

    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, [draftContent, autoSync, isDirty, activeFile?.path]);

  const updateCursorFromTextarea = (ta: HTMLTextAreaElement) => {
    const pos = ta.selectionStart ?? 0;
    const before = ta.value.slice(0, pos);
    const lines = before.split('\n');
    setCursorPos({
      line: lines.length,
      col: (lines[lines.length - 1]?.length ?? 0) + 1,
    });
  };

  const handleEditorKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const ta = e.currentTarget;

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      void persistDraft(false);
      return;
    }

    // Real IDE Tab key indentation (2 spaces) instead of blurring focus
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const value = ta.value;

      if (e.shiftKey) {
        const lineStart = value.lastIndexOf('\n', start - 1) + 1;
        if (value.slice(lineStart, lineStart + 2) === '  ') {
          const next = value.slice(0, lineStart) + value.slice(lineStart + 2);
          setDraftContent(next);
          requestAnimationFrame(() => {
            ta.setSelectionRange(Math.max(lineStart, start - 2), Math.max(lineStart, end - 2));
          });
        }
      } else {
        const next = `${value.slice(0, start)}  ${value.slice(end)}`;
        setDraftContent(next);
        requestAnimationFrame(() => {
          ta.setSelectionRange(start + 2, start + 2);
        });
      }
    }
  };

  const handleScrollSync = () => {
    if (textareaRef.current && gutterRef.current) {
      gutterRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  };

  const handleCopy = () => {
    const text = activeDiffChange ? activeDiffChange.diffText : draftContent || activeFile?.content || '';
    if (!text) return;
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  // Diff inspection mode
  if (activeDiffChange) {
    const diffLines = (activeDiffChange.diffText || '').split('\n');
    return (
      <div className="flex flex-col h-full bg-[#0B0E14]">
        <div className="flex items-center justify-between px-4 h-10 bg-[#10131C] border-b border-[#1E2433] shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <FileDiff className="w-4 h-4 text-[#5B7CFF] shrink-0" />
            <span className="font-mono text-[12px] text-[#E6E9F2] truncate">
              Diff: {activeDiffChange.filePath}
            </span>
            <span className="text-[#6B728A]" aria-hidden="true">·</span>
            <span className="text-[12px] text-[#A3AABF] whitespace-nowrap">
              {activeDiffChange.status}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-2.5 py-1 text-[12px] text-[#A3AABF] hover:text-[#E6E9F2] hover:bg-[#161A26] rounded-[6px] transition-colors whitespace-nowrap"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-[#2FD68B]" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied' : 'Copy Patch'}</span>
            </button>
            <button
              onClick={onCloseDiff}
              className="flex items-center gap-1 px-2.5 py-1 text-[12px] text-[#E6E9F2] bg-[#161A26] hover:bg-[#1E2433] rounded-[6px] transition-colors whitespace-nowrap"
            >
              <X className="w-3.5 h-3.5" />
              <span>Close Diff</span>
            </button>
          </div>
        </div>

        <div className="px-4 py-2.5 bg-[#10131C]/70 border-b border-[#1E2433] text-[12px] text-[#A3AABF]">
          <span className="text-[#E6E9F2] font-medium">Patch rationale:</span> {activeDiffChange.rationale}
        </div>

        <div className="flex-1 overflow-auto font-mono text-[13px] leading-[1.6] p-3">
          {diffLines.map((line, i) => {
            const isAdd = line.startsWith('+') && !line.startsWith('+++');
            const isDel = line.startsWith('-') && !line.startsWith('---');
            const isHunk = line.startsWith('@@');
            return (
              <div
                key={i}
                className={`px-3 whitespace-pre ${
                  isAdd
                    ? 'bg-[rgba(47,214,139,0.14)] text-[#2FD68B]'
                    : isDel
                      ? 'bg-[rgba(255,84,104,0.14)] text-[#FF5468]'
                      : isHunk
                        ? 'text-[#4DB8FF] bg-[#10131C] my-1 py-0.5'
                        : 'text-[#A3AABF]'
                }`}
              >
                {line || ' '}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  const lineCount = Math.max(1, draftContent.split('\n').length);

  return (
    <div className="flex flex-col h-full bg-[#0B0E14]">
      {/* Top Tabs & Controls */}
      <div className="flex items-center justify-between h-10 bg-[#10131C] border-b border-[#1E2433] shrink-0">
        <div className="flex items-center overflow-x-auto h-full">
          {openTabs.map((tabPath) => {
            const isActive = tabPath === activeFilePath;
            const fileObj = safeFiles.find((f) => f.path === tabPath);
            const name = tabPath.split('/').pop() ?? tabPath;
            const tabDirty = isActive && isDirty;
            return (
              <div
                key={tabPath}
                className={`group flex items-center gap-2 h-full px-3 border-r border-[#1E2433] cursor-pointer text-[12px] transition-colors whitespace-nowrap shrink-0 ${
                  isActive
                    ? 'bg-[#0B0E14] text-[#E6E9F2] border-b-2 border-b-[#5B7CFF]'
                    : 'text-[#A3AABF] hover:text-[#E6E9F2] hover:bg-[#161A26]/60'
                }`}
                onClick={() => onSelectTab(tabPath)}
              >
                <span className="font-mono">{name}</span>
                {tabDirty ? (
                  <span className="font-mono text-[10px] text-[#F5B642]" title="Unsaved edits">
                    ●
                  </span>
                ) : fileObj?.gitStatus === 'modified' ? (
                  <span className="font-mono text-[11px] text-[#F5B642]" title="Modified">
                    M
                  </span>
                ) : null}
                <button
                  type="button"
                  aria-label={`Close ${name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onCloseTab(tabPath);
                  }}
                  className="p-0.5 rounded hover:bg-[#262E42] text-[#6B728A] hover:text-[#E6E9F2]"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            );
          })}
        </div>

        {activeFile && (
          <div className="flex items-center gap-2 px-3 shrink-0">
            {/* Mode Switch */}
            <div className="flex items-center bg-[#090B10] border border-[#1E2433] rounded-[6px] p-0.5">
              <button
                type="button"
                onClick={() => setViewMode('edit')}
                className={`flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-[4px] transition-colors whitespace-nowrap ${
                  viewMode === 'edit' ? 'bg-[#161A26] text-[#E6E9F2]' : 'text-[#A3AABF] hover:text-[#E6E9F2]'
                }`}
              >
                <Code2 className="w-3 h-3" />
                <span>Edit</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('annotated')}
                className={`flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-[4px] transition-colors whitespace-nowrap ${
                  viewMode === 'annotated' ? 'bg-[#161A26] text-[#E6E9F2]' : 'text-[#A3AABF] hover:text-[#E6E9F2]'
                }`}
              >
                <Eye className="w-3 h-3" />
                <span>Inspect{fileFindings.length > 0 ? ` (${fileFindings.length})` : ''}</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => setAutoSync((v) => !v)}
              className={`px-2 py-1 text-[11px] font-mono rounded-[5px] border transition-colors whitespace-nowrap ${
                autoSync
                  ? 'border-[#2FD68B]/40 text-[#2FD68B] bg-[#2FD68B]/10'
                  : 'border-[#262E42] text-[#6B728A] hover:text-[#E6E9F2]'
              }`}
              title="Automatically save & re-index file changes in real time"
            >
              Auto-Sync: {autoSync ? 'ON' : 'OFF'}
            </button>

            {isDirty && (
              <>
                <button
                  type="button"
                  onClick={() => setDraftContent(activeFile.content)}
                  title="Revert unsaved edits"
                  className="p-1.5 text-[#A3AABF] hover:text-[#E6E9F2] hover:bg-[#161A26] rounded-[5px]"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => void persistDraft(false)}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-2.5 py-1 text-[12px] font-semibold bg-[#5B7CFF] hover:bg-[#7C96FF] text-[#090B10] rounded-[6px] transition-colors whitespace-nowrap"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{saving ? 'Syncing...' : 'Save'}</span>
                </button>
              </>
            )}

            <button
              type="button"
              onClick={handleCopy}
              title="Copy file contents"
              className="p-1.5 text-[#A3AABF] hover:text-[#E6E9F2] hover:bg-[#161A26] rounded-[5px]"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-[#2FD68B]" /> : <Copy className="w-3.5 h-3.5" />}
            </button>

            {confirmDelete ? (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={async () => {
                    setConfirmDelete(false);
                    await onDeleteFile(activeFile.path);
                  }}
                  className="px-2 py-1 text-[11px] font-semibold bg-[#FF5468] text-[#090B10] rounded-[5px] whitespace-nowrap"
                >
                  Confirm Delete
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="px-1.5 py-1 text-[11px] text-[#A3AABF] hover:text-[#E6E9F2]"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                title="Delete file from workspace"
                aria-label="Delete file"
                className="p-1.5 text-[#6B728A] hover:text-[#FF5468] hover:bg-[#161A26] rounded-[5px]"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* File Metadata & Symbol Jump Bar */}
      {activeFile && (
        <div className="flex items-center justify-between gap-4 px-4 py-1.5 bg-[#10131C]/50 border-b border-[#1E2433] text-[12px] shrink-0 overflow-x-auto">
          <div className="flex items-center gap-2 text-[#A3AABF] font-mono whitespace-nowrap tabular-nums">
            <span className="text-[#E6E9F2]">{activeFile.path}</span>
            <span className="text-[#6B728A]" aria-hidden="true">·</span>
            <span>Ln {cursorPos.line}, Col {cursorPos.col}</span>
            <span className="text-[#6B728A]" aria-hidden="true">·</span>
            <span className={saving ? 'text-[#5B7CFF]' : isDirty ? 'text-[#F5B642]' : 'text-[#2FD68B]'}>
              {saving ? 'Syncing...' : isDirty ? 'Modified' : 'Synced'}
            </span>
          </div>

          {fileSymbols.length > 0 && (
            <div className="flex items-center gap-2.5 shrink-0">
              <span className="text-[#6B728A] whitespace-nowrap">Symbols:</span>
              {fileSymbols.slice(0, 6).map((sym) => (
                <button
                  key={sym.id}
                  type="button"
                  onClick={() => onJumpToLine(activeFile.path, sym.startLine)}
                  className="font-mono text-[11px] text-[#A3AABF] hover:text-[#7C96FF] transition-colors whitespace-nowrap"
                >
                  {sym.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Security Findings Compact Banner in Edit Mode */}
      {activeFile && viewMode === 'edit' && fileFindings.length > 0 && (
        <div className="flex items-center justify-between gap-3 px-4 py-1.5 bg-[#FF5468]/10 border-b border-[#FF5468]/25 text-[12px] shrink-0">
          <div className="flex items-center gap-2 text-[#FF5468] truncate">
            <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">
              {fileFindings.length} security finding(s) in this file: {fileFindings[0].title} (line {fileFindings[0].line})
            </span>
          </div>
          <button
            type="button"
            onClick={() => setViewMode('annotated')}
            className="text-[11px] font-medium text-[#E6E9F2] hover:underline whitespace-nowrap shrink-0"
          >
            View Inline
          </button>
        </div>
      )}

      {/* Editor Surface */}
      {!activeFile ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-[#6B728A]">
          <Code2 className="w-8 h-8 mb-3 text-[#2B3347]" />
          <p className="text-[14px] text-[#A3AABF] font-medium">No file open</p>
          <p className="text-[12px] mt-1 max-w-sm">
            Click any file in the left explorer or press <span className="font-mono text-[#E6E9F2]">Ctrl+K</span> to open and start coding immediately.
          </p>
        </div>
      ) : viewMode === 'edit' ? (
        <div className="flex-1 flex min-h-0 overflow-hidden bg-[#0B0E14]">
          {/* Synchronized Line-Number Gutter */}
          <div
            ref={gutterRef}
            aria-hidden="true"
            className="w-12 py-3 pr-3 bg-[#0D1017] border-r border-[#1E2433] text-right font-mono text-[13px] leading-[21px] text-[#555E77] select-none overflow-hidden shrink-0 tabular-nums"
          >
            {Array.from({ length: lineCount }, (_, idx) => {
              const ln = idx + 1;
              const hasIssue = fileFindings.some((f) => f.line === ln);
              return (
                <div
                  key={ln}
                  className={
                    hasIssue
                      ? 'text-[#FF5468] font-semibold'
                      : cursorPos.line === ln
                        ? 'text-[#E6E9F2]'
                        : ''
                  }
                >
                  {ln}
                </div>
              );
            })}
          </div>

          {/* Direct Live Editable Code Textarea */}
          <textarea
            ref={textareaRef}
            value={draftContent}
            onChange={(e) => {
              setDraftContent(e.target.value);
              updateCursorFromTextarea(e.target);
            }}
            onClick={(e) => updateCursorFromTextarea(e.currentTarget)}
            onKeyUp={(e) => updateCursorFromTextarea(e.currentTarget)}
            onKeyDown={handleEditorKeyDown}
            onScroll={handleScrollSync}
            spellCheck={false}
            autoCapitalize="off"
            autoComplete="off"
            autoCorrect="off"
            aria-label={`Code editor for ${activeFile.path}`}
            className="flex-1 w-full h-full bg-[#0B0E14] text-[#E6E9F2] caret-[#5B7CFF] font-mono text-[13px] leading-[21px] py-3 px-4 resize-none focus:outline-none whitespace-pre overflow-auto"
          />
        </div>
      ) : (
        /* Syntax-Highlighted & Security-Annotated Inspection Mode */
        <div className="flex-1 overflow-auto font-mono text-[13px] leading-[1.6] py-3">
          {draftContent.split('\n').map((line, idx) => {
            const lineNum = idx + 1;
            const finding = fileFindings.find((f) => f.line === lineNum);
            const isHighlighted = highlightLine === lineNum;
            return (
              <div
                key={lineNum}
                ref={(el) => {
                  lineRefs.current[lineNum] = el;
                }}
                onDoubleClick={() => {
                  setViewMode('edit');
                  onJumpToLine(activeFile.path, lineNum);
                }}
                className={`group flex items-start px-3 hover:bg-[#10131C]/70 cursor-text ${
                  isHighlighted ? 'line-flash bg-[#5B7CFF]/15' : ''
                } ${finding ? 'bg-[#FF3B4E]/10' : ''}`}
              >
                <span className="w-10 pr-4 text-right select-none text-[#555E77] tabular-nums shrink-0">
                  {lineNum}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="whitespace-pre text-[#E6E9F2]">
                    {highlightCodeLine(line, activeFile.language)}
                  </div>
                  {finding && (
                    <div className="my-1 px-2.5 py-1.5 rounded-[6px] bg-[#161A26] border border-[#FF5468]/40 font-sans text-[12px] text-[#E6E9F2]">
                      <span className="font-semibold text-[#FF5468] uppercase text-[11px] mr-2">
                        {finding.severity} · {finding.cwe}
                      </span>
                      <span>{finding.title}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
