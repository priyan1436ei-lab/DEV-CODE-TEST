import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Code2, Copy, FileDiff, Save, X } from 'lucide-react';
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
  onSaveFile: (path: string, content: string) => Promise<void>;
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
        <span key={key++} className="text-[#3DD68C]">
          {token}
        </span>
      );
    } else if (/^\d/.test(token)) {
      parts.push(
        <span key={key++} className="text-[#F5B84B]">
          {token}
        </span>
      );
    } else {
      parts.push(
        <span key={key++} className="text-[#8793FF]">
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
  onJumpToLine,
}) => {
  const activeFile = useMemo(
    () => project.files.find((f) => f.path === activeFilePath) ?? null,
    [project.files, activeFilePath]
  );

  const fileSymbols: CodeSymbol[] = useMemo(
    () => (activeFile ? project.symbols.filter((s) => s.filePath === activeFile.path) : []),
    [project.symbols, activeFile]
  );

  const fileFindings = useMemo(
    () => (activeFile ? securityFindings.filter((f) => f.filePath === activeFile.path) : []),
    [securityFindings, activeFile]
  );

  const [isEditMode, setIsEditMode] = useState(false);
  const [draftContent, setDraftContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const lineRefs = useRef<Record<number, HTMLDivElement | null>>({});

  useEffect(() => {
    setDraftContent(activeFile?.content ?? '');
    setIsEditMode(false);
  }, [activeFile?.path, activeFile?.contentHash]);

  useEffect(() => {
    if (highlightLine && lineRefs.current[highlightLine]) {
      lineRefs.current[highlightLine]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [highlightLine, activeFilePath]);

  const isDirty = activeFile !== null && isEditMode && draftContent !== activeFile.content;

  const handleSave = async () => {
    if (!activeFile || !isDirty) return;
    setSaving(true);
    try {
      await onSaveFile(activeFile.path, draftContent);
      setIsEditMode(false);
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        if (isDirty) {
          e.preventDefault();
          void handleSave();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isDirty, draftContent, activeFile]);

  const handleCopy = () => {
    const text = activeDiffChange ? activeDiffChange.diffText : activeFile?.content ?? '';
    if (!text) return;
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  // Diff inspection mode (triggered when clicking any proposed/applied patch file)
  if (activeDiffChange) {
    const diffLines = activeDiffChange.diffText.split('\n');
    return (
      <div className="flex flex-col h-full bg-[#0F1117]">
        <div className="flex items-center justify-between px-4 h-10 bg-[#151821] border-b border-[#262B3A] shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <FileDiff className="w-4 h-4 text-[#6C7BFF] shrink-0" />
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
              className="flex items-center gap-1.5 px-2.5 py-1 text-[12px] text-[#A3AABF] hover:text-[#E6E9F2] hover:bg-[#1C2030] rounded-[6px] transition-colors duration-120 whitespace-nowrap"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-[#3DD68C]" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied' : 'Copy Patch'}</span>
            </button>
            <button
              onClick={onCloseDiff}
              className="flex items-center gap-1 px-2.5 py-1 text-[12px] text-[#E6E9F2] bg-[#1C2030] hover:bg-[#262B3A] rounded-[6px] transition-colors duration-120 whitespace-nowrap"
            >
              <X className="w-3.5 h-3.5" />
              <span>Close Diff</span>
            </button>
          </div>
        </div>

        <div className="px-4 py-2.5 bg-[#151821]/70 border-b border-[#262B3A] text-[12px] text-[#A3AABF]">
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
                    ? 'bg-[rgba(61,214,140,0.14)] text-[#3DD68C]'
                    : isDel
                      ? 'bg-[rgba(255,92,108,0.14)] text-[#FF5C6C]'
                      : isHunk
                        ? 'text-[#4DB8FF] bg-[#151821] my-1 py-0.5'
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

  return (
    <div className="flex flex-col h-full bg-[#0F1117]">
      {/* Open File Tabs */}
      <div className="flex items-center justify-between h-10 bg-[#151821] border-b border-[#262B3A] shrink-0">
        <div className="flex items-center overflow-x-auto h-full">
          {openTabs.map((tabPath) => {
            const isActive = tabPath === activeFilePath;
            const fileObj = project.files.find((f) => f.path === tabPath);
            const name = tabPath.split('/').pop() ?? tabPath;
            return (
              <div
                key={tabPath}
                className={`group flex items-center gap-2 h-full px-3 border-r border-[#262B3A] cursor-pointer text-[12px] transition-colors duration-120 whitespace-nowrap shrink-0 ${
                  isActive
                    ? 'bg-[#0F1117] text-[#E6E9F2] border-b-2 border-b-[#6C7BFF]'
                    : 'text-[#A3AABF] hover:text-[#E6E9F2] hover:bg-[#1C2030]/60'
                }`}
                onClick={() => onSelectTab(tabPath)}
              >
                <span className="font-mono">{name}</span>
                {fileObj?.gitStatus === 'modified' && (
                  <span className="font-mono text-[11px] text-[#F5B84B]" title="Modified">
                    M
                  </span>
                )}
                <button
                  type="button"
                  aria-label={`Close ${name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onCloseTab(tabPath);
                  }}
                  className="p-0.5 rounded hover:bg-[#262B3A] text-[#6B728A] hover:text-[#E6E9F2]"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            );
          })}
        </div>

        {activeFile && (
          <div className="flex items-center gap-2 px-3 shrink-0">
            <button
              onClick={() => setIsEditMode((v) => !v)}
              className={`flex items-center gap-1.5 px-2.5 py-1 text-[12px] rounded-[6px] transition-colors duration-120 whitespace-nowrap ${
                isEditMode
                  ? 'bg-[#6C7BFF]/20 text-[#E6E9F2] border border-[#6C7BFF]/40'
                  : 'text-[#A3AABF] hover:text-[#E6E9F2] hover:bg-[#1C2030]'
              }`}
            >
              <Code2 className="w-3.5 h-3.5" />
              <span>{isEditMode ? 'Editing' : 'Edit'}</span>
            </button>

            {isDirty && (
              <button
                onClick={() => void handleSave()}
                disabled={saving}
                className="flex items-center gap-1.5 px-2.5 py-1 text-[12px] font-medium bg-[#6C7BFF] hover:bg-[#8793FF] text-[#0D0F14] rounded-[6px] transition-colors duration-120 whitespace-nowrap"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{saving ? 'Saving...' : 'Save & Re-index'}</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Breadcrumb & Symbol Strip */}
      {activeFile && (
        <div className="flex items-center justify-between gap-4 px-4 py-1.5 bg-[#151821]/50 border-b border-[#262B3A] text-[12px] shrink-0 overflow-x-auto">
          <div className="flex items-center gap-2 text-[#A3AABF] font-mono whitespace-nowrap">
            <span>{activeFile.path}</span>
            <span className="text-[#6B728A]" aria-hidden="true">·</span>
            <span className="tabular-nums text-[#6B728A]">{activeFile.lineCount} lines</span>
            <span className="text-[#6B728A]" aria-hidden="true">·</span>
            <span className="text-[#6B728A]">sha256:{activeFile.contentHash.slice(0, 8)}</span>
          </div>

          {fileSymbols.length > 0 && (
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[#6B728A] whitespace-nowrap">Symbols:</span>
              {fileSymbols.slice(0, 5).map((sym) => (
                <button
                  key={sym.id}
                  onClick={() => onJumpToLine(activeFile.path, sym.startLine)}
                  className="font-mono text-[11px] text-[#A3AABF] hover:text-[#8793FF] transition-colors duration-120 whitespace-nowrap"
                >
                  {sym.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Editor Body */}
      {!activeFile ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-[#6B728A]">
          <Code2 className="w-8 h-8 mb-3 text-[#353B50]" />
          <p className="text-[14px] text-[#A3AABF] font-medium">No file open</p>
          <p className="text-[12px] mt-1 max-w-sm">
            Select a file from the left explorer or press <span className="font-mono text-[#E6E9F2]">Ctrl+K</span> to jump to any symbol.
          </p>
        </div>
      ) : isEditMode ? (
        <div className="flex-1 flex flex-col min-h-0">
          <textarea
            value={draftContent}
            onChange={(e) => setDraftContent(e.target.value)}
            spellCheck={false}
            aria-label={`Edit ${activeFile.path}`}
            className="flex-1 w-full bg-[#0F1117] text-[#E6E9F2] font-mono text-[13px] leading-[1.6] p-4 resize-none focus:outline-none"
          />
          <div className="flex items-center justify-between px-4 py-2 bg-[#151821] border-t border-[#262B3A] text-[12px] text-[#A3AABF]">
            <span>Press Ctrl+S to save and run incremental content-hash re-indexing.</span>
            <button
              onClick={() => {
                setDraftContent(activeFile.content);
                setIsEditMode(false);
              }}
              className="text-[#A3AABF] hover:text-[#E6E9F2]"
            >
              Cancel edits
            </button>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-auto font-mono text-[13px] leading-[1.6] py-3">
          {activeFile.content.split('\n').map((line, idx) => {
            const lineNum = idx + 1;
            const finding = fileFindings.find((f) => f.line === lineNum);
            const isHighlighted = highlightLine === lineNum;
            return (
              <div
                key={lineNum}
                ref={(el) => {
                  lineRefs.current[lineNum] = el;
                }}
                className={`group flex items-start px-3 hover:bg-[#151821]/70 ${
                  isHighlighted ? 'line-flash bg-[#6C7BFF]/15' : ''
                } ${finding ? 'bg-[#FF3B4E]/10' : ''}`}
              >
                <span className="w-10 pr-4 text-right select-none text-[#6B728A] tabular-nums shrink-0">
                  {lineNum}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="whitespace-pre text-[#E6E9F2]">
                    {highlightCodeLine(line, activeFile.language)}
                  </div>
                  {finding && (
                    <div className="my-1 px-2.5 py-1.5 rounded-[6px] bg-[#1C2030] border border-[#FF5C6C]/40 font-sans text-[12px] text-[#E6E9F2]">
                      <span className="font-semibold text-[#FF5C6C] uppercase text-[11px] mr-2">
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
