import crypto from 'node:crypto';
import path from 'node:path';
import type {
  ArchitectureSummary,
  CodeChunk,
  CodeSymbol,
  GraphEdge,
  GraphNode,
  RepoFile,
  SearchHit,
} from '../src/types/devmind.ts';
import { scanRepositorySecurity } from './securityEngine.ts';

const EXCLUDED_SEGMENTS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'venv',
  '.venv',
  'target',
  '.next',
]);

export function shouldExcludePath(filePath: string): boolean {
  const segments = filePath.split(/[/\\]/);
  return segments.some((seg) => EXCLUDED_SEGMENTS.has(seg));
}

export function detectLanguage(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const map: Record<string, string> = {
    '.ts': 'typescript',
    '.tsx': 'typescript',
    '.js': 'javascript',
    '.jsx': 'javascript',
    '.mjs': 'javascript',
    '.py': 'python',
    '.go': 'go',
    '.rs': 'rust',
    '.java': 'java',
    '.sql': 'sql',
    '.json': 'json',
    '.yaml': 'yaml',
    '.yml': 'yaml',
    '.md': 'markdown',
    '.css': 'css',
    '.html': 'html',
  };
  return map[ext] ?? 'plaintext';
}

export function computeContentHash(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex').slice(0, 16);
}

export function buildRepoFile(filePath: string, content: string, gitStatus: RepoFile['gitStatus'] = 'clean'): RepoFile {
  const normalizedPath = filePath.replace(/\\/g, '/').replace(/^\/+/, '');
  return {
    path: normalizedPath,
    content,
    language: detectLanguage(normalizedPath),
    sizeBytes: Buffer.byteLength(content, 'utf8'),
    lineCount: content.split('\n').length,
    contentHash: computeContentHash(content),
    gitStatus,
    lastIndexedAt: new Date().toISOString(),
  };
}

/**
 * Extracts semantic symbols (functions, classes, interfaces, tests) with exact line spans.
 */
