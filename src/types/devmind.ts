export type LlmProviderId =
  | 'openai'
  | 'openrouter'
  | 'anthropic'
  | 'groq'
  | 'deepseek'
  | 'ollama'
  | 'custom';

export type AiRoutingMode = 'auto' | 'online' | 'local';

export type AiProvenance = 'online' | 'local-ollama' | 'local-rules';

export interface LocalAiConfig {
  host: string;
  model: string;
  enabled: boolean;
}

export interface OllamaModelInfo {
  name: string;
  sizeBytes?: number;
  modifiedAt?: string;
  parameterSize?: string;
  quantizationLevel?: string;
}

export interface OllamaRuntimeStatus {
  available: boolean;
  host: string;
  version?: string;
  models: OllamaModelInfo[];
  checkedAt: string;
  error?: string;
}

export interface LocalProfile {
  id: string;
  displayName: string;
  email: string;
  hasPasscode: boolean;
  linkedFirebaseUid?: string;
  linkedFirebaseEmail?: string;
  createdAt: string;
  lastActiveAt: string;
}

export type SyncStateStatus = 'Synced' | 'Offline' | 'Pending' | 'Syncing' | 'Conflict' | 'Error';

export type FirebaseConnectionStatus = 'connected' | 'local-only' | 'offline' | 'reauth-required';

export interface SyncConflictRecord {
  id: string;
  entityType: 'project' | 'task' | 'extension' | 'profile';
  entityId: string;
  title: string;
  localUpdatedAt: string;
  cloudUpdatedAt: string;
  localSummary: string;
  cloudSummary: string;
  localSnapshot: Record<string, unknown>;
  cloudSnapshot: Record<string, unknown>;
  mutationId?: number;
  detectedAt: string;
}

export interface GitHubRemoteConfig {
  owner: string;
  repo: string;
  branch: string;
  remoteUrl: string;
  connected: boolean;
  lastSyncedAt?: string;
  lastCommitSha?: string;
  lastCommitMessage?: string;
  lastSyncDirection?: 'push' | 'pull' | 'linked';
}

export interface GitHubCommitInfo {
  sha: string;
  shortSha: string;
  message: string;
  author: string;
  date: string;
  url: string;
}

export interface GitHubAccountStatus {
  connected: boolean;
  username?: string;
  avatarUrl?: string;
  oauthConfigured: boolean;
  scopes?: string[];
}

export interface GitHubSyncResult {
  ok: boolean;
  commitSha?: string;
  commitUrl?: string;
  branch: string;
  pushedFiles?: string[];
  pulledFiles?: string[];
  message: string;
}

export interface UserLlmConfig {
  provider: LlmProviderId;
  baseUrl: string;
  model: string;
  apiKey: string;
  configured: boolean;
}

export interface PublicUserSession {
  sessionId: string;
  displayName: string;
  email: string;
  authMode?: 'local' | 'hybrid';
  localProfileId?: string;
  linkedFirebaseUid?: string;
  aiRoutingMode?: AiRoutingMode;
  localAi?: LocalAiConfig;
  llm: {
    provider: LlmProviderId;
    baseUrl: string;
    model: string;
    hasApiKey: boolean;
    maskedKey: string;
    configured: boolean;
  };
  createdAt: string;
}

export type TaskStatus =
  | 'pending'
  | 'planning'
  | 'awaiting_approval'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type TaskPriority = 'high' | 'medium' | 'low';

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export type ScreenId =
  | 'explorer'
  | 'dashboard'
  | 'brain'
  | 'github'
  | 'extensions'
  | 'debugging'
  | 'security'
  | 'history'
  | 'settings';

export type PermissionLevel = 'allowed' | 'approval_required' | 'explicit_approval' | 'restricted';

export interface PermissionPolicyRule {
  actionType: string;
  label: string;
  category: 'filesystem' | 'execution' | 'git' | 'secrets' | 'extensions';
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
  syncStatus?: 'synced' | 'pending-sync';
  lastIndexedAt: string;
}

