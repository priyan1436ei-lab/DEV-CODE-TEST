export type TaskStatus =
  | 'pending'
  | 'planning'
  | 'awaiting_approval'
  | 'running'
  | 'testing'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export type ScreenId =
  | 'dashboard'
  | 'explorer'
  | 'brain'
  | 'debugging'
  | 'security'
  | 'history'
  | 'settings';

export type PermissionLevel = 'allowed' | 'approval_required' | 'explicit_approval' | 'restricted';

export interface PermissionPolicyRule {
  actionType: string;
  label: string;
  category: 'filesystem' | 'execution' | 'git' | 'secrets';
  level: PermissionLevel;
  description: string;
}

export interface RepoFile {
  path: string;
  content: string;
  language: string;
  sizeBytes: number;
  lineCount: number;
  contentHash: string;
  gitStatus?: 'clean' | 'modified' | 'added' | 'deleted';
  lastIndexedAt: string;
}

export interface CodeSymbol {
  id: string;
  filePath: string;
  name: string;
  kind: 'function' | 'class' | 'method' | 'interface' | 'const' | 'route' | 'test';
  startLine: number;
  endLine: number;
  signature: string;
  exported: boolean;
}

export interface CodeChunk {
  chunkId: string;
  projectId: string;
  filePath: string;
  language: string;
  symbolName: string;
  symbolType: string;
  startLine: number;
  endLine: number;
  contentHash: string;
  content: string;
  dependencies: string[];
}

export interface GraphNode {
  id: string;
  label: string;
  filePath: string;
  layer: 'entry' | 'route' | 'service' | 'data' | 'config' | 'test';
  symbolCount: number;
  lineCount: number;
  issueCount: number;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: 'IMPORTS' | 'CALLS' | 'TESTS' | 'USES' | 'DEFINES' | 'DEPENDS_ON';
}

export interface ArchitectureSummary {
  projectId: string;
  framework: string;
  primaryLanguage: string;
  packageManager: string;
  entryPoints: string[];
  totalFiles: number;
  totalLines: number;
  totalSymbols: number;
  totalChunks: number;
  indexingDurationMs: number;
  nodes: GraphNode[];
  edges: GraphEdge[];
  lastIndexedAt: string;
}

export interface Project {
  id: string;
  workspaceId: string;
  name: string;
  description: string;
  localPath: string;
  remoteUrl?: string;
  defaultBranch: string;
  primaryLanguage: string;
  framework: string;
  packageManager: string;
  indexingStatus: 'pending' | 'indexing' | 'indexed' | 'error';
  indexingDurationMs: number;
  files: RepoFile[];
  symbols: CodeSymbol[];
  chunks: CodeChunk[];
  architecture: ArchitectureSummary;
  createdAt: string;
  updatedAt: string;
}

export interface AgentStep {
  id: string;
  taskId: string;
  stepNumber: number;
  agentType: 'planner' | 'repository' | 'policy' | 'coding' | 'sandbox' | 'debugging' | 'review' | 'security';
  action: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'awaiting_approval' | 'skipped';
  inputSummary: string;
  outputSummary: string;
  durationMs?: number;
  createdAt: string;
}

export interface CodeChange {
  id: string;
  taskId: string;
  filePath: string;
  changeType: 'modify' | 'create' | 'delete';
  originalContent: string;
  proposedContent: string;
  diffText: string;
  rationale: string;
  patchHash: string;
  status: 'proposed' | 'approved' | 'applied' | 'rejected' | 'rolled_back';
}

export interface ApprovalRequest {
  id: string;
  taskId: string;
  actionType: string;
  title: string;
  summary: string;
  riskLevel: 'low' | 'medium' | 'high';
  affectedFiles: string[];
  commandsToRun: string[];
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  requestedAt: string;
  expiresAt: string;
  decidedAt?: string;
  decidedBy?: string;
}

export interface TestCaseResult {
  name: string;
  status: 'pass' | 'fail' | 'skip';
  durationMs: number;
  errorMessage?: string;
}

