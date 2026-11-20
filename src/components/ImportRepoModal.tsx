import React, { useRef, useState } from 'react';
import { FolderOpen, Upload, X } from 'lucide-react';

interface ImportRepoModalProps {
  open: boolean;
  onClose: () => void;
  onCreateProject: (input: {
    name: string;
    description: string;
    files: Array<{ path: string; content: string }>;
  }) => Promise<void>;
}

const ALLOWED_EXT = /\.(ts|tsx|js|jsx|mjs|py|go|rs|java|sql|json|yaml|yml|md|css|html)$/i;

export const ImportRepoModal: React.FC<ImportRepoModalProps> = ({
  open,
  onClose,
  onCreateProject,
}) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [stagedFiles, setStagedFiles] = useState<Array<{ path: string; content: string }>>([]);
  const [manualFilePath, setManualFilePath] = useState('src/service.ts');
  const [manualFileContent, setManualFileContent] = useState(
    `export function parseDiscount(rate: number, amount: number): number {\n  if (rate < 0 || rate > 1) throw new Error('Invalid rate');\n  return Number((amount * (1 - rate)).toFixed(2));\n}\n`
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);

  if (!open) return null;

  const handleFolderSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    setError(null);

    const loaded: Array<{ path: string; content: string }> = [];
    let inferredRoot = '';

    for (const file of Array.from(fileList)) {
      const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
      if (/(?:^|\/)(node_modules|\.git|dist|build|venv|target)\//.test(rel)) continue;
      if (!ALLOWED_EXT.test(rel)) continue;
      if (file.size > 200_000) continue;

      const parts = rel.split('/');
      if (!inferredRoot && parts.length > 1) inferredRoot = parts[0];
      const cleanPath = parts.length > 1 ? parts.slice(1).join('/') : rel;
      const content = await file.text();
      loaded.push({ path: cleanPath, content });
      if (loaded.length >= 40) break;
    }

    if (loaded.length === 0) {
      setError('No supported source files found in the selected folder.');
      return;
    }

    if (!name && inferredRoot) setName(inferredRoot);
    setStagedFiles(loaded);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const files =
      stagedFiles.length > 0
        ? stagedFiles
        : manualFilePath.trim() && manualFileContent.trim()
          ? [{ path: manualFilePath.trim(), content: manualFileContent }]
          : [];

    if (!name.trim()) {
      setError('Please enter a project name.');
      return;
    }
    if (files.length === 0) {
      setError('Select a local folder or provide at least one source file.');
      return;
    }

    setSubmitting(true);
    try {
      await onCreateProject({
        name: name.trim(),
        description: description.trim() || 'Local repository indexed in DevMind AI.',
        files,
      });
      setName('');
      setDescription('');
      setStagedFiles([]);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/65 flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Import Local Repository"
    >
      <div
        className="modal-animate-in w-full max-w-lg bg-[#151821] border border-[#353B50] rounded-[14px] overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#262B3A]">
          <h2 className="text-[15px] font-semibold text-[#E6E9F2]">
            Open Local Repository or Create Workspace Project
          </h2>
          <button
            onClick={onClose}
            aria-label="Close modal"
            className="p-1 text-[#6B728A] hover:text-[#E6E9F2] rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label htmlFor="repo-name" className="block text-[12px] text-[#A3AABF]">
                Project Name
              </label>
              <input
                id="repo-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. payments-api"
                className="w-full bg-[#0F1117] border border-[#262B3A] focus:border-[#6C7BFF] rounded-[6px] px-3 py-2 text-[13px] text-[#E6E9F2] outline-none"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="repo-desc" className="block text-[12px] text-[#A3AABF]">
                Description
              </label>
              <input
                id="repo-desc"
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional summary"
                className="w-full bg-[#0F1117] border border-[#262B3A] focus:border-[#6C7BFF] rounded-[6px] px-3 py-2 text-[13px] text-[#E6E9F2] outline-none"
              />
            </div>
          </div>

          {/* Folder Picker */}
          <div className="p-4 rounded-[10px] bg-[#0F1117] border border-dashed border-[#353B50] space-y-2">
            <input
              ref={folderInputRef}
              type="file"
              multiple
              // @ts-expect-error webkitdirectory is supported in Chromium/WebKit/Firefox desktop browsers
              webkitdirectory=""
              onChange={(e) => void handleFolderSelect(e)}
              className="hidden"
            />
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 text-[12px] text-[#A3AABF]">
                <FolderOpen className="w-4 h-4 text-[#6C7BFF] shrink-0" />
                <span>
                  {stagedFiles.length > 0
                    ? `${stagedFiles.length} source file(s) staged (node_modules/.git excluded)`
                    : 'Import a local folder (excludes node_modules, .git, dist, venv)'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => folderInputRef.current?.click()}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium bg-[#1C2030] hover:bg-[#262B3A] text-[#E6E9F2] border border-[#353B50] rounded-[6px] whitespace-nowrap"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Select Folder</span>
              </button>
            </div>
          </div>

          {/* Quick Single-File Seed Fallback */}
          {stagedFiles.length === 0 && (
            <div className="space-y-2">
              <div className="text-[12px] text-[#A3AABF]">Or initialize with a source file:</div>
              <input
                type="text"
                value={manualFilePath}
                onChange={(e) => setManualFilePath(e.target.value)}
                className="w-full bg-[#0F1117] border border-[#262B3A] rounded-[6px] px-3 py-1.5 font-mono text-[12px] text-[#E6E9F2] outline-none"
              />
              <textarea
                rows={4}
                value={manualFileContent}
                onChange={(e) => setManualFileContent(e.target.value)}
                className="w-full bg-[#0F1117] border border-[#262B3A] rounded-[6px] p-2.5 font-mono text-[12px] text-[#E6E9F2] outline-none"
              />
            </div>
          )}

          {error && <div className="text-[12px] text-[#FF5C6C]">{error}</div>}

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#262B3A]">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 text-[12px] text-[#A3AABF] hover:text-[#E6E9F2]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-[12px] font-semibold bg-[#6C7BFF] hover:bg-[#8793FF] disabled:opacity-50 text-[#0D0F14] rounded-[6px]"
            >
              {submitting ? 'Indexing Repository...' : 'Create & Index Project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