export function extractSymbols(file: RepoFile): CodeSymbol[] {
  const symbols: CodeSymbol[] = [];
  const lines = file.content.split('\n');

  const findBlockEnd = (startIdx: number): number => {
    let braceDepth = 0;
    let sawBrace = false;
    for (let i = startIdx; i < lines.length; i++) {
      for (const ch of lines[i]) {
        if (ch === '{') {
          braceDepth += 1;
          sawBrace = true;
        } else if (ch === '}') {
          braceDepth -= 1;
        }
      }
      if (sawBrace && braceDepth <= 0) {
        return i + 1;
      }
    }
    return Math.min(lines.length, startIdx + 20);
  };

  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    const lineNum = idx + 1;

    const fnMatch = trimmed.match(/^(export\s+)?(async\s+)?function\s+([A-Za-z0-9_]+)\s*\(/);
    if (fnMatch) {
      symbols.push({
        id: `${file.path}:${fnMatch[3]}:${lineNum}`,
        filePath: file.path,
        name: fnMatch[3],
        kind: 'function',
        startLine: lineNum,
        endLine: findBlockEnd(idx),
        signature: trimmed.replace(/\{.*$/, '').trim(),
        exported: Boolean(fnMatch[1]),
      });
      return;
    }

    const classMatch = trimmed.match(/^(export\s+)?class\s+([A-Za-z0-9_]+)/);
    if (classMatch) {
      symbols.push({
        id: `${file.path}:${classMatch[2]}:${lineNum}`,
        filePath: file.path,
        name: classMatch[2],
        kind: 'class',
        startLine: lineNum,
        endLine: findBlockEnd(idx),
        signature: trimmed.replace(/\{.*$/, '').trim(),
        exported: Boolean(classMatch[1]),
      });
      return;
    }

    const ifaceMatch = trimmed.match(/^(export\s+)?interface\s+([A-Za-z0-9_]+)/);
    if (ifaceMatch) {
      symbols.push({
        id: `${file.path}:${ifaceMatch[2]}:${lineNum}`,
        filePath: file.path,
        name: ifaceMatch[2],
        kind: 'interface',
        startLine: lineNum,
        endLine: findBlockEnd(idx),
        signature: trimmed.replace(/\{.*$/, '').trim(),
        exported: Boolean(ifaceMatch[1]),
      });
      return;
    }

    const pyDefMatch = trimmed.match(/^(?:async\s+)?def\s+([A-Za-z0-9_]+)\s*\(/);
    if (pyDefMatch) {
      symbols.push({
        id: `${file.path}:${pyDefMatch[1]}:${lineNum}`,
        filePath: file.path,
        name: pyDefMatch[1],
        kind: 'function',
        startLine: lineNum,
        endLine: Math.min(lines.length, lineNum + 18),
        signature: trimmed,
        exported: !pyDefMatch[1].startsWith('_'),
      });
    }
  });

  return symbols;
}

/**
 * Extracts relative import targets from TypeScript / JavaScript / Python files.
 */
function extractImports(file: RepoFile, allPaths: Set<string>): string[] {
  const deps: string[] = [];
  const dir = path.posix.dirname(file.path);
  const importRegex = /(?:import|from)\s+['"](\.[^'"]+)['"]/g;

  let match: RegExpExecArray | null;
  while ((match = importRegex.exec(file.content)) !== null) {
    const rawRel = match[1];
    const resolved = path.posix.normalize(path.posix.join(dir === '.' ? '' : dir, rawRel));
    const candidates = [
      resolved,
      `${resolved}.ts`,
      `${resolved}.tsx`,
      `${resolved}.js`,
      `${resolved}/index.ts`,
    ];
    for (const candidate of candidates) {
      if (allPaths.has(candidate)) {
        deps.push(candidate);
        break;
      }
    }
  }
  return Array.from(new Set(deps));
}

function classifyLayer(filePath: string): GraphNode['layer'] {
  if (filePath.includes('route') || filePath.includes('webhook')) return 'route';
  if (filePath.includes('db/') || filePath.includes('repository')) return 'data';
  if (filePath.includes('config') || filePath.endsWith('.json') || filePath.endsWith('.md')) return 'config';
  if (filePath.includes('server.ts') || filePath.includes('index.ts')) return 'entry';
  return 'service';
}

/**
 * Code-Aware Chunking & Knowledge Graph Construction.
 */
export function indexRepository(
  projectId: string,
  rawFiles: RepoFile[]
): {
  files: RepoFile[];
  symbols: CodeSymbol[];
  chunks: CodeChunk[];
  architecture: ArchitectureSummary;
} {
  const startedAt = Date.now();
  const seenFilePaths = new Set<string>();
  const files: RepoFile[] = [];
  for (const f of rawFiles) {
    if (shouldExcludePath(f.path) || seenFilePaths.has(f.path)) continue;
    seenFilePaths.add(f.path);
    files.push(f);
  }
  const allPaths = new Set(files.map((f) => f.path));

  const symbols: CodeSymbol[] = [];
  const chunks: CodeChunk[] = [];
  const edges: GraphEdge[] = [];
  const seenEdgeIds = new Set<string>();
  const securityFindings = scanRepositorySecurity(projectId, files);

  const langCounts = new Map<string, number>();
  let totalLines = 0;

  for (const file of files) {
    totalLines += file.lineCount;
    if (file.language !== 'json' && file.language !== 'markdown') {
      langCounts.set(file.language, (langCounts.get(file.language) ?? 0) + file.lineCount);
    }

    const fileSymbols = extractSymbols(file);
    symbols.push(...fileSymbols);

    const fileDeps = extractImports(file, allPaths);
    for (const dep of fileDeps) {
      const edgeId = `${file.path}->${dep}`;
      if (seenEdgeIds.has(edgeId)) continue;
      seenEdgeIds.add(edgeId);
      edges.push({
        id: edgeId,
        source: file.path,
        target: dep,
        type: 'IMPORTS',
      });
    }

    const lines = file.content.split('\n');
    if (fileSymbols.length > 0) {
      for (const sym of fileSymbols) {
        const slice = lines.slice(sym.startLine - 1, sym.endLine).join('\n');
        chunks.push({
          chunkId: computeContentHash(`${projectId}:${file.path}:${sym.name}:${sym.startLine}`),
          projectId,
          filePath: file.path,
          language: file.language,
          symbolName: sym.name,
          symbolType: sym.kind,
          startLine: sym.startLine,
          endLine: sym.endLine,
          contentHash: computeContentHash(slice),
          content: slice,
          dependencies: fileDeps,
        });
      }
    } else {
      chunks.push({
        chunkId: computeContentHash(`${projectId}:${file.path}:file`),
        projectId,
        filePath: file.path,
        language: file.language,
        symbolName: path.posix.basename(file.path),
        symbolType: 'file',
        startLine: 1,
        endLine: file.lineCount,
        contentHash: file.contentHash,
        content: file.content,
        dependencies: fileDeps,
      });
    }
  }

  let primaryLanguage = 'TypeScript';
  let bestCount = -1;
  for (const [lang, count] of langCounts.entries()) {
    if (count > bestCount) {
      bestCount = count;
      primaryLanguage = lang.charAt(0).toUpperCase() + lang.slice(1);
    }
  }

  const pkgJson = files.find((f) => f.path === 'package.json');
  let framework = 'Node.js Service';
  if (pkgJson?.content.includes('"express"')) framework = 'Express + Node.js';
  else if (pkgJson?.content.includes('"react"')) framework = 'React + TypeScript';
  else if (files.some((f) => f.path.endsWith('.py'))) framework = 'Python / FastAPI';

  const nodes: GraphNode[] = files
    .filter((f) => !f.path.endsWith('.json') && !f.path.endsWith('.md'))
    .map((f) => ({
      id: f.path,
      label: path.posix.basename(f.path),
      filePath: f.path,
      layer: classifyLayer(f.path),
      symbolCount: symbols.filter((s) => s.filePath === f.path).length,
      lineCount: f.lineCount,
      issueCount: securityFindings.filter((sec) => sec.filePath === f.path).length,
    }));

  const entryPoints = files
    .filter((f) => /(?:server|main|index|app)\.(ts|js|py)$/.test(f.path))
    .map((f) => f.path);

  const durationMs = Math.max(4, Date.now() - startedAt);

  return {
    files,
    symbols,
    chunks,
    architecture: {
      projectId,
      framework,
      primaryLanguage,
      packageManager: pkgJson ? 'npm' : 'unknown',
      entryPoints: entryPoints.length > 0 ? entryPoints : files.slice(0, 1).map((f) => f.path),
      totalFiles: files.length,
      totalLines,
      totalSymbols: symbols.length,
      totalChunks: chunks.length,
      indexingDurationMs: durationMs,
      nodes,
      edges,
      lastIndexedAt: new Date().toISOString(),
    },
  };
}

/**
 * Section 9: Hybrid Retrieval (BM25-style lexical + symbol match + dependency-graph boost).
 */
export function hybridSearchRepository(
  query: string,
  chunks: CodeChunk[],
  edges: GraphEdge[],
  limit = 8
): SearchHit[] {
  const tokens = query
    .toLowerCase()
    .replace(/[^a-z0-9_./:-]+/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2);

  if (tokens.length === 0) {
    return chunks.slice(0, limit).map((c) => ({
      chunkId: c.chunkId,
      filePath: c.filePath,
      symbolName: c.symbolName,
      symbolType: c.symbolType,
      startLine: c.startLine,
      endLine: c.endLine,
      score: 1,
      matchReason: 'Indexed symbol',
      preview: c.content.split('\n').slice(0, 5).join('\n'),
    }));
  }

  const scored = chunks.map((chunk) => {
    const contentLower = chunk.content.toLowerCase();
    const symbolLower = chunk.symbolName.toLowerCase();
    const pathLower = chunk.filePath.toLowerCase();

    let score = 0;
    const reasons: string[] = [];

    for (const token of tokens) {
      if (symbolLower.includes(token)) {
        score += 5.0;
        reasons.push(`symbol:${token}`);
      }
      if (pathLower.includes(token)) {
        score += 3.5;
        reasons.push(`path:${token}`);
      }
      const occurrences = contentLower.split(token).length - 1;
      if (occurrences > 0) {
        // BM25-inspired saturation
        score += (occurrences * 2.2) / (occurrences + 1.2);
        reasons.push(`content:${token}`);
      }
    }

    return { chunk, score, reasons: Array.from(new Set(reasons)) };
  });

  // Dependency-graph 1-hop boost for neighbors of top lexical hits
  const topFiles = new Set(
    scored
      .filter((s) => s.score > 2.5)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map((s) => s.chunk.filePath)
  );

  const neighborFiles = new Set<string>();
  for (const edge of edges) {
    if (topFiles.has(edge.source)) neighborFiles.add(edge.target);
    if (topFiles.has(edge.target)) neighborFiles.add(edge.source);
  }

  for (const item of scored) {
    if (neighborFiles.has(item.chunk.filePath) && !topFiles.has(item.chunk.filePath)) {
      item.score += 1.4;
      item.reasons.push('graph:1-hop');
    }
  }

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => ({
      chunkId: s.chunk.chunkId,
      filePath: s.chunk.filePath,
      symbolName: s.chunk.symbolName,
      symbolType: s.chunk.symbolType,
      startLine: s.chunk.startLine,
      endLine: s.chunk.endLine,
      score: Number(s.score.toFixed(2)),
      matchReason: s.reasons.slice(0, 3).join(', ') || 'relevance',
      preview: s.chunk.content.split('\n').slice(0, 6).join('\n'),
    }));
}