export interface TestFileCoverage {
  file: string;
  linePercent: number;
  branchPercent: number;
  funcsPercent: number;
  uncoveredLines: string;
}

export interface TestCoverageSummary {
  linePercent: number;
  branchPercent: number;
  funcsPercent: number;
  files: TestFileCoverage[];
}

export interface TestRun {
  id: string;
  projectId: string;
  taskId?: string;
  command: string;
  sandboxId: string;
  status: 'passed' | 'failed' | 'error';
  exitCode: number;
  passedCount: number;
  failedCount: number;
  totalCount: number;
  durationMs: number;
  stdout: string;
  stderr: string;
  cases: TestCaseResult[];
  coverage?: TestCoverageSummary;
  createdAt: string;
}

export interface RollbackSnapshot {
  id: string;
  taskId: string;
  createdAt: string;
  files: Array<{ path: string; content: string }>;
  restored: boolean;
}

export interface AgentTask {
  id: string;
  projectId: string;
  title: string;
  description: string;
  status: TaskStatus;
  executionMode: 'approval' | 'strict_sandbox';
  modelProvider: string;
  modelName: string;
  estimatedCostUsd: number;
  actualCostUsd: number;
  promptTokens: number;
  completionTokens: number;
  retryCount: number;
  maxRetries: number;
  steps: AgentStep[];
  changes: CodeChange[];
  approvals: ApprovalRequest[];
  testRuns: TestRun[];
  rollbackSnapshot?: RollbackSnapshot;
  finalReport?: {
    summary: string;
    rootCauses: string[];
    filesModified: string[];
    verificationPassed: boolean;
    remainingRisks: string[];
  };
  errorMessage?: string;
  createdAt: string;
  completedAt?: string;
}

export interface SecurityFinding {
  id: string;
  projectId: string;
  ruleId: string;
  cwe: string;
  title: string;
  severity: Severity;
  filePath: string;
  line: number;
  snippet: string;
  description: string;
  remediation: string;
  status: 'open' | 'remediated';
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  actor: string;
  eventType:
    | 'PROJECT_INDEXED'
    | 'TASK_CREATED'
    | 'POLICY_CHECK'
    | 'APPROVAL_REQUESTED'
    | 'APPROVAL_DECIDED'
    | 'FILES_MODIFIED'
    | 'SANDBOX_EXECUTED'
    | 'ROLLBACK_EXECUTED'
    | 'SECRET_REDACTED'
    | 'SECURITY_SCAN'
    | 'MODEL_CALL';
  resourceType: string;
  resourceId: string;
  summary: string;
  metadata?: Record<string, unknown>;
}

export interface CodeCitation {
  filePath: string;
  startLine: number;
  endLine: number;
  symbolName?: string;
  snippet?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations?: CodeCitation[];
  modelUsed?: string;
  tokensUsed?: number;
  costUsd?: number;
  redactedSecretsCount?: number;
  createdAt: string;
}

export interface SearchHit {
  chunkId: string;
  filePath: string;
  symbolName: string;
  symbolType: string;
  startLine: number;
  endLine: number;
  score: number;
  matchReason: string;
  preview: string;
}

export interface DebugAnalysis {
  id: string;
  projectId: string;
  errorInput: string;
  rootCause: string;
  confidence: 'high' | 'medium' | 'low';
  affectedFiles: CodeCitation[];
  explanation: string;
  proposedPatchPrompt: string;
  modelUsed: string;
  tokensUsed: number;
  createdAt: string;
}

export interface UsageLedger {
  planName: 'Pro';
  monthlyTokenLimit: number;
  tokensUsed: number;
  monthlyBudgetUsd: number;
  spentUsd: number;
  alertThreshold80Triggered: boolean;
  alertThreshold100Triggered: boolean;
  totalModelCalls: number;
  secretsRedactedTotal: number;
  unauthorizedActionsBlocked: number;
  recentRecords: Array<{
    id: string;
    timestamp: string;
    provider: string;
    model: string;
    operation: string;
    promptTokens: number;
    completionTokens: number;
    costUsd: number;
    latencyMs: number;
  }>;
}
