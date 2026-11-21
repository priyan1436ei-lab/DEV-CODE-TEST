import React, { useState } from 'react';
import { FolderPlus, Loader2, Upload, X } from 'lucide-react';

interface ImportRepoModalProps {
  open: boolean;
  onClose: () => void;
  onImport: (body: {
    name: string;
    description: string;
    localPath: string;
    files: Array<{ path: string; content: string }>;
  }) => Promise<void>;
}

const DEFAULT_TEMPLATE_FILES = [
  {
    path: 'src/index.ts',
    content: `import { createOrderService } from './services/orderService';\n\nconst orders = createOrderService();\nconsole.log('Service initialized:', orders.getStatus());\n`,
  },
  {
    path: 'src/services/orderService.ts',
    content: `export interface OrderRecord {\n  id: string;\n  totalCents: number;\n  currency: string;\n}\n\nexport function createOrderService() {\n  const records: OrderRecord[] = [];\n\n  return {\n    add(order: OrderRecord) {\n      records.push(order);\n      return order;\n    },\n    getStatus() {\n      return { count: records.length, healthy: true };\n    },\n  };\n}\n`,
  },
  {
    path: 'package.json',
    content: `{\n  "name": "order-service",\n  "version": "1.0.0",\n  "type": "module"\n}\n`,
  },
];

export const ImportRepoModal: React.FC<ImportRepoModalProps> = ({ open, onClose, onImport }) => {
  const [name, setName] = useState('order-service');
  const [description, setDescription] = useState('TypeScript microservice workspace');
  const [localPath, setLocalPath] = useState('C:\\Workspaces\\order-service');
  const [files, setFiles] = useState<Array<{ path: string; content: string }>>(DEFAULT_TEMPLATE_FILES);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    const loaded: Array<{ path: string; content: string }> = [];
    for (let i = 0; i < Math.min(fileList.length, 30); i++) {
      const f = fileList[i];
      if (f.size > 200_000) continue;
      const content = await f.text();
      const relPath = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
      loaded.push({ path: relPath.replace(/^\/+/, ''), content });
    }
    if (loaded.length > 0) {
      setFiles(loaded);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || files.length === 0) return;
    setError(null);
    setSubmitting(true);
    try {
      await onImport({
        name: name.trim(),
        description: description.trim(),
        localPath: localPath.trim() || `C:\\Workspaces\\${name.trim()}`,
        files,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to import repository.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-[6px] border border-[var(--border-strong)] bg-[var(--surface-elevated)] shadow-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 h-11 border-b border-[var(--border-hairline)] bg-[var(--surface-chrome)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FolderPlus className="w-4 h-4 text-[var(--accent-primary)]" />
            <h2 className="text-xs font-semibold text-[var(--ink-primary)]">Import Repository Workspace</h2>
          </div>
          <button type="button" onClick={onClose} className="p-1 text-[var(--ink-muted)] hover:text-[var(--ink-primary)]">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] text-[var(--ink-secondary)] mb-1">Repository Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setLocalPath(`C:\\Workspaces\\${e.target.value.trim() || 'workspace'}`);
                }}
                required
                className="w-full h-8 px-2.5 text-xs rounded-[4px] bg-[var(--surface-canvas)] border border-[var(--border-hairline)] text-[var(--ink-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
              />
            </div>

            <div>
              <label className="block text-[11px] text-[var(--ink-secondary)] mb-1">Windows Local Path</label>
              <input
                type="text"
                value={localPath}
                onChange={(e) => setLocalPath(e.target.value)}
                className="w-full h-8 px-2.5 text-xs font-mono rounded-[4px] bg-[var(--surface-canvas)] border border-[var(--border-hairline)] text-[var(--ink-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] text-[var(--ink-secondary)] mb-1">Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full h-8 px-2.5 text-xs rounded-[4px] bg-[var(--surface-canvas)] border border-[var(--border-hairline)] text-[var(--ink-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
            />
          </div>

          <div className="p-3 rounded-[4px] border border-dashed border-[var(--border-strong)] bg-[var(--surface-canvas)] flex items-center justify-between gap-3">
            <div className="text-xs text-[var(--ink-secondary)]">
              <div className="font-medium text-[var(--ink-primary)]">{files.length} source files staged</div>
              <div className="text-[11px] text-[var(--ink-muted)] mt-0.5">
                Upload local files or use the default TypeScript template.
              </div>
            </div>
            <label className="h-8 px-3 text-xs font-medium rounded-[4px] border border-[var(--border-strong)] bg-[var(--surface-elevated)] text-[var(--ink-primary)] hover:bg-[var(--surface-hover)] inline-flex items-center gap-1.5 cursor-pointer shrink-0">
              <Upload className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
              Select Files
              <input type="file" multiple onChange={handleFileUpload} className="hidden" />
            </label>
          </div>

          {error && <div className="text-xs text-[var(--status-danger)]">{error}</div>}

          <div className="pt-2 border-t border-[var(--border-hairline)] flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-8 px-3 text-xs rounded-[4px] border border-[var(--border-hairline)] text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="h-8 px-4 text-xs font-medium rounded-[4px] bg-[var(--accent-primary)] text-[var(--accent-ink)] hover:bg-[var(--accent-hover)] disabled:opacity-40 inline-flex items-center gap-1.5"
            >
              {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Import & Index
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
