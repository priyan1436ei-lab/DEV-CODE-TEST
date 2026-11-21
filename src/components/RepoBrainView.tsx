import React, { useMemo, useState } from 'react';
import {
  FileCode2,
  GitFork,
  Loader2,
  RefreshCw,
  Search,
} from 'lucide-react';
import type { GraphNode, Project, SearchHit } from '../types/devmind';

interface RepoBrainViewProps {
  project: Project | null;
  onSearch: (query: string) => Promise<SearchHit[]>;
  onReindex: () => Promise<void>;
  onOpenFileLine: (filePath: string, line: number) => void;
}

const LAYER_ORDER: Array<GraphNode['layer']> = ['entry', 'route', 'service', 'data', 'config'];

const LAYER_LABELS: Record<GraphNode['layer'], string> = {
  entry: 'Entry Points',
  route: 'Routes & Controllers',
  service: 'Core Services',
  data: 'Data & Storage',
  config: 'Configuration',
};

export const RepoBrainView: React.FC<RepoBrainViewProps> = ({
  project,
  onSearch,
  onReindex,
  onOpenFileLine,
}) => {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [reindexing, setReindexing] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const layout = useMemo(() => {
    if (!project) return { positions: new Map<string, { x: number; y: number }>(), width: 880, height: 340 };
    const buckets = new Map<GraphNode['layer'], GraphNode[]>();
    for (const layer of LAYER_ORDER) buckets.set(layer, []);
    for (const node of project.architecture.nodes) {
      const list = buckets.get(node.layer) || [];
      list.push(node);
      buckets.set(node.layer, list);
    }

    const colWidth = 185;
    const rowHeight = 68;
    const positions = new Map<string, { x: number; y: number }>();
    let maxRows = 1;

    LAYER_ORDER.forEach((layer, colIdx) => {
      const nodes = buckets.get(layer) || [];
      maxRows = Math.max(maxRows, nodes.length);
      nodes.forEach((node, rowIdx) => {
        positions.set(node.id, {
          x: 24 + colIdx * colWidth,
          y: 48 + rowIdx * rowHeight,
        });
      });
    });

    return {
      positions,
      width: Math.max(920, LAYER_ORDER.length * colWidth + 32),
      height: Math.max(280, maxRows * rowHeight + 76),
    };
  }, [project]);

  const selectedNode = useMemo(
    () => project?.architecture.nodes.find((n) => n.id === selectedNodeId) || null,
    [project, selectedNodeId]
  );

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || searching) return;
    setSearching(true);
    try {
      const res = await onSearch(query.trim());
      setHits(res);
    } finally {
      setSearching(false);
    }
  };

  const handleReindex = async () => {
    setReindexing(true);
    try {
      await onReindex();
    } finally {
      setReindexing(false);
    }
  };

  if (!project) {
    return (
      <div className="h-full flex items-center justify-center bg-[var(--surface-canvas)] text-xs text-[var(--ink-muted)]">
        Select a repository to inspect its architecture graph and AST symbol index.
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-[var(--surface-canvas)] p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--border-hairline)] pb-4">
        <div>
          <h1 className="text-lg font-semibold text-[var(--ink-primary)] tracking-tight">
            Architecture & Symbol Index
          </h1>
          <p className="text-xs text-[var(--ink-secondary)] mt-0.5 font-mono">
            {project.framework} · {project.architecture.totalFiles} files · {project.architecture.totalSymbols} symbols · Indexed in {project.architecture.indexingDurationMs}ms
          </p>
        </div>

        <button
          type="button"
          disabled={reindexing}
          onClick={handleReindex}
          className="h-8 px-3 text-xs font-medium rounded-[4px] border border-[var(--border-strong)] bg-[var(--surface-elevated)] text-[var(--ink-primary)] hover:bg-[var(--surface-hover)] inline-flex items-center gap-1.5"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${reindexing ? 'animate-spin' : ''}`} />
          Rebuild AST Index
        </button>
      </div>

      {/* Layered Dependency Graph */}
      <section className="border border-[var(--border-hairline)] rounded-[4px] bg-[var(--surface-elevated)] overflow-hidden">
        <div className="px-4 py-2.5 border-b border-[var(--border-hairline)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <GitFork className="w-4 h-4 text-[var(--accent-primary)]" />
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--ink-primary)]">
              Module Dependency Graph ({project.architecture.nodes.length} modules · {project.architecture.edges.length} edges)
            </h2>
          </div>
          {selectedNode && (
            <button
              type="button"
              onClick={() => onOpenFileLine(selectedNode.filePath, 1)}
              className="text-xs font-mono text-[var(--accent-primary)] hover:underline"
            >
              Open {selectedNode.filePath}
            </button>
          )}
        </div>

        <div className="overflow-x-auto bg-[var(--surface-canvas)] p-2">
          <svg
            width={layout.width}
            height={layout.height}
            viewBox={`0 0 ${layout.width} ${layout.height}`}
            className="block"
          >
            {/* Column Layer Headers */}
            {LAYER_ORDER.map((layer, idx) => (
              <text
                key={layer}
                x={24 + idx * 185}
                y={24}
                fill="var(--ink-muted)"
                fontSize="11"
                fontWeight="600"
                fontFamily="var(--font-sans)"
              >
                {LAYER_LABELS[layer].toUpperCase()}
              </text>
            ))}

            {/* Edges */}
            {project.architecture.edges.map((edge) => {
              const from = layout.positions.get(edge.source);
              const to = layout.positions.get(edge.target);
              if (!from || !to) return null;
              const isHighlighted =
                selectedNodeId === edge.source || selectedNodeId === edge.target;
              const x1 = from.x + 156;
              const y1 = from.y + 22;
              const x2 = to.x;
              const y2 = to.y + 22;
              const midX = (x1 + x2) / 2;
              return (
                <path
                  key={edge.id}
                  d={`M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`}
                  fill="none"
                  stroke={isHighlighted ? 'var(--accent-primary)' : 'var(--border-strong)'}
                  strokeWidth={isHighlighted ? 1.8 : 1}
                  strokeOpacity={isHighlighted ? 0.95 : 0.65}
                />
              );
            })}

            {/* Nodes */}
            {project.architecture.nodes.map((node) => {
              const pos = layout.positions.get(node.id);
              if (!pos) return null;
              const isSelected = selectedNodeId === node.id;
              return (
                <g
                  key={node.id}
                  transform={`translate(${pos.x}, ${pos.y})`}
                  onClick={() => setSelectedNodeId(node.id)}
                  onDoubleClick={() => onOpenFileLine(node.filePath, 1)}
                  style={{ cursor: 'pointer' }}
                >
                  <rect
                    width={156}
                    height={46}
                    rx={4}
                    fill={isSelected ? 'var(--surface-active)' : 'var(--surface-elevated)'}
                    stroke={isSelected ? 'var(--accent-primary)' : 'var(--border-strong)'}
                    strokeWidth={isSelected ? 1.5 : 1}
                  />
                  <text
                    x={10}
                    y={19}
                    fill="var(--ink-primary)"
                    fontSize="11"
                    fontWeight="600"
                    fontFamily="var(--font-mono)"
                  >
                    {node.label.length > 18 ? `${node.label.slice(0, 17)}…` : node.label}
                  </text>
                  <text
                    x={10}
                    y={35}
                    fill="var(--ink-muted)"
                    fontSize="10"
                    fontFamily="var(--font-mono)"
                  >
                    {node.symbolCount} sym · {node.lineCount}L
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      </section>

      {/* Hybrid AST & Symbol Search */}
      <section className="border border-[var(--border-hairline)] rounded-[4px] bg-[var(--surface-elevated)] p-4 space-y-4">
        <form onSubmit={handleSearch} className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 text-[var(--ink-muted)] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search symbols, routes, functions, or code patterns..."
              className="w-full h-9 pl-9 pr-3 text-xs rounded-[4px] bg-[var(--surface-canvas)] border border-[var(--border-hairline)] text-[var(--ink-primary)] placeholder:text-[var(--ink-muted)] focus:outline-none focus:border-[var(--accent-primary)]"
            />
          </div>
          <button
            type="submit"
            disabled={searching || !query.trim()}
            className="h-9 px-4 text-xs font-medium rounded-[4px] bg-[var(--accent-primary)] text-[var(--accent-ink)] hover:bg-[var(--accent-hover)] disabled:opacity-40 inline-flex items-center gap-1.5"
          >
            {searching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Search Index'}
          </button>
        </form>

        {hits.length > 0 && (
          <div className="border border-[var(--border-hairline)] rounded-[4px] divide-y divide-[var(--border-hairline)] bg-[var(--surface-canvas)]">
            {hits.map((hit) => (
              <button
                key={hit.chunkId}
                type="button"
                onClick={() => onOpenFileLine(hit.filePath, hit.startLine)}
                className="w-full px-4 py-3 text-left hover:bg-[var(--surface-hover)] space-y-1 transition-colors"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="inline-flex items-center gap-1.5 text-xs font-mono font-medium text-[var(--accent-primary)]">
                    <FileCode2 className="w-3.5 h-3.5" />
                    {hit.filePath}:{hit.startLine}
                  </span>
                  <span className="text-[11px] font-mono text-[var(--ink-muted)]">
                    {hit.symbolName} · score {hit.score.toFixed(2)}
                  </span>
                </div>
                <pre className="text-[11px] font-mono text-[var(--ink-secondary)] line-clamp-2 whitespace-pre-wrap">
                  {hit.preview}
                </pre>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
