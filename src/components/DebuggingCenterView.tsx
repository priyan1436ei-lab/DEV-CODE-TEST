import React, { useState } from 'react';
import {
  AlertTriangle,
  Bug,
  FileCode2,
  Loader2,
  Search,
  Wrench,
} from 'lucide-react';
import type {
  CodeCitation,
  DebugAnalysis,
  ExtensionDiagnostic,
  SecurityFinding,
} from '../types/devmind';

interface DebuggingCenterViewProps {
  analyses: DebugAnalysis[];
  diagnostics: ExtensionDiagnostic[];
  securityFindings: SecurityFinding[];
  onAnalyzeError: (errorLog: string) => Promise<void>;
  onFixWithAgent: (prompt: string) => Promise<void>;
  onOpenCitation: (citation: CodeCitation) => void;
}

const SAMPLE_STACK_TRACE = `TypeError: Cannot read properties of null (reading 'role')
    at verifySessionToken (src/services/authService.ts:44:21)
    at requireAuthenticatedUser (src/routes/sessionRoute.ts:18:16)
    at Layer.handle [as handle_request] (node_modules/express/lib/router/layer.js:95:5)`;

export const DebuggingCenterView: React.FC<DebuggingCenterViewProps> = ({
  analyses,
  diagnostics,
  securityFindings,
  onAnalyzeError,
  onFixWithAgent,
  onOpenCitation,
}) => {
  const [errorLog, setErrorLog] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [dispatchingId, setDispatchingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const openFindings = securityFindings.filter((f) => f.status === 'open');

  const handleLoadActiveProblems = () => {
    const lines: string[] = [];
    for (const f of openFindings.slice(0, 4)) {
      lines.push(`[Security ${f.cwe}] ${f.title} at ${f.filePath}:${f.line} — ${f.description}`);
    }
    for (const d of diagnostics.slice(0, 4)) {
      lines.push(`[${d.source} ${d.code}] ${d.message} at ${d.filePath}:${d.line}`);
    }
    if (lines.length === 0) {
      setErrorLog(SAMPLE_STACK_TRACE);
    } else {
      setErrorLog(lines.join('\n'));
    }
  };

  const handleAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!errorLog.trim() || analyzing) return;
    setErrorMessage(null);
    setAnalyzing(true);
    try {
      await onAnalyzeError(errorLog.trim());
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Diagnostics analysis failed.');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleDispatchFix = async (analysis: DebugAnalysis) => {
    setDispatchingId(analysis.id);
    setErrorMessage(null);
    try {
      await onFixWithAgent(analysis.proposedPatchPrompt);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to create patch task.');
    } finally {
      setDispatchingId(null);
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-[var(--surface-canvas)] p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--border-hairline)] pb-4">
        <div>
          <h1 className="text-lg font-semibold text-[var(--ink-primary)] tracking-tight">
            Diagnostics & Root Cause Analyzer
          </h1>
          <p className="text-xs text-[var(--ink-secondary)] mt-0.5">
            Correlate runtime stack traces, compiler logs, and workspace diagnostics against indexed AST symbols.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleLoadActiveProblems}
            className="h-8 px-3 text-xs font-medium rounded-[4px] border border-[var(--border-strong)] bg-[var(--surface-elevated)] text-[var(--ink-primary)] hover:bg-[var(--surface-hover)] inline-flex items-center gap-1.5"
          >
            <AlertTriangle className="w-3.5 h-3.5 text-[var(--status-warning)]" />
            Import Active Problems ({openFindings.length + diagnostics.length})
          </button>

          <button
            type="button"
            onClick={() => setErrorLog(SAMPLE_STACK_TRACE)}
            className="h-8 px-3 text-xs font-medium rounded-[4px] border border-[var(--border-hairline)] bg-[var(--surface-elevated)] text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:bg-[var(--surface-hover)]"
          >
            Load Sample Trace
          </button>
        </div>
      </div>

      {/* Input Form */}
      <form
        onSubmit={handleAnalyze}
        className="border border-[var(--border-hairline)] rounded-[4px] bg-[var(--surface-elevated)] p-4 space-y-3"
      >
        <div className="flex items-center justify-between">
          <label htmlFor="debug-trace-input" className="text-xs font-semibold text-[var(--ink-primary)]">
            Runtime Exception / Diagnostic Log
          </label>
          <span className="text-[11px] font-mono text-[var(--ink-muted)]">
            Secret redaction runs before provider dispatch
          </span>
        </div>

        <textarea
          id="debug-trace-input"
          value={errorLog}
          onChange={(e) => setErrorLog(e.target.value)}
          rows={6}
          placeholder="Paste a Node.js/TypeScript stack trace, HTTP 500 error log, or diagnostic output..."
          className="w-full p-3 text-xs font-mono rounded-[4px] bg-[var(--surface-canvas)] border border-[var(--border-hairline)] text-[var(--ink-primary)] placeholder:text-[var(--ink-muted)] focus:outline-none focus:border-[var(--accent-primary)] resize-y"
        />

        {errorMessage && (
          <div className="text-xs text-[var(--status-danger)]">{errorMessage}</div>
        )}

        <div className="flex items-center justify-end">
          <button
            type="submit"
            disabled={analyzing || !errorLog.trim()}
            className="h-8 px-4 text-xs font-medium rounded-[4px] bg-[var(--accent-primary)] text-[var(--accent-ink)] hover:bg-[var(--accent-hover)] disabled:opacity-40 inline-flex items-center gap-1.5"
          >
            {analyzing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
            Analyze Root Cause
          </button>
        </div>
      </form>

      {/* Recorded Analyses */}
      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--ink-muted)]">
          Analysis History ({analyses.length})
        </h2>

        {analyses.length === 0 ? (
          <div className="p-8 text-center border border-dashed border-[var(--border-hairline)] rounded-[4px] text-xs text-[var(--ink-muted)]">
            No diagnostic analyses recorded for this repository yet.
          </div>
        ) : (
          <div className="space-y-3">
            {analyses.map((analysis) => (
              <div
                key={analysis.id}
                className="border border-[var(--border-hairline)] rounded-[4px] bg-[var(--surface-elevated)] overflow-hidden"
              >
                <div className="px-4 py-3 border-b border-[var(--border-hairline)] flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Bug className="w-4 h-4 text-[var(--status-danger)] shrink-0" />
                      <h3 className="text-sm font-semibold text-[var(--ink-primary)]">
                        {analysis.rootCause}
                      </h3>
                    </div>
                    <div className="mt-1 text-[11px] font-mono text-[var(--ink-muted)]">
                      Confidence: {analysis.confidence.toUpperCase()} · Model: {analysis.modelUsed} ·{' '}
                      {new Date(analysis.createdAt).toLocaleString()}
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={dispatchingId !== null}
                    onClick={() => handleDispatchFix(analysis)}
                    className="h-8 px-3 text-xs font-medium rounded-[4px] bg-[var(--accent-primary)] text-[var(--accent-ink)] hover:bg-[var(--accent-hover)] disabled:opacity-40 inline-flex items-center gap-1.5 shrink-0"
                  >
                    {dispatchingId === analysis.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Wrench className="w-3.5 h-3.5" />
                    )}
                    Dispatch Patch Task
                  </button>
                </div>

                <div className="p-4 space-y-3">
                  <p className="text-xs text-[var(--ink-secondary)] leading-relaxed whitespace-pre-wrap">
                    {analysis.explanation}
                  </p>

                  {analysis.affectedFiles.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[11px] text-[var(--ink-muted)]">Affected Symbols:</span>
                      {analysis.affectedFiles.map((cit, i) => (
                        <button
                          key={`${cit.filePath}:${cit.startLine}:${i}`}
                          type="button"
                          onClick={() => onOpenCitation(cit)}
                          className="px-2 py-1 text-[11px] font-mono rounded-[3px] border border-[var(--border-hairline)] bg-[var(--surface-canvas)] text-[var(--accent-primary)] hover:border-[var(--accent-primary)] inline-flex items-center gap-1"
                        >
                          <FileCode2 className="w-3 h-3" />
                          {cit.filePath}:{cit.startLine}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
