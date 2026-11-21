import crypto from 'node:crypto';
import type {
  ExtensionDiagnostic,
  ExtensionHostSnapshot,
  ExtensionLifecycleState,
  ExtensionManifest,
  ExtensionPermission,
  ExtensionRecord,
  ExtensionRuntimeLog,
  ExtensionStatusBarItem,
  Project,
} from '../src/types/devmind.ts';

export const CORE_ENGINE_VERSION = '2.1.0';

function uid(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(4).toString('hex')}`;
}

function parseSemver(ver: string): [number, number, number] {
  const clean = ver.replace(/^[^\d]*/, '').split('-')[0];
  const [maj = '0', min = '0', pat = '0'] = clean.split('.');
  return [Number(maj) || 0, Number(min) || 0, Number(pat) || 0];
}

/**
 * Evaluates VS Code-style `engines.devmind` semver constraints (`^2.0.0`, `>=2.0.0`, `^1.0.0`).
 */
export function checkEngineCompatibility(
  constraint: string,
  engineVersion = CORE_ENGINE_VERSION
): { compatible: boolean; note: string } {
  const [eMaj, eMin, ePat] = parseSemver(engineVersion);
  const trimmed = constraint.trim();

  if (trimmed === '*' || trimmed === 'latest') {
    return { compatible: true, note: `Compatible with DevMind Studio ${engineVersion}` };
  }

  if (trimmed.startsWith('^')) {
    const [cMaj, cMin, cPat] = parseSemver(trimmed.slice(1));
    const ok =
      eMaj === cMaj &&
      (eMin > cMin || (eMin === cMin && ePat >= cPat));
    return ok
      ? { compatible: true, note: `Compatible (${trimmed} satisfies ${engineVersion})` }
      : {
          compatible: false,
          note: `Incompatible engine: requires DevMind ${trimmed}, current core is ${engineVersion}`,
        };
  }

  if (trimmed.startsWith('>=')) {
    const [cMaj, cMin, cPat] = parseSemver(trimmed.slice(2));
    const ok =
      eMaj > cMaj ||
      (eMaj === cMaj && (eMin > cMin || (eMin === cMin && ePat >= cPat)));
    return ok
      ? { compatible: true, note: `Compatible (${trimmed} satisfies ${engineVersion})` }
      : {
          compatible: false,
          note: `Incompatible engine: requires DevMind ${trimmed}, current core is ${engineVersion}`,
        };
  }

  const [cMaj, cMin] = parseSemver(trimmed);
  const ok = eMaj === cMaj && eMin === cMin;
  return ok
    ? { compatible: true, note: `Exact version match (${engineVersion})` }
    : {
        compatible: false,
        note: `Requires DevMind ${trimmed}, current core is ${engineVersion}`,
      };
}

export const MARKETPLACE_CATALOG: ExtensionManifest[] = [
  {
    id: 'devmind.ast-core',
    name: 'ast-core',
    displayName: 'Core AST Analysis Runtime',
    publisher: 'DevMind Systems',
    verifiedPublisher: true,
    version: '2.1.0',
    description: 'Shared syntax tree & symbol graph runtime used by linter and refactoring extensions.',
    longDescription:
      'Provides lightweight, incremental TypeScript/JavaScript structural parsing hooks and symbol metadata caching to dependent extensions via the Extension Host service bus.',
    category: 'Runtime',
    engines: { devmind: '^2.0.0' },
    downloads: 148200,
    rating: 4.9,
    repositoryUrl: 'https://github.com/devmind-studio/ext-ast-core',
    license: 'MIT',
    permissions: ['workspace.read', 'events.subscribe', 'ui.commands'],
    activationEvents: ['onStartupFinished'],
    extensionDependencies: [],
    contributes: {
      commands: [
        {
          id: 'devmind.ast.inspectSummary',
          title: 'AST Runtime: Print Workspace Symbol Summary',
          category: 'AST Runtime',
          description: 'Computes symbol distribution and module fan-in across the active workspace.',
        },
      ],
    },
  },
  {
    id: 'devmind.code-formatter',
    name: 'code-formatter',
    displayName: 'Prettier-Style Code Formatter',
    publisher: 'DevMind Systems',
    verifiedPublisher: true,
    version: '3.4.1',
    description: 'Formats TypeScript, JavaScript, JSON, and CSS files with deterministic 2-space indentation.',
    longDescription:
      'Connects directly to the workspace file API to normalize line endings (LF), trim trailing whitespace, format JSON documents, collapse redundant blank lines, and ensure clean EOF newlines.',
    category: 'Formatters',
    engines: { devmind: '^2.0.0' },
    downloads: 942100,
    rating: 4.9,
    repositoryUrl: 'https://github.com/devmind-studio/ext-code-formatter',
    license: 'MIT',
    permissions: ['workspace.read', 'workspace.write', 'ui.commands', 'ui.statusbar'],
    activationEvents: ['onLanguage:typescript', 'onCommand:devmind.formatter.formatDocument'],
    extensionDependencies: [],
    contributes: {
      statusBar: true,
      commands: [
        {
          id: 'devmind.formatter.formatDocument',
          title: 'Format Active Document',
          category: 'Formatter',
          description: 'Applies deterministic whitespace, newline, and JSON/code formatting to the open file.',
          requiresActiveFile: true,
          mutatesFile: true,
        },
      ],
    },
  },
  {
    id: 'devmind.import-organizer',
    name: 'import-organizer',
    displayName: 'Import Organizer & Deduplicator',
    publisher: 'Studio Tools',
    verifiedPublisher: true,
    version: '1.8.0',
    description: 'Automatically groups and sorts Node built-ins, package imports, and relative imports.',
    longDescription:
      'Uses the Core AST Analysis Runtime to group top-of-file ES module imports into canonical sections (node:* built-ins, external packages, relative modules) and removes exact duplicate import lines.',
    category: 'Formatters',
    engines: { devmind: '^2.0.0' },
    downloads: 312400,
    rating: 4.8,
    repositoryUrl: 'https://github.com/devmind-studio/ext-import-organizer',
    license: 'Apache-2.0',
    permissions: ['workspace.read', 'workspace.write', 'ui.commands'],
    activationEvents: ['onCommand:devmind.imports.organize'],
    extensionDependencies: ['devmind.ast-core'],
    contributes: {
      commands: [
        {
          id: 'devmind.imports.organize',
          title: 'Organize & Sort Imports in Active File',
          category: 'Imports',
          description: 'Groups node:, external, and relative imports alphabetically and removes duplicates.',
          requiresActiveFile: true,
          mutatesFile: true,
        },
      ],
    },
  },
  {
    id: 'devmind.todo-tracker',
    name: 'todo-tracker',
    displayName: 'TODO, BUG & FIXME Explorer',
    publisher: 'DevMind Systems',
    verifiedPublisher: true,
    version: '2.3.4',
    description: 'Scans repository files in real time for TODO, FIXME, BUG, and VULNERABILITY annotations.',
    longDescription:
      'Listens to workspace save and project switch events, indexing inline engineering annotations and publishing live clickable diagnostics to the Problems panel and Windows status bar.',
    category: 'Productivity',
    engines: { devmind: '^2.0.0' },
    downloads: 518900,
    rating: 4.8,
    repositoryUrl: 'https://github.com/devmind-studio/ext-todo-tracker',
    license: 'MIT',
    permissions: ['workspace.read', 'editor.diagnostics', 'ui.commands', 'ui.statusbar', 'events.subscribe'],
    activationEvents: ['onStartupFinished', 'onFileSave'],
    extensionDependencies: [],
    contributes: {
      statusBar: true,
      diagnostics: true,
      commands: [
        {
          id: 'devmind.todo.scanWorkspace',
          title: 'Scan Workspace for TODO / BUG Comments',
          category: 'TODO Explorer',
          description: 'Re-scans every source file and refreshes Problems panel annotations.',
        },
      ],
    },
  },
  {
    id: 'devmind.complexity-lens',
    name: 'complexity-lens',
    displayName: 'Code Complexity & Maintainability Lens',
    publisher: 'MetricWorks',
    verifiedPublisher: true,
    version: '1.5.2',
    description: 'Calculates cyclomatic complexity and long-function diagnostics across every module.',
    longDescription:
      'Builds on Core AST Analysis Runtime to evaluate branching complexity (if/else, loops, ternary, catch, logical operators) and flag high-complexity functions directly inside the Problems view.',
    category: 'Linters',
    engines: { devmind: '^2.0.0' },
    downloads: 224700,
    rating: 4.7,
    repositoryUrl: 'https://github.com/devmind-studio/ext-complexity-lens',
    license: 'MIT',
    permissions: ['workspace.read', 'editor.diagnostics', 'ui.commands', 'ui.statusbar', 'events.subscribe'],
    activationEvents: ['onWorkspaceContains:*.ts', 'onFileSave'],
    extensionDependencies: ['devmind.ast-core'],
    contributes: {
      statusBar: true,
      diagnostics: true,
      commands: [
        {
          id: 'devmind.complexity.analyzeWorkspace',
          title: 'Run Complexity Audit Across Workspace',
          category: 'Complexity',
          description: 'Measures cyclomatic complexity and emits warnings for complex functions.',
        },
      ],
    },
  },
  {
    id: 'devmind.env-guard',
    name: 'env-guard',
    displayName: 'Env & Secret Hygiene Guard',
    publisher: 'SecOps Guild',
    verifiedPublisher: true,
    version: '2.0.3',
    description: 'Detects unsafe process.env fallback secrets and credential logging on every save.',
    longDescription:
      'Subscribes to file save lifecycle hooks to catch hardcoded default secrets in process.env expressions and console credential leaks before code leaves your workstation.',
    category: 'Security',
    engines: { devmind: '^2.0.0' },
    downloads: 389100,
    rating: 4.9,
    repositoryUrl: 'https://github.com/devmind-studio/ext-env-guard',
    license: 'MIT',
    permissions: ['workspace.read', 'editor.diagnostics', 'ui.commands', 'events.subscribe', 'security.hooks'],
    activationEvents: ['onStartupFinished', 'onFileSave'],
    extensionDependencies: [],
    contributes: {
      diagnostics: true,
      commands: [
        {
          id: 'devmind.envguard.scan',
          title: 'Audit Environment Variable Fallbacks',
          category: 'Env Guard',
          description: 'Scans workspace files for hardcoded env fallbacks and console secret logging.',
        },
      ],
    },
  },
  {
    id: 'devmind.spdx-headers',
    name: 'spdx-headers',
    displayName: 'SPDX License Header Manager',
    publisher: 'Studio Tools',
    verifiedPublisher: true,
    version: '1.2.0',
    description: 'Inserts standardized Apache-2.0 or MIT SPDX headers into source files with one command.',
    longDescription:
      'Ensures enterprise license compliance by prepending standardized SPDX-License-Identifier headers to TypeScript and JavaScript source modules without duplicating existing headers.',
    category: 'Productivity',
    engines: { devmind: '^2.0.0' },
    downloads: 91300,
    rating: 4.6,
    repositoryUrl: 'https://github.com/devmind-studio/ext-spdx-headers',
    license: 'Apache-2.0',
    permissions: ['workspace.read', 'workspace.write', 'ui.commands'],
    activationEvents: ['onCommand:devmind.spdx.insertHeader'],
    extensionDependencies: [],
    contributes: {
      commands: [
        {
          id: 'devmind.spdx.insertHeader',
          title: 'Insert SPDX License Header in Active File',
          category: 'License',
          description: 'Prepends a standard SPDX Apache-2.0 header if not already present.',
          requiresActiveFile: true,
          mutatesFile: true,
        },
      ],
    },
  },
  {
    id: 'devmind.json-validator',
    name: 'json-validator',
    displayName: 'JSON & Manifest Validator',
    publisher: 'DevMind Systems',
    verifiedPublisher: true,
    version: '2.0.0',
    description: 'Validates JSON syntax across config files and pretty-prints package manifests.',
    longDescription:
      'Monitors every .json document in your repository on activation and file save, reporting exact syntax errors to the Problems pane and providing instant 2-space pretty formatting.',
    category: 'Linters',
    engines: { devmind: '^2.0.0' },
    downloads: 467800,
    rating: 4.8,
    repositoryUrl: 'https://github.com/devmind-studio/ext-json-validator',
    license: 'MIT',
    permissions: ['workspace.read', 'workspace.write', 'editor.diagnostics', 'ui.commands', 'events.subscribe'],
    activationEvents: ['onWorkspaceContains:*.json', 'onFileSave'],
    extensionDependencies: [],
    contributes: {
      diagnostics: true,
      commands: [
        {
          id: 'devmind.json.validateAll',
          title: 'Validate All JSON Config Files',
          category: 'JSON Validator',
          description: 'Parses all JSON files in the active project and reports syntax diagnostics.',
        },
      ],
    },
  },
  {
    id: 'devmind.legacy-xml-bridge',
    name: 'legacy-xml-bridge',
    displayName: 'Legacy XML Schema Bridge (v1 Engine)',
    publisher: 'Community Archive',
    verifiedPublisher: false,
    version: '0.9.4',
    description: 'Legacy v1.x XML schema inspector (requires DevMind Studio ^1.0.0 — incompatible with v2.1).',
    longDescription:
      'Archived XML DTD inspector written for the legacy DevMind Studio v1.x extension API. Retained in the catalog to demonstrate strict engine semver compatibility gating.',
    category: 'Navigation',
    engines: { devmind: '^1.0.0' },
    downloads: 12400,
    rating: 3.4,
    repositoryUrl: 'https://github.com/devmind-studio/legacy-xml-bridge',
    license: 'MIT',
    permissions: ['workspace.read', 'ui.commands'],
    activationEvents: ['onLanguage:xml'],
    extensionDependencies: [],
    contributes: {
      commands: [],
    },
  },
];

export interface PersistedExtensionRecord {
  id: string;
  installed: boolean;
  enabled: boolean;
  installedAt: string;
}

export interface ExtensionCoreBridge {
  getProject: (projectId: string) => Project;
  saveFile: (projectId: string, filePath: string, content: string) => Project;
}

export interface CommandExecutionResult {
  ok: boolean;
  extensionId: string;
  commandId: string;
  message: string;
  mutatedFilePath?: string;
  diagnosticsCount?: number;
  project?: Project;
  snapshot: ExtensionHostSnapshot;
}

/**
 * VS Code-inspired Extension Host runtime.
 * Manages installation, engine semver checks, dependency resolution,
 * lifecycle activation/deactivation, scoped permission checks, event bus hooks,
 * diagnostics, status bar contributions, and command execution.
 */
export class ExtensionHost {
  private installedMap = new Map<
    string,
    {
      installedAt: string;
      enabled: boolean;
      activatedAt?: string;
      activationDurationMs?: number;
      state: ExtensionLifecycleState;
      lastError?: string;
    }
  >();

  private diagnosticsByExt = new Map<string, ExtensionDiagnostic[]>();
  private statusBarByExt = new Map<string, ExtensionStatusBarItem[]>();
  private runtimeLogs: ExtensionRuntimeLog[] = [];

  constructor() {
    // Pre-install two essential, helpful default extensions on a fresh workspace
    this.seedDefaultExtensions();
  }

  private seedDefaultExtensions(): void {
    const now = new Date().toISOString();
    const defaults = ['devmind.code-formatter', 'devmind.todo-tracker'];
    for (const id of defaults) {
      this.installedMap.set(id, {
        installedAt: now,
        enabled: true,
        state: 'installed',
      });
    }
    this.appendLog('host', 'info', 'host.boot', `Extension Host initialized (core engine v${CORE_ENGINE_VERSION}).`);
  }

  public exportPersistedState(): PersistedExtensionRecord[] {
    return Array.from(this.installedMap.entries()).map(([id, rec]) => ({
      id,
      installed: true,
      enabled: rec.enabled,
      installedAt: rec.installedAt,
    }));
  }

  public hydratePersistedState(records: PersistedExtensionRecord[] | undefined): void {
    if (!Array.isArray(records) || records.length === 0) return;
    this.installedMap.clear();
    this.diagnosticsByExt.clear();
    this.statusBarByExt.clear();
    for (const rec of records) {
      const manifest = MARKETPLACE_CATALOG.find((m) => m.id === rec.id);
      if (!manifest) continue;
      const compat = checkEngineCompatibility(manifest.engines.devmind);
      this.installedMap.set(rec.id, {
        installedAt: rec.installedAt || new Date().toISOString(),
        enabled: compat.compatible && Boolean(rec.enabled),
        state: !compat.compatible ? 'incompatible' : rec.enabled ? 'installed' : 'disabled',
      });
    }
  }

  private appendLog(
    extensionId: string,
    level: ExtensionRuntimeLog['level'],
    event: string,
    message: string
  ): void {
    this.runtimeLogs.unshift({
      id: uid('xlog'),
      timestamp: new Date().toISOString(),
      extensionId,
      level,
      event,
      message,
    });
    if (this.runtimeLogs.length > 120) {
      this.runtimeLogs.pop();
    }
  }

  private assertPermission(manifest: ExtensionManifest, perm: ExtensionPermission): void {
    if (!manifest.permissions.includes(perm)) {
      const msg = `Permission denied: "${manifest.id}" attempted "${perm}" without declaration in manifest.`;
      this.appendLog(manifest.id, 'error', 'permission.denied', msg);
      throw new Error(msg);
    }
  }

  public getManifest(extensionId: string): ExtensionManifest {
    const manifest = MARKETPLACE_CATALOG.find((m) => m.id === extensionId);
    if (!manifest) {
      throw new Error(`Extension not found in marketplace catalog: ${extensionId}`);
    }
    return manifest;
  }

  public getActiveDependents(extensionId: string): string[] {
    const dependents: string[] = [];
    for (const [id, rec] of this.installedMap.entries()) {
      if (!rec.enabled) continue;
      const m = MARKETPLACE_CATALOG.find((x) => x.id === id);
      if (m && m.extensionDependencies.includes(extensionId)) {
        dependents.push(id);
      }
    }
    return dependents;
  }

  public getInstalledDependents(extensionId: string): string[] {
    const dependents: string[] = [];
    for (const id of this.installedMap.keys()) {
      const m = MARKETPLACE_CATALOG.find((x) => x.id === id);
      if (m && m.extensionDependencies.includes(extensionId)) {
        dependents.push(id);
      }
    }
    return dependents;
  }

  /**
   * Installs an extension, checking engine compatibility and recursively installing required dependencies.
   */
  public installExtension(
    extensionId: string,
    activeProject?: Project
  ): { installedIds: string[]; record: ExtensionRecord } {
    const manifest = this.getManifest(extensionId);
    const compat = checkEngineCompatibility(manifest.engines.devmind);
    if (!compat.compatible) {
      this.appendLog(extensionId, 'error', 'install.rejected', compat.note);
      throw new Error(compat.note);
    }

    const installedIds: string[] = [];

    // Resolve and install dependencies first (VS Code extension pack / dependency resolution)
    for (const depId of manifest.extensionDependencies) {
      const depRec = this.installedMap.get(depId);
      if (!depRec) {
        const sub = this.installExtension(depId, activeProject);
        installedIds.push(...sub.installedIds);
      } else if (!depRec.enabled) {
        depRec.enabled = true;
        depRec.state = 'installed';
        this.appendLog(depId, 'info', 'dependency.enabled', `Auto-enabled dependency required by ${extensionId}.`);
      }
    }

    if (!this.installedMap.has(extensionId)) {
      this.installedMap.set(extensionId, {
        installedAt: new Date().toISOString(),
        enabled: true,
        state: 'installed',
      });
      installedIds.push(extensionId);
      this.appendLog(
        extensionId,
        'info',
        'extension.installed',
        `Installed ${manifest.displayName} v${manifest.version} (${manifest.permissions.length} permission scope(s)).`
      );
    }

    if (activeProject) {
      this.activateExtension(extensionId, activeProject, 'onInstall');
    }

    const snap = this.getSnapshot(activeProject);
    const record = snap.extensions.find((e) => e.manifest.id === extensionId)!;
    return { installedIds, record };
  }

  public uninstallExtension(
    extensionId: string,
    cascade = false,
    activeProject?: Project
  ): { uninstalledIds: string[] } {
    if (!this.installedMap.has(extensionId)) {
      throw new Error(`Extension "${extensionId}" is not installed.`);
    }

    const dependents = this.getInstalledDependents(extensionId);
    if (dependents.length > 0 && !cascade) {
      throw new Error(
        `Cannot uninstall "${extensionId}" because it is required by: ${dependents.join(', ')}. Uninstall dependents first or confirm cascade uninstall.`
      );
    }

    const uninstalledIds: string[] = [];
    if (cascade) {
      for (const dep of dependents) {
        if (this.installedMap.has(dep)) {
          const sub = this.uninstallExtension(dep, true, activeProject);
          uninstalledIds.push(...sub.uninstalledIds);
        }
      }
    }

    this.deactivateExtension(extensionId, 'onUninstall');
    this.installedMap.delete(extensionId);
    uninstalledIds.push(extensionId);
    this.appendLog(extensionId, 'info', 'extension.uninstalled', `Uninstalled ${extensionId} and disposed runtime resources.`);
    return { uninstalledIds };
  }

  public toggleExtension(
    extensionId: string,
    enabled: boolean,
    activeProject?: Project
  ): ExtensionRecord {
    const rec = this.installedMap.get(extensionId);
    if (!rec) {
      throw new Error(`Extension "${extensionId}" is not installed.`);
    }
    const manifest = this.getManifest(extensionId);

    if (enabled) {
      const compat = checkEngineCompatibility(manifest.engines.devmind);
      if (!compat.compatible) {
        throw new Error(compat.note);
      }
      // Ensure dependencies are installed and enabled
      for (const depId of manifest.extensionDependencies) {
        const depRec = this.installedMap.get(depId);
        if (!depRec) {
          this.installExtension(depId, activeProject);
        } else if (!depRec.enabled) {
          this.toggleExtension(depId, true, activeProject);
        }
      }
      rec.enabled = true;
      rec.state = 'installed';
      this.appendLog(extensionId, 'info', 'extension.enabled', `Enabled ${manifest.displayName}.`);
      if (activeProject) {
        this.activateExtension(extensionId, activeProject, 'onEnable');
      }
    } else {
      const activeDeps = this.getActiveDependents(extensionId);
      if (activeDeps.length > 0) {
        throw new Error(
          `Cannot disable "${extensionId}" while active dependents require it: ${activeDeps.join(', ')}.`
        );
      }
      this.deactivateExtension(extensionId, 'onDisable');
      rec.enabled = false;
      rec.state = 'disabled';
      this.appendLog(extensionId, 'info', 'extension.disabled', `Disabled ${manifest.displayName}.`);
    }

    const snap = this.getSnapshot(activeProject);
    return snap.extensions.find((e) => e.manifest.id === extensionId)!;
  }

  public activateExtension(extensionId: string, project: Project, trigger: string): void {
    const rec = this.installedMap.get(extensionId);
    if (!rec || !rec.enabled) return;

    const manifest = this.getManifest(extensionId);
    const compat = checkEngineCompatibility(manifest.engines.devmind);
    if (!compat.compatible) {
      rec.state = 'incompatible';
      return;
    }

    // Activate dependencies first
    for (const depId of manifest.extensionDependencies) {
      const depRec = this.installedMap.get(depId);
      if (depRec && depRec.enabled && depRec.state !== 'active') {
        this.activateExtension(depId, project, `dependencyOf:${extensionId}`);
      }
    }

    const startedAt = Date.now();
    try {
      this.runExtensionAnalysisHook(manifest, project);
      rec.state = 'active';
      rec.activatedAt = new Date().toISOString();
      rec.activationDurationMs = Math.max(1, Date.now() - startedAt);
      rec.lastError = undefined;
      this.appendLog(
        extensionId,
        'info',
        `activation:${trigger}`,
        `Activated ${manifest.displayName} v${manifest.version} in ${rec.activationDurationMs}ms.`
      );
    } catch (err) {
      rec.state = 'error';
      rec.lastError = err instanceof Error ? err.message : 'Activation error';
      this.appendLog(extensionId, 'error', 'activation.error', rec.lastError);
    }
  }

  public deactivateExtension(extensionId: string, reason: string): void {
    this.diagnosticsByExt.delete(extensionId);
    this.statusBarByExt.delete(extensionId);
    const rec = this.installedMap.get(extensionId);
    if (rec && rec.state === 'active') {
      rec.state = rec.enabled ? 'installed' : 'disabled';
      this.appendLog(extensionId, 'info', `deactivation:${reason}`, `Deactivated ${extensionId} and cleared diagnostics/status items.`);
    }
  }

  /**
   * Core -> Extension event dispatcher (called on workspace open, project switch, file save, reindex).
   */
  public dispatchWorkspaceEvent(
    eventType: 'onStartupFinished' | 'onProjectChanged' | 'onFileSave' | 'onWorkspaceReindexed',
    project: Project,
    changedFilePath?: string
  ): void {
    for (const [extId, rec] of this.installedMap.entries()) {
      if (!rec.enabled) continue;
      const manifest = MARKETPLACE_CATALOG.find((m) => m.id === extId);
      if (!manifest) continue;

      const shouldTrigger =
        rec.state === 'active' ||
        manifest.activationEvents.includes('onStartupFinished') ||
        manifest.activationEvents.includes(eventType) ||
        (manifest.activationEvents.some((ev) => ev.startsWith('onWorkspaceContains:')) &&
          project.files.length > 0) ||
        (manifest.activationEvents.includes('onLanguage:typescript') &&
          project.files.some((f) => f.language === 'typescript'));

      if (shouldTrigger) {
        if (rec.state !== 'active') {
          this.activateExtension(extId, project, eventType);
        } else if (manifest.permissions.includes('events.subscribe') || manifest.contributes.diagnostics || manifest.contributes.statusBar) {
          this.runExtensionAnalysisHook(manifest, project);
          if (eventType === 'onFileSave' && changedFilePath && manifest.permissions.includes('events.subscribe')) {
            this.appendLog(
              extId,
              'info',
              'event.onFileSave',
              `Processed save event for ${changedFilePath}.`
            );
          }
        }
      }
    }
  }

  /**
   * Executes real workspace inspection / status bar contributions for active extensions.
   */
  private runExtensionAnalysisHook(manifest: ExtensionManifest, project: Project): void {
    if (manifest.id === 'devmind.code-formatter') {
      this.assertPermission(manifest, 'ui.statusbar');
      this.statusBarByExt.set(manifest.id, [
        {
          id: 'sb.formatter',
          extensionId: manifest.id,
          text: 'Formatter: Ready',
          tooltip: 'Click to format the currently open file (2-space indent, LF)',
          alignment: 'right',
          priority: 20,
          commandId: 'devmind.formatter.formatDocument',
        },
      ]);
      return;
    }

    if (manifest.id === 'devmind.todo-tracker') {
      this.assertPermission(manifest, 'workspace.read');
      this.assertPermission(manifest, 'editor.diagnostics');
      const diags: ExtensionDiagnostic[] = [];
      const pattern = /\b(TODO|FIXME|BUG|VULNERABILITY|HACK)\b\s*[:(]?(.*)$/i;
      for (const file of project.files) {
        const lines = file.content.split('\n');
        lines.forEach((lineText, idx) => {
          const match = lineText.match(pattern);
          if (match) {
            const tag = match[1].toUpperCase();
            diags.push({
              id: `${manifest.id}:${file.path}:${idx + 1}`,
              extensionId: manifest.id,
              source: 'TODO Explorer',
              filePath: file.path,
              line: idx + 1,
              severity: tag === 'VULNERABILITY' || tag === 'BUG' ? 'warning' : 'info',
              code: tag,
              message: `${tag}: ${(match[2] || lineText.trim()).trim()}`,
            });
          }
        });
      }
      this.diagnosticsByExt.set(manifest.id, diags);
      this.statusBarByExt.set(manifest.id, [
        {
          id: 'sb.todo',
          extensionId: manifest.id,
          text: `Annotations: ${diags.length}`,
          tooltip: `${diags.length} TODO/BUG/FIXME annotations indexed across ${project.name}`,
          alignment: 'left',
          priority: 30,
          commandId: 'devmind.todo.scanWorkspace',
        },
      ]);
      return;
    }

    if (manifest.id === 'devmind.complexity-lens') {
      this.assertPermission(manifest, 'workspace.read');
      this.assertPermission(manifest, 'editor.diagnostics');
      const diags: ExtensionDiagnostic[] = [];
      let maxComplexity = 1;
      for (const sym of project.symbols) {
        if (sym.kind !== 'function' && sym.kind !== 'method') continue;
        const file = project.files.find((f) => f.path === sym.filePath);
        if (!file) continue;
        const snippet = file.content.split('\n').slice(sym.startLine - 1, sym.endLine).join('\n');
        const branches = (snippet.match(/\b(if|else if|for|while|case|catch)\b|&&|\|\||\?/g) ?? []).length;
        const complexity = 1 + branches;
        if (complexity > maxComplexity) maxComplexity = complexity;
        if (complexity >= 5 || sym.endLine - sym.startLine >= 35) {
          diags.push({
            id: `${manifest.id}:${sym.filePath}:${sym.startLine}`,
            extensionId: manifest.id,
            source: 'Complexity Lens',
            filePath: sym.filePath,
            line: sym.startLine,
            severity: complexity >= 8 ? 'warning' : 'info',
            code: `CC-${complexity}`,
            message: `Function "${sym.name}" has cyclomatic complexity ${complexity} (${sym.endLine - sym.startLine + 1} lines).`,
          });
        }
      }
      this.diagnosticsByExt.set(manifest.id, diags);
      this.statusBarByExt.set(manifest.id, [
        {
          id: 'sb.complexity',
          extensionId: manifest.id,
          text: `Max CC: ${maxComplexity}`,
          tooltip: `Highest cyclomatic complexity in ${project.name}: ${maxComplexity}`,
          alignment: 'left',
          priority: 25,
          commandId: 'devmind.complexity.analyzeWorkspace',
        },
      ]);
      return;
    }

    if (manifest.id === 'devmind.env-guard') {
      this.assertPermission(manifest, 'workspace.read');
      this.assertPermission(manifest, 'editor.diagnostics');
      const diags: ExtensionDiagnostic[] = [];
      for (const file of project.files) {
        const lines = file.content.split('\n');
        lines.forEach((lineText, idx) => {
          if (/process\.env\.[A-Z0-9_]+\s*\|\|\s*['"][^'"]{8,}['"]/.test(lineText)) {
            diags.push({
              id: `${manifest.id}:env:${file.path}:${idx + 1}`,
              extensionId: manifest.id,
              source: 'Env Guard',
              filePath: file.path,
              line: idx + 1,
              severity: 'error',
              code: 'ENV-FALLBACK',
              message: 'Hardcoded fallback literal in process.env expression. Fail closed when secret env var is unset.',
            });
          } else if (/console\.log\([^)]*(token|secret|password|apikey)/i.test(lineText)) {
            diags.push({
              id: `${manifest.id}:log:${file.path}:${idx + 1}`,
              extensionId: manifest.id,
              source: 'Env Guard',
              filePath: file.path,
              line: idx + 1,
              severity: 'warning',
              code: 'LOG-CREDENTIAL',
              message: 'Sensitive credential identifier logged to stdout via console.log.',
            });
          }
        });
      }
      this.diagnosticsByExt.set(manifest.id, diags);
      return;
    }

    if (manifest.id === 'devmind.json-validator') {
      this.assertPermission(manifest, 'workspace.read');
      this.assertPermission(manifest, 'editor.diagnostics');
      const diags: ExtensionDiagnostic[] = [];
      for (const file of project.files) {
        if (!file.path.endsWith('.json')) continue;
        try {
          JSON.parse(file.content);
        } catch (err) {
          diags.push({
            id: `${manifest.id}:json:${file.path}`,
            extensionId: manifest.id,
            source: 'JSON Validator',
            filePath: file.path,
            line: 1,
            severity: 'error',
            code: 'JSON-SYNTAX',
            message: err instanceof Error ? err.message : 'Invalid JSON syntax',
          });
        }
      }
      this.diagnosticsByExt.set(manifest.id, diags);
    }
  }

  /**
   * Executes a real contributed command via the permission-checked Core API bridge.
   */
  public executeCommand(
    commandId: string,
    projectId: string,
    bridge: ExtensionCoreBridge,
    filePath?: string
  ): CommandExecutionResult {
    const manifest = MARKETPLACE_CATALOG.find((m) =>
      m.contributes.commands.some((c) => c.id === commandId)
    );
    if (!manifest) {
      throw new Error(`Command "${commandId}" is not registered by any extension.`);
    }

    const rec = this.installedMap.get(manifest.id);
    if (!rec || !rec.enabled) {
      throw new Error(`Extension "${manifest.displayName}" must be installed and enabled to run "${commandId}".`);
    }

    this.assertPermission(manifest, 'ui.commands');
    let project = bridge.getProject(projectId);

    // Lazy activation on command invocation (exact VS Code onCommand semantics)
    if (rec.state !== 'active') {
      this.activateExtension(manifest.id, project, `onCommand:${commandId}`);
    }

    let message = '';
    let mutatedFilePath: string | undefined;

    if (commandId === 'devmind.formatter.formatDocument') {
      this.assertPermission(manifest, 'workspace.read');
      this.assertPermission(manifest, 'workspace.write');
      const target = filePath ? project.files.find((f) => f.path === filePath) : project.files[0];
      if (!target) throw new Error('Open a file in the editor before formatting.');

      let formatted = target.content.replace(/\r\n/g, '\n');
      if (target.path.endsWith('.json')) {
        formatted = `${JSON.stringify(JSON.parse(formatted), null, 2)}\n`;
      } else {
        formatted =
          formatted
            .split('\n')
            .map((l) => l.replace(/\t/g, '  ').replace(/[ \t]+$/g, ''))
            .join('\n')
            .replace(/\n{3,}/g, '\n\n')
            .trimEnd() + '\n';
      }

      if (formatted !== target.content) {
        project = bridge.saveFile(projectId, target.path, formatted);
        mutatedFilePath = target.path;
        message = `Formatted ${target.path} (normalized whitespace, indentation & EOF newline).`;
      } else {
        message = `${target.path} is already cleanly formatted.`;
      }
    } else if (commandId === 'devmind.imports.organize') {
      this.assertPermission(manifest, 'workspace.read');
      this.assertPermission(manifest, 'workspace.write');
      const target = filePath ? project.files.find((f) => f.path === filePath) : project.files[0];
      if (!target) throw new Error('Open a TypeScript/JavaScript file to organize imports.');

      const lines = target.content.split('\n');
      const importLines: string[] = [];
      let firstNonImportIdx = 0;
      for (let i = 0; i < lines.length; i++) {
        const t = lines[i].trim();
        if (t.startsWith('import ') && t.endsWith(';')) {
          importLines.push(lines[i]);
          firstNonImportIdx = i + 1;
        } else if (t === '' && importLines.length > 0 && i === firstNonImportIdx) {
          firstNonImportIdx = i + 1;
        } else {
          break;
        }
      }

      if (importLines.length === 0) {
        message = `No top-level single-line ES imports found to sort in ${target.path}.`;
      } else {
        const unique = Array.from(new Set(importLines));
        const nodeImports = unique.filter((l) => /['"]node:/.test(l)).sort();
        const pkgImports = unique.filter((l) => !/['"]node:/.test(l) && !/['"]\./.test(l)).sort();
        const relImports = unique.filter((l) => /['"]\./.test(l)).sort();
        const sorted = [...nodeImports, ...pkgImports, ...relImports];
        const rest = lines.slice(firstNonImportIdx).join('\n').replace(/^\n+/, '');
        const nextContent = `${sorted.join('\n')}\n\n${rest}`;
        if (nextContent !== target.content) {
          project = bridge.saveFile(projectId, target.path, nextContent);
          mutatedFilePath = target.path;
          message = `Organized ${sorted.length} import statement(s) in ${target.path}.`;
        } else {
          message = `Imports in ${target.path} are already sorted.`;
        }
      }
    } else if (commandId === 'devmind.spdx.insertHeader') {
      this.assertPermission(manifest, 'workspace.read');
      this.assertPermission(manifest, 'workspace.write');
      const target = filePath ? project.files.find((f) => f.path === filePath) : project.files[0];
      if (!target) throw new Error('Open a source file to insert an SPDX header.');
      if (target.content.includes('SPDX-License-Identifier:')) {
        message = `${target.path} already includes an SPDX license header.`;
      } else {
        const header = `/**\n * @license\n * SPDX-License-Identifier: Apache-2.0\n */\n\n`;
        project = bridge.saveFile(projectId, target.path, header + target.content);
        mutatedFilePath = target.path;
        message = `Inserted SPDX Apache-2.0 header at top of ${target.path}.`;
      }
    } else if (commandId === 'devmind.todo.scanWorkspace') {
      this.runExtensionAnalysisHook(manifest, project);
      const count = (this.diagnosticsByExt.get(manifest.id) ?? []).length;
      message = `Indexed ${count} TODO/BUG/FIXME annotation(s) across ${project.files.length} files.`;
    } else if (commandId === 'devmind.complexity.analyzeWorkspace') {
      this.runExtensionAnalysisHook(manifest, project);
      const count = (this.diagnosticsByExt.get(manifest.id) ?? []).length;
      message = `Complexity audit finished across ${project.symbols.length} symbols (${count} warning/info item(s) published).`;
    } else if (commandId === 'devmind.envguard.scan') {
      this.runExtensionAnalysisHook(manifest, project);
      const count = (this.diagnosticsByExt.get(manifest.id) ?? []).length;
      message = `Env Guard scanned ${project.files.length} files and published ${count} hygiene finding(s).`;
    } else if (commandId === 'devmind.json.validateAll') {
      this.runExtensionAnalysisHook(manifest, project);
      const count = (this.diagnosticsByExt.get(manifest.id) ?? []).length;
      message =
        count === 0
          ? `All JSON configuration files in ${project.name} passed strict syntax validation.`
          : `JSON Validator detected ${count} syntax error(s) — check Problems panel.`;
    } else if (commandId === 'devmind.ast.inspectSummary') {
      const exported = project.symbols.filter((s) => s.exported).length;
      message = `AST Runtime: ${project.files.length} files, ${project.symbols.length} symbols (${exported} exported), ${project.architecture.edges.length} import edges.`;
    } else {
      message = `Executed command ${commandId}.`;
    }

    this.appendLog(manifest.id, 'info', `command:${commandId}`, message);

    return {
      ok: true,
      extensionId: manifest.id,
      commandId,
      message,
      mutatedFilePath,
      diagnosticsCount: (this.diagnosticsByExt.get(manifest.id) ?? []).length,
      project,
      snapshot: this.getSnapshot(project),
    };
  }

  public getSnapshot(project?: Project): ExtensionHostSnapshot {
    // Ensure startup extensions have run at least once on the active project
    if (project) {
      for (const [extId, rec] of this.installedMap.entries()) {
        if (rec.enabled && rec.state === 'installed') {
          const manifest = MARKETPLACE_CATALOG.find((m) => m.id === extId);
          if (manifest && manifest.activationEvents.some((e) => e === 'onStartupFinished' || e.startsWith('onWorkspaceContains') || e.startsWith('onLanguage'))) {
            this.activateExtension(extId, project, 'onStartupFinished');
          }
        }
      }
    }

    const extensions: ExtensionRecord[] = MARKETPLACE_CATALOG.map((manifest) => {
      const compat = checkEngineCompatibility(manifest.engines.devmind);
      const rec = this.installedMap.get(manifest.id);
      const missingDependencies = manifest.extensionDependencies.filter((dep) => {
        const d = this.installedMap.get(dep);
        return !d || !d.enabled;
      });
      const dependents = this.getInstalledDependents(manifest.id);

      let state: ExtensionLifecycleState = 'not_installed';
      if (!compat.compatible) {
        state = 'incompatible';
      } else if (rec) {
        state = rec.state;
      }

      return {
        manifest,
        installed: Boolean(rec),
        enabled: Boolean(rec?.enabled),
        state,
        compatible: compat.compatible,
        compatibilityNote: compat.note,
        installedAt: rec?.installedAt,
        activatedAt: rec?.activatedAt,
        activationDurationMs: rec?.activationDurationMs,
        missingDependencies,
        dependents,
        lastError: rec?.lastError,
      };
    });

    const activeCommands: ExtensionHostSnapshot['activeCommands'] = [];
    for (const ext of extensions) {
      if (ext.installed && ext.enabled && ext.compatible) {
        for (const cmd of ext.manifest.contributes.commands) {
          activeCommands.push({
            ...cmd,
            extensionId: ext.manifest.id,
            extensionName: ext.manifest.displayName,
          });
        }
      }
    }

    const statusBarItems = Array.from(this.statusBarByExt.values())
      .flat()
      .sort((a, b) => b.priority - a.priority);

    const diagnostics = Array.from(this.diagnosticsByExt.values()).flat();

    return {
      engineVersion: CORE_ENGINE_VERSION,
      extensions,
      activeCommands,
      statusBarItems,
      diagnostics,
      runtimeLogs: this.runtimeLogs.slice(0, 60),
    };
  }
}