export interface CodeSymbol {
  id: string;
  filePath: string;
  name: string;
  kind: 'function' | 'class' | 'method' | 'interface' | 'const' | 'route';
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
  layer: 'entry' | 'route' | 'service' | 'data' | 'config';
  symbolCount: number;
  lineCount: number;
  issueCount: number;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: 'IMPORTS' | 'CALLS' | 'USES' | 'DEFINES' | 'DEPENDS_ON';
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
  githubRemote?: GitHubRemoteConfig;
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
  agentType: 'planner' | 'repository' | 'policy' | 'coding' | 'debugging' | 'review' | 'security';
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
  priority: TaskPriority;
  executionMode: 'approval' | 'direct';
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
    | 'ROLLBACK_EXECUTED'
    | 'SECRET_REDACTED'
    | 'SECURITY_SCAN'
    | 'MODEL_CALL'
    | 'EXTENSION_INSTALLED'
    | 'EXTENSION_UNINSTALLED'
    | 'EXTENSION_TOGGLED'
    | 'EXTENSION_COMMAND'
    | 'GITHUB_LINKED'
    | 'GITHUB_PUSHED'
    | 'GITHUB_PULLED';
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
  provenance?: AiProvenance;
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
  provenance?: AiProvenance;
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

/* ============================================================================
 * VS Code-Inspired Extension Architecture & Runtime Host Types
 * ============================================================================ */

export type ExtensionCategory =
  | 'Formatters'
  | 'Linters'
  | 'Productivity'
  | 'Security'
  | 'Navigation'
  | 'Runtime';

export type ExtensionPermission =
  | 'workspace.read'
  | 'workspace.write'
  | 'editor.diagnostics'
  | 'ui.commands'
  | 'ui.statusbar'
  | 'events.subscribe'
  | 'security.hooks';

export type ExtensionLifecycleState =
  | 'not_installed'
  | 'installed'
  | 'active'
  | 'disabled'
  | 'incompatible'
  | 'error';

export interface ExtensionCommandContribution {
  id: string;
  title: string;
  category: string;
  description: string;
  requiresActiveFile?: boolean;
  mutatesFile?: boolean;
}

export interface ExtensionStatusBarItem {
  id: string;
  extensionId: string;
  text: string;
  tooltip: string;
  alignment: 'left' | 'right';
  priority: number;
  commandId?: string;
}

export interface ExtensionDiagnostic {
  id: string;
  extensionId: string;
  source: string;
  filePath: string;
  line: number;
  severity: 'error' | 'warning' | 'info';
  code: string;
  message: string;
}

export interface ExtensionRuntimeLog {
  id: string;
  timestamp: string;
  extensionId: string;
  level: 'info' | 'warn' | 'error';
  event: string;
  message: string;
}

export interface ExtensionManifest {
  id: string;
  name: string;
  displayName: string;
  publisher: string;
  verifiedPublisher: boolean;
  version: string;
  description: string;
  longDescription: string;
  category: ExtensionCategory;
  engines: {
    devmind: string;
  };
  downloads: number;
  rating: number;
  repositoryUrl: string;
  license: string;
  permissions: ExtensionPermission[];
  activationEvents: string[];
  extensionDependencies: string[];
  contributes: {
    commands: ExtensionCommandContribution[];
    statusBar?: boolean;
    diagnostics?: boolean;
  };
}

export interface ExtensionRecord {
  manifest: ExtensionManifest;
  installed: boolean;
  enabled: boolean;
  state: ExtensionLifecycleState;
  compatible: boolean;
  compatibilityNote: string;
  installedAt?: string;
  activatedAt?: string;
  activationDurationMs?: number;
  missingDependencies: string[];
  dependents: string[];
  lastError?: string;
}

export interface ExtensionHostSnapshot {
  engineVersion: string;
  extensions: ExtensionRecord[];
  activeCommands: Array<ExtensionCommandContribution & { extensionId: string; extensionName: string }>;
  statusBarItems: ExtensionStatusBarItem[];
  diagnostics: ExtensionDiagnostic[];
  runtimeLogs: ExtensionRuntimeLog[];
}
