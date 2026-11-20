import React, { useMemo, useState } from 'react';
import { ArrowRight, RefreshCw, Search } from 'lucide-react';
import { devmindApi } from '../services/api';
import type { GraphNode, Project, SearchHit } from '../types/devmind';

interface RepoBrainViewProps {
  project: Project;
  onReindex: () => Promise<void>;
  onOpenFileAtLine: (filePath: string, line?: number) => void;
}

const LAYER_ORDER: GraphNode['layer'][] = ['entry', 'route', 'service', 'data', 'config', 'test'];
const LAYER_LABELS: Record<GraphNode['layer'], string> = {
  entry: 'Entry',
  route: 'Routes',
  service: 'Core Services',
  data: 'Data Layer',
  config: 'Config',
  test: 'Test Suites',
};

export const RepoBrainView: React.FC<RepoBrainViewProps> = ({
  project,
  onReindex,
  onOpenFileAtLine,
}) => {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [reindexing, setReindexing] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setSearching(true);
    try {
      const res = await devmindApi.searchRepo(project.id, query);
      setHits(res.hits);
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

  // Compute deterministic coordinates for SVG knowledge graph
  const layout = useMemo(() => {
    const nodes = project.architecture.nodes;
    const grouped = new Map<GraphNode['layer'], GraphNode[]>();
    for (const layer of LAYER_ORDER) grouped.set(layer, []);
    for (const n of nodes) {
      grouped.get(n.layer)?.push(n);
    }

    const activeLayers = LAYER_ORDER.filter((l) => (grouped.get(l)?.length ?? 0) > 0);
    const colWidth = 195;
    const rowHeight = 84;
    const positions = new Map<string, { x: number; y: number; node: GraphNode }>();
    let maxRows = 1;

    activeLayers.forEach((layer, colIdx) => {
      const colNodes = grouped.get(layer) ?? [];
      maxRows = Math.max(maxRows, colNodes.length);
      colNodes.forEach((node, rowIdx) => {
        positions.set(node.id, {
          x: 24 + colIdx * colWidth,
          y: 48 + rowIdx * rowHeight,
          node,
        });
      });
    });

    return {
      activeLayers,
      positions,
      width: Math.max(780, activeLayers.length * colWidth + 40),
      height: Math.max(290, maxRows * rowHeight + 76),
    };
  }, [project.architecture.nodes]);

  const selectedNode = selectedNodeId
    ? project.architecture.nodes.find((n) => n.id === selectedNodeId) ?? null
    : null;

  const relatedEdges = useMemo(() => {
    if (!selectedNodeId) return project.architecture.edges;
    return project.architecture.edges.filter(
      (e) => e.source === selectedNodeId || e.target === selectedNodeId
    );
  }, [project.architecture.edges, selectedNodeId]);

  return (
    <div className="h-full overflow-auto bg-[#0D0F14] p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#262B3A] pb-4">
        <div>
          <h1 className="text-[20px] font-semibold text-[#E6E9F2] tracking-tight">
            Repository Brain & Dependency Graph
          </h1>
          <p className="text-[13px] text-[#A3AABF] mt-1 tabular-nums">
            {project.architecture.totalFiles} files · {project.architecture.totalSymbols} symbols ·{' '}
            {project.architecture.totalChunks} code-aware chunks · {project.architecture.edges.length} graph edges ·
            indexed in {project.architecture.indexingDurationMs}ms
          </p>
        </div>

        <button
          onClick={() => void handleReindex()}
          disabled={reindexing}
          className="flex items-center gap-2 px-3.5 py-2 text-[13px] font-medium bg-[#1C2030] hover:bg-[#262B3A] text-[#E6E9F2] border border-[#353B50] rounded-[6px] transition-colors duration-120 whitespace-nowrap"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${reindexing ? 'animate-spin' : ''}`} />
          <span>{reindexing ? 'Re-indexing...' : 'Incremental Re-index'}</span>
        </button>
      </div>

      {/* Interactive Knowledge Graph */}
      <section className="bg-[#151821] border border-[#262B3A] rounded-[10px] overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#262B3A]">
          <div>
            <h2 className="text-[14px] font-semibold text-[#E6E9F2]">
              Architecture & Import Relationships
            </h2>
            <p className="text-[12px] text-[#A3AABF]">
              Click any module node to inspect edges or double-click to open source in editor.
            </p>
          </div>
          {selectedNode && (
            <div className="flex items-center gap-3 text-[12px]">
              <span className="font-mono text-[#E6E9F2]">{selectedNode.filePath}</span>
              <button
                onClick={() => onOpenFileAtLine(selectedNode.filePath, 1)}
                className="text-[#6C7BFF] hover:text-[#8793FF] font-medium whitespace-nowrap"
              >
                Open file
              </button>
              <button
                onClick={() => setSelectedNodeId(null)}
                className="text-[#6B728A] hover:text-[#E6E9F2] whitespace-nowrap"
              >
                Clear filter
              </button>
            </div>
          )}
        </div>

        <div className="overflow-x-auto bg-[#0F1117] p-4">
          <svg
            width={layout.width}
            height={layout.height}
            className="block select-none"
            role="img"
            aria-label="Repository dependency knowledge graph"
          >
            <defs>
              <marker
                id="arrow-import"
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 1 L 10 5 L 0 9 z" fill="#6C7BFF" />
              </marker>
              <marker
                id="arrow-test"
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 1 L 10 5 L 0 9 z" fill="#B38CFF" />
              </marker>
            </defs>

            {/* Layer Column Headers */}
            {layout.activeLayers.map((layer, idx) => (
              <text
                key={layer}
                x={24 + idx * 195}
                y={22}
                fill="#6B728A"
                fontSize="11"
                fontWeight="600"
                fontFamily="Plus Jakarta Sans, sans-serif"
              >
                {LAYER_LABELS[layer]}
              </text>
            ))}

            {/* Edges */}
            {project.architecture.edges.map((edge) => {
              const src = layout.positions.get(edge.source);
              const dst = layout.positions.get(edge.target);
              if (!src || !dst) return null;

              const isHighlighted =
                !selectedNodeId || edge.source === selectedNodeId || edge.target === selectedNodeId;
              const x1 = src.x + 156;
              const y1 = src.y + 28;
              const x2 = dst.x;
              const y2 = dst.y + 28;
              const ctrlX = (x1 + x2) / 2;

              return (
                <path
                  key={edge.id}
                  d={`M ${x1} ${y1} C ${ctrlX} ${y1}, ${ctrlX} ${y2}, ${x2} ${y2}`}
                  fill="none"
                  stroke={edge.type === 'TESTS' ? '#B38CFF' : '#6C7BFF'}
                  strokeWidth={isHighlighted ? 1.6 : 1}
                  strokeOpacity={isHighlighted ? 0.85 : 0.16}
                  strokeDasharray={edge.type === 'TESTS' ? '4 3' : undefined}
                  markerEnd={edge.type === 'TESTS' ? 'url(#arrow-test)' : 'url(#arrow-import)'}
                />
              );
            })}

            {/* Module Nodes */}
            {Array.from(layout.positions.values()).map(({ x, y, node }) => {
              const isSelected = selectedNodeId === node.id;
              return (
                <g
                  key={node.id}
                  transform={`translate(${x}, ${y})`}
                  onClick={() => setSelectedNodeId(isSelected ? null : node.id)}
                  onDoubleClick={() => onOpenFileAtLine(node.filePath, 1)}
                  className="cursor-pointer"
                >
                  <rect
                    width={156}
                    height={56}
                    rx={8}
                    fill={isSelected ? '#1C2030' : '#151821'}
                    stroke={
                      isSelected
                        ? '#6C7BFF'
                        : node.issueCount > 0
                          ? '#FF5C6C'
                          : '#262B3A'
                    }
                    strokeWidth={isSelected ? 1.8 : 1}
                  />
                  <text
                    x={12}
                    y={23}
                    fill="#E6E9F2"
                    fontSize="12"
                    fontWeight="600"
                    fontFamily="JetBrains Mono, monospace"
                  >
                    {node.label.length > 18 ? `${node.label.slice(0, 17)}…` : node.label}
                  </text>
                  <text
                    x={12}
                    y={42}
                    fill={node.issueCount > 0 ? '#FF7A45' : '#A3AABF'}
                    fontSize="11"
                    fontFamily="Plus Jakarta Sans, sans-serif"
                  >
                    {node.symbolCount} sym · {node.lineCount}L
                    {node.issueCount > 0 ? ` · ${node.issueCount} sec` : ''}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        {/* Adjacency List */}
        <div className="px-4 py-3 border-t border-[#262B3A] bg-[#151821] flex flex-wrap gap-x-6 gap-y-1.5 text-[12px]">
          {relatedEdges.slice(0, 8).map((e) => (
            <div key={e.id} className="flex items-center gap-1.5 font-mono text-[#A3AABF]">
              <span className="text-[#E6E9F2]">{e.source.split('/').pop()}</span>
              <ArrowRight className="w-3 h-3 text-[#6C7BFF]" />
              <span className="text-[#6B728A]">{e.type}</span>
              <ArrowRight className="w-3 h-3 text-[#6C7BFF]" />
              <span className="text-[#E6E9F2]">{e.target.split('/').pop()}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Hybrid Code Search (BM25 + Symbol + Graph 1-hop) */}
      <section className="bg-[#151821] border border-[#262B3A] rounded-[10px] p-4 space-y-4">
        <div>
          <h2 className="text-[14px] font-semibold text-[#E6E9F2]">
            Hybrid Semantic & Symbol Retrieval
          </h2>
          <p className="text-[12px] text-[#A3AABF] mt-0.5">
            Combines lexical BM25 scoring, symbol definitions, and 1-hop dependency graph expansion.
          </p>
        </div>

        <form onSubmit={(e) => void handleSearch(e)} className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-[#6B728A] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Try: verifyToken, alg none, sha1 password, SQL query, bearer 401..."
              className="w-full bg-[#0F1117] border border-[#262B3A] focus:border-[#6C7BFF] rounded-[6px] pl-9 pr-3 py-2 text-[13px] text-[#E6E9F2] placeholder-[#6B728A] outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={searching}
            className="px-4 py-2 text-[13px] font-medium bg-[#6C7BFF] hover:bg-[#8793FF] text-[#0D0F14] rounded-[6px] transition-colors duration-120 whitespace-nowrap"
          >
            {searching ? 'Searching...' : 'Search Brain'}
          </button>
        </form>

        {hits.length > 0 ? (
          <div className="divide-y divide-[#262B3A] border-t border-[#262B3A]">
            {hits.map((hit) => (
              <div key={hit.chunkId} className="py-3 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <button
                    onClick={() => onOpenFileAtLine(hit.filePath, hit.startLine)}
                    className="font-mono text-[12px] text-[#8793FF] hover:underline text-left"
                  >
                    {hit.filePath}:{hit.startLine}-{hit.endLine} · {hit.symbolName} ({hit.symbolType})
                  </button>
                  <span className="font-mono text-[11px] text-[#A3AABF] tabular-nums shrink-0">
                    score {hit.score.toFixed(2)} · {hit.matchReason}
                  </span>
                </div>
                <pre className="bg-[#0F1117] border border-[#262B3A] rounded-[6px] p-2.5 font-mono text-[12px] text-[#A3AABF] overflow-x-auto">
                  {hit.preview}
                </pre>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[12px] text-[#6B728A]">
            Enter a natural-language question or symbol name to inspect ranked code-aware chunks.
          </p>
        )}
      </section>
    </div>
  );
};
