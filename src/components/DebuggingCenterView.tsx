import React, { useState } from 'react';
import { Bug, Play, Terminal, Wand2 } from 'lucide-react';
import type { DebugAnalysis, Project, TestRun } from '../types/devmind';

interface DebuggingCenterViewProps {
  project: Project;
  analyses: DebugAnalysis[];
  latestTestRun: TestRun | null;
  analyzing: boolean;
  onRunAnalysis: (errorLog: string) => Promise<void>;
  onRunSandboxTests: () => Promise<TestRun | null>;
  onOpenFileAtLine: (filePath: string, line?: number) => void;
  onDispatchToAgent: (prompt: string) => void;
}

export const DebuggingCenterView: React.FC<DebuggingCenterViewProps> = ({
  project,
  analyses,
  latestTestRun,
  analyzing,
  onRunAnalysis,
  onRunSandboxTests,
  onOpenFileAtLine,
  onDispatchToAgent,
}) => {
  const [errorLog, setErrorLog] = useState(
    `AssertionError [ERR_ASSERTION]: Expected authenticateRequest to accept lowercase "bearer <token>" header
    at TestContext.<anonymous> (tests/auth.test.ts:53:10)
    actual: 401 ("Invalid authorization scheme")
    expected: 200 (authenticated user usr_204)`
  );
  const [capturing, setCapturing] = useState(false);

  const handleCaptureLiveError = async () => {
    setCapturing(true);
    try {
      const run = latestTestRun && latestTestRun.failedCount > 0 ? latestTestRun : await onRunSandboxTests();
      if (!run) return;
      const failedCases = run.cases.filter((c) => c.status === 'fail');
      if (failedCases.length === 0) {
        setErrorLog(`All ${run.totalCount} tests in ${project.name} currently pass (${run.sandboxId}).`);
      } else {
        setErrorLog(
          failedCases
            .map((c) => `FAIL: ${c.name}\n  ${c.errorMessage ?? 'Assertion failed'}`)
            .join('\n\n')
        );
      }
    } finally {
      setCapturing(false);
    }
  };

  return (
    <div className="h-full overflow-auto bg-[#0D0F14] p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#262B3A] pb-4">
        <div>
          <h1 className="text-[20px] font-semibold text-[#E6E9F2] tracking-tight">
            Intelligent Debugging Center
          </h1>
          <p className="text-[13px] text-[#A3AABF] mt-1">
            Paste a stack trace or capture failing sandbox output to isolate root causes grounded in {project.name}.
          </p>
        </div>

        <button
          onClick={() => void handleCaptureLiveError()}
          disabled={capturing}
          className="flex items-center gap-2 px-3.5 py-2 text-[13px] font-medium bg-[#1C2030] hover:bg-[#262B3A] text-[#E6E9F2] border border-[#353B50] rounded-[6px] transition-colors duration-120 whitespace-nowrap"
        >
          <Terminal className="w-3.5 h-3.5 text-[#F5B84B]" />
          <span>{capturing ? 'Running Sandbox...' : 'Capture Live Failing Test'}</span>
        </button>
      </div>

      {/* Input Panel */}
      <section className="bg-[#151821] border border-[#262B3A] rounded-[10px] p-4 space-y-3">
        <label htmlFor="debug-stacktrace" className="block text-[13px] font-medium text-[#E6E9F2]">
          Error Log or Stack Trace
        </label>
        <textarea
          id="debug-stacktrace"
          rows={6}
          value={errorLog}
          onChange={(e) => setErrorLog(e.target.value)}
          placeholder="Paste stderr, stack trace, or failing test output..."
          className="w-full bg-[#0F1117] border border-[#262B3A] focus:border-[#6C7BFF] rounded-[6px] p-3 font-mono text-[12px] text-[#E6E9F2] placeholder-[#6B728A] leading-relaxed outline-none"
        />
        <div className="flex items-center justify-between">
          <span className="text-[12px] text-[#6B728A]">
            Analyzes against indexed AST symbols and dependency graph before proposing a verified patch.
          </span>
          <button
            onClick={() => void onRunAnalysis(errorLog)}
            disabled={analyzing || !errorLog.trim()}
            className="flex items-center gap-1.5 px-4 py-2 text-[13px] font-semibold bg-[#6C7BFF] hover:bg-[#8793FF] disabled:opacity-50 text-[#0D0F14] rounded-[6px] transition-colors duration-120 whitespace-nowrap"
          >
            <Bug className="w-4 h-4" />
            <span>{analyzing ? 'Analyzing Root Cause...' : 'Analyze Root Cause'}</span>
          </button>
        </div>
      </section>

      {/* Root-Cause Analyses */}
      <div className="space-y-4">
        {analyses.length === 0 ? (
          <div className="bg-[#151821] border border-[#262B3A] rounded-[10px] p-8 text-center text-[#6B728A] text-[13px]">
            No debug analyses recorded for this project yet. Click <span className="text-[#E6E9F2]">Analyze Root Cause</span> above to diagnose the active error.
          </div>
        ) : (
          analyses.map((item) => (
            <article
              key={item.id}
              className="bg-[#151821] border border-[#262B3A] rounded-[10px] p-5 space-y-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-[12px] text-[#A3AABF] font-mono">
                    Confidence: <span className="text-[#3DD68C] uppercase">{item.confidence}</span> · {item.modelUsed} ·{' '}
                    <span className="tabular-nums">{item.tokensUsed.toLocaleString()} tokens</span>
                  </div>
                  <h2 className="text-[16px] font-semibold text-[#E6E9F2] mt-1">
                    {item.rootCause}
                  </h2>
                </div>

                <button
                  onClick={() => onDispatchToAgent(item.proposedPatchPrompt)}
                  className="flex items-center gap-1.5 px-3.5 py-2 text-[12px] font-semibold bg-[#6C7BFF] hover:bg-[#8793FF] text-[#0D0F14] rounded-[6px] transition-colors duration-120 whitespace-nowrap"
                >
                  <Wand2 className="w-3.5 h-3.5" />
                  <span>Fix & Verify with Agent</span>
                </button>
              </div>

              <p className="text-[13px] text-[#E6E9F2] leading-relaxed whitespace-pre-wrap">
                {item.explanation}
              </p>

              {item.affectedFiles.length > 0 && (
                <div className="pt-3 border-t border-[#262B3A] space-y-2">
                  <div className="text-[12px] font-medium text-[#A3AABF]">Implicated Source Locations</div>
                  <div className="flex flex-wrap gap-3">
                    {item.affectedFiles.map((loc, idx) => (
                      <button
                        key={`${loc.filePath}:${loc.startLine}:${idx}`}
                        onClick={() => onOpenFileAtLine(loc.filePath, loc.startLine)}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-[6px] bg-[#0F1117] hover:bg-[#1C2030] border border-[#262B3A] font-mono text-[12px] text-[#8793FF] transition-colors duration-120"
                      >
                        <Play className="w-3 h-3" />
                        <span>
                          {loc.filePath}:{loc.startLine} ({loc.symbolName})
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </article>
          ))
        )}
      </div>
    </div>
  );
};
