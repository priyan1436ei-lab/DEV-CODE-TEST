import 'dotenv/config';
import express from 'express';
import type http from 'node:http';
import path from 'node:path';
import { store, type RealtimeSyncEvent } from './server/agentOrchestrator.ts';
import { LLM_PROVIDER_PRESETS } from './server/modelGateway.ts';
import { hybridSearchRepository } from './server/repoBrain.ts';
import type { LlmProviderId, TaskPriority, UserLlmConfig } from './src/types/devmind.ts';

function extractBearerToken(req: express.Request): string | null {
  const header = req.headers.authorization;
  if (!header) return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

function getSessionLlmConfig(req: express.Request): UserLlmConfig {
  const token = extractBearerToken(req);
  const session = store.getSessionByToken(token);
  if (!session) {
    return {
      provider: 'openai',
      baseUrl: '',
      model: '',
      apiKey: '',
      configured: false,
    };
  }
  return session.llm;
}

export interface StartServerOptions {
  port?: number;
  host?: string;
  distDir?: string;
  dataDir?: string;
}

export async function startServer(
  options?: StartServerOptions
): Promise<{ server: http.Server; port: number }> {
  if (options?.dataDir) {
    store.reconfigureDataDir(options.dataDir);
  }

  const app = express();
  const PORT = Number(options?.port ?? process.env.PORT ?? 3000);
  const HOST = options?.host || process.env.HOST || '0.0.0.0';

  app.use(express.json({ limit: '10mb' }));

  // Health & Provider Presets
  app.get('/api/v1/health', (_req, res) => {
    res.json({ ok: true, service: 'devmind-studio-core', timestamp: new Date().toISOString() });
  });

  app.get('/api/v1/providers', (_req, res) => {
    res.json({ presets: LLM_PROVIDER_PRESETS });
  });

  // Real-Time Server-Sent Events Sync Stream
  app.get('/api/v1/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const sendEvent = (evt: RealtimeSyncEvent) => {
      res.write(`data: ${JSON.stringify(evt)}\n\n`);
    };

    res.write(`data: ${JSON.stringify({ type: 'connected', timestamp: new Date().toISOString() })}\n\n`);
    store.events.on('sync', sendEvent);

    const keepAlive = setInterval(() => {
      res.write(`: heartbeat\n\n`);
    }, 25000);

    req.on('close', () => {
      clearInterval(keepAlive);
      store.events.off('sync', sendEvent);
    });
  });

  // Auth & User-Provided BYOK LLM Session Management
  app.post('/api/v1/auth/test-llm', async (req, res) => {
    try {
      const { provider, baseUrl, model, apiKey } = req.body ?? {};
      const token = extractBearerToken(req);
      const activeSession = store.getSessionByToken(token);
      const resolvedKey =
        String(apiKey || '').trim() ||
        (activeSession && activeSession.llm.apiKey ? activeSession.llm.apiKey : '');
      const result = await store.gateway.testConnection({
        provider: (provider || 'openai') as LlmProviderId,
        baseUrl: String(baseUrl || ''),
        model: String(model || ''),
        apiKey: resolvedKey,
        configured: true,
      });
      res.json(result);
    } catch (err) {
      res.status(400).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Endpoint verification failed',
      });
    }
  });

  app.post('/api/v1/auth/login', (req, res) => {
    try {
      const { displayName, email, provider, baseUrl, model, apiKey, localWorkspaceOnly } = req.body ?? {};
      const preset =
        LLM_PROVIDER_PRESETS.find((p) => p.id === provider) ?? LLM_PROVIDER_PRESETS[0];

      const configured =
        !localWorkspaceOnly &&
        Boolean(String(baseUrl || preset.defaultBaseUrl).trim() && String(model || preset.defaultModel).trim());
      if (configured && preset.requiresKey && !String(apiKey || '').trim()) {
        return res.status(400).json({
          error: `Please enter your ${preset.name} API key, or choose "Open Local Workspace".`,
        });
      }

      const created = store.createSession({
        displayName: String(displayName || 'Developer'),
        email: String(email || 'developer@workspace.local'),
        llm: {
          provider: preset.id,
          baseUrl: String(baseUrl || preset.defaultBaseUrl),
          model: String(model || preset.defaultModel),
          apiKey: String(apiKey || ''),
          configured,
        },
      });
      res.status(201).json(created);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Sign-in failed' });
    }
  });

  app.get('/api/v1/auth/session', (req, res) => {
    const token = extractBearerToken(req);
    const rec = store.getSessionByToken(token);
    if (!rec) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    res.json({ session: store.toPublicSession(rec) });
  });

  app.put('/api/v1/auth/llm-config', (req, res) => {
    try {
      const token = extractBearerToken(req);
      if (!token) return res.status(401).json({ error: 'Not authenticated' });
      const { provider, baseUrl, model, apiKey } = req.body ?? {};
      const session = store.updateSessionLlm(token, {
        provider: (provider || 'openai') as LlmProviderId,
        baseUrl: String(baseUrl || ''),
        model: String(model || ''),
        apiKey: String(apiKey || ''),
        configured: true,
      });
      res.json({ session });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to update endpoint configuration' });
    }
  });

  app.post('/api/v1/auth/logout', (req, res) => {
    const token = extractBearerToken(req);
    if (token) store.deleteSession(token);
    res.json({ ok: true });
  });

  // Require valid authenticated session for all workspace API routes below
  const requireSession: express.RequestHandler = (req, res, next) => {
    const token = extractBearerToken(req);
    if (!store.getSessionByToken(token)) {
      return res.status(401).json({ error: 'Session required. Please sign in to access the workspace.' });
    }
    next();
  };

  app.use('/api/v1/projects', requireSession);
  app.use('/api/v1/extensions', requireSession);
  app.use('/api/v1/agent', requireSession);
  app.use('/api/v1/approvals', requireSession);
  app.use('/api/v1/policies', requireSession);
  app.use('/api/v1/billing', requireSession);
  app.use('/api/v1/audit', requireSession);

  // Projects & Repository Brain
  app.get('/api/v1/projects', (_req, res) => {
    res.json({ projects: store.listProjects() });
  });

  app.post('/api/v1/projects', (req, res) => {
    try {
      const { name, description, localPath, files } = req.body ?? {};
      if (!name || !Array.isArray(files) || files.length === 0) {
        return res.status(400).json({ error: 'Project name and at least one file are required.' });
      }
      const project = store.createProject({ name, description, localPath, files });
      res.status(201).json({ project });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to create project' });
    }
  });

  app.post('/api/v1/projects/:id/index', (req, res) => {
    try {
      const project = store.reindexProject(req.params.id);
      res.json({ project });
    } catch (err) {
      res.status(404).json({ error: err instanceof Error ? err.message : 'Project not found' });
    }
  });

  app.put('/api/v1/projects/:id/files', (req, res) => {
    try {
      const { path: filePath, content } = req.body ?? {};
      if (typeof filePath !== 'string' || typeof content !== 'string') {
        return res.status(400).json({ error: 'File path and content strings are required.' });
      }
      const project = store.upsertFile(req.params.id, filePath, content);
      res.json({ project });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to update file' });
    }
  });

  app.delete('/api/v1/projects/:id/files', (req, res) => {
    try {
      const filePath = String(req.body?.path || req.query.path || '');
      if (!filePath) {
        return res.status(400).json({ error: 'File path is required.' });
      }
      const project = store.deleteFile(req.params.id, filePath);
      res.json({ project });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to delete file' });
    }
  });

  app.delete('/api/v1/projects/:id', (req, res) => {
    try {
      store.deleteProject(req.params.id);
      res.json({ ok: true, projects: store.listProjects() });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to delete project' });
    }
  });

  app.get('/api/v1/projects/:id/architecture', (req, res) => {
    try {
      const project = store.getProject(req.params.id);
      res.json({ architecture: project.architecture });
    } catch (err) {
      res.status(404).json({ error: err instanceof Error ? err.message : 'Project not found' });
    }
  });

  app.post('/api/v1/projects/:id/search', (req, res) => {
    try {
      const project = store.getProject(req.params.id);
      const query = String(req.body?.query ?? '');
      const hits = hybridSearchRepository(query, project.chunks, project.architecture.edges, 12);
      res.json({ hits });
    } catch (err) {
      res.status(404).json({ error: err instanceof Error ? err.message : 'Search failed' });
    }
  });

  // Security Center
  app.get('/api/v1/projects/:id/security', (req, res) => {
    try {
      const findings = store.getSecurityFindings(req.params.id);
      res.json({ findings });
    } catch (err) {
      res.status(404).json({ error: err instanceof Error ? err.message : 'Security scan failed' });
    }
  });

  // Extensions Marketplace & Runtime Host
  app.get('/api/v1/extensions', (req, res) => {
    try {
      const projectId = req.query.projectId ? String(req.query.projectId) : undefined;
      const snapshot = store.getExtensionsSnapshot(projectId);
      res.json({ host: snapshot });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to load extensions' });
    }
  });

  app.post('/api/v1/extensions/:id/install', (req, res) => {
    try {
      const projectId = req.body?.projectId ? String(req.body.projectId) : undefined;
      const result = store.installExtension(req.params.id, projectId);
      res.json({ installedIds: result.installedIds, host: result.snapshot });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Extension installation failed' });
    }
  });

  app.post('/api/v1/extensions/:id/uninstall', (req, res) => {
    try {
      const cascade = Boolean(req.body?.cascade);
      const projectId = req.body?.projectId ? String(req.body.projectId) : undefined;
      const result = store.uninstallExtension(req.params.id, cascade, projectId);
      res.json({ uninstalledIds: result.uninstalledIds, host: result.snapshot });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Extension uninstall failed' });
    }
  });

  app.post('/api/v1/extensions/:id/toggle', (req, res) => {
    try {
      const enabled = Boolean(req.body?.enabled);
      const projectId = req.body?.projectId ? String(req.body.projectId) : undefined;
      const snapshot = store.toggleExtension(req.params.id, enabled, projectId);
      res.json({ host: snapshot });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to toggle extension' });
    }
  });

  app.post('/api/v1/extensions/:id/activate', (req, res) => {
    try {
      const projectId = req.body?.projectId ? String(req.body.projectId) : undefined;
      const snapshot = store.activateExtension(req.params.id, projectId);
      res.json({ host: snapshot });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to activate extension' });
    }
  });

  app.post('/api/v1/extensions/commands/execute', (req, res) => {
    try {
      const { commandId, projectId, filePath } = req.body ?? {};
      if (typeof commandId !== 'string' || typeof projectId !== 'string') {
        return res.status(400).json({ error: 'commandId and projectId are required.' });
      }
      const result = store.executeExtensionCommand(
        commandId,
        projectId,
        typeof filePath === 'string' ? filePath : undefined
      );
      res.json({
        ok: result.ok,
        extensionId: result.extensionId,
        commandId: result.commandId,
        message: result.message,
        mutatedFilePath: result.mutatedFilePath,
        project: result.project,
        host: result.snapshot,
      });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Command execution failed' });
    }
  });

  // Repository-Aware Chat
  app.get('/api/v1/projects/:id/chat', (req, res) => {
    try {
      store.getProject(req.params.id);
      res.json({ messages: store.chatHistories.get(req.params.id) ?? [] });
    } catch (err) {
      res.status(404).json({ error: err instanceof Error ? err.message : 'Project not found' });
    }
  });

  app.post('/api/v1/projects/:id/chat', async (req, res) => {
    try {
      const question = String(req.body?.message ?? '').trim();
      if (!question) {
        return res.status(400).json({ error: 'Message is required.' });
      }
      const llmConfig = getSessionLlmConfig(req);
      const reply = await store.repoChat(req.params.id, question, llmConfig);
      res.json({ reply, messages: store.chatHistories.get(req.params.id) ?? [] });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Repository chat failed' });
    }
  });

  // Debugging Center
  app.get('/api/v1/projects/:id/debug', (req, res) => {
    try {
      store.getProject(req.params.id);
      res.json({ analyses: store.debugAnalyses.get(req.params.id) ?? [] });
    } catch (err) {
      res.status(404).json({ error: err instanceof Error ? err.message : 'Project not found' });
    }
  });

  app.post('/api/v1/projects/:id/debug', async (req, res) => {
    try {
      const errorLog = String(req.body?.errorLog ?? '').trim();
      if (!errorLog) {
        return res.status(400).json({ error: 'Error log or stack trace is required.' });
      }
      const llmConfig = getSessionLlmConfig(req);
      const analysis = await store.analyzeDebugError(req.params.id, errorLog, llmConfig);
      res.json({ analysis });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Debug analysis failed' });
    }
  });

  // Engineering Tasks & Approvals
  app.get('/api/v1/agent/tasks', (req, res) => {
    const projectId = req.query.projectId ? String(req.query.projectId) : undefined;
    const priorityFilter = req.query.priority ? String(req.query.priority) : undefined;
    const all = Array.from(store.tasks.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    let filtered = projectId ? all.filter((t) => t.projectId === projectId) : all;
    if (priorityFilter === 'high' || priorityFilter === 'medium' || priorityFilter === 'low') {
      filtered = filtered.filter((t) => (t.priority ?? 'medium') === priorityFilter);
    }
    res.json({ tasks: filtered });
  });

  app.post('/api/v1/agent/tasks', async (req, res) => {
    try {
      const { projectId, title, description, executionMode, priority } = req.body ?? {};
      if (!projectId || !description) {
        return res.status(400).json({ error: 'projectId and description are required.' });
      }
      const validPriority: TaskPriority | undefined =
        priority === 'high' || priority === 'medium' || priority === 'low' ? priority : undefined;
      const llmConfig = getSessionLlmConfig(req);
      const task = await store.startAutonomousTask(
        {
          projectId,
          title: title || description.slice(0, 60),
          description,
          executionMode: executionMode === 'direct' ? 'direct' : 'approval',
          priority: validPriority,
        },
        llmConfig
      );
      res.status(201).json({ task, project: store.getProject(projectId) });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Task failed' });
    }
  });

  app.patch('/api/v1/agent/tasks/:id/priority', (req, res) => {
    try {
      const priority = req.body?.priority;
      if (priority !== 'high' && priority !== 'medium' && priority !== 'low') {
        return res.status(400).json({ error: 'Priority must be high, medium, or low.' });
      }
      const task = store.updateTaskPriority(req.params.id, priority);
      res.json({ task });
    } catch (err) {
      res.status(404).json({ error: err instanceof Error ? err.message : 'Failed to update task priority' });
    }
  });

  app.post('/api/v1/approvals/:id/decision', async (req, res) => {
    try {
      const decision = req.body?.decision === 'reject' ? 'reject' : 'approve';
      const task = await store.decideApproval(req.params.id, decision);
      const project = store.getProject(task.projectId);
      const securityFindings = store.getSecurityFindings(task.projectId);
      res.json({ task, project, securityFindings });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Approval decision failed' });
    }
  });

  app.post('/api/v1/agent/tasks/:id/rollback', (req, res) => {
    try {
      const task = store.rollbackTask(req.params.id);
      const project = store.getProject(task.projectId);
      const securityFindings = store.getSecurityFindings(task.projectId);
      res.json({ task, project, securityFindings });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Rollback failed' });
    }
  });

  app.post('/api/v1/agent/tasks/:id/cancel', (req, res) => {
    try {
      const task = store.cancelTask(req.params.id);
      res.json({ task });
    } catch (err) {
      res.status(404).json({ error: err instanceof Error ? err.message : 'Cancel failed' });
    }
  });

  // Policy Engine, Usage & Audit Logs
  app.get('/api/v1/policies', (_req, res) => {
    res.json({ policies: store.policies, presets: LLM_PROVIDER_PRESETS });
  });

  app.put('/api/v1/policies/:actionType', (req, res) => {
    const rule = store.policies.find((p) => p.actionType === req.params.actionType);
    if (!rule) return res.status(404).json({ error: 'Policy rule not found' });
    if (rule.actionType === 'access_secrets') {
      return res.status(403).json({ error: 'Secret access restriction cannot be disabled.' });
    }
    const level = req.body?.level;
    if (!['allowed', 'approval_required', 'explicit_approval', 'restricted'].includes(level)) {
      return res.status(400).json({ error: 'Invalid permission level' });
    }
    rule.level = level;
    store.logAudit({
      actor: 'developer',
      eventType: 'POLICY_CHECK',
      resourceType: 'policy',
      resourceId: rule.actionType,
      summary: `Updated permission policy "${rule.label}" -> ${level}.`,
    });
    store.emitSync('policy_updated');
    res.json({ policies: store.policies });
  });

  app.get('/api/v1/billing/usage', (_req, res) => {
    res.json({ usage: store.gateway.ledger, presets: LLM_PROVIDER_PRESETS });
  });

  app.put('/api/v1/billing/budget', (req, res) => {
    const monthlyBudgetUsd = Number(req.body?.monthlyBudgetUsd ?? 25);
    const monthlyTokenLimit = Number(req.body?.monthlyTokenLimit ?? 2_000_000);
    store.gateway.updateBudget(monthlyBudgetUsd, monthlyTokenLimit);
    store.emitSync('usage_updated');
    res.json({ usage: store.gateway.ledger });
  });

  app.get('/api/v1/audit', (_req, res) => {
    res.json({ auditLogs: store.auditLogs });
  });

  // Explicit 404 JSON guard so /api/* never falls through to Vite HTML
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'API endpoint not found.' });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vitePkg = 'vite';
    const viteMod = (await import(/* @vite-ignore */ vitePkg)) as typeof import('vite');
    const vite = await viteMod.createServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = options?.distDir
      ? path.resolve(options.distDir)
      : process.env.DEVMIND_DIST_DIR
      ? path.resolve(process.env.DEVMIND_DIST_DIR)
      : path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  return new Promise((resolve, reject) => {
    const server = app.listen(PORT, HOST, () => {
      const address = server.address();
      const boundPort = typeof address === 'object' && address ? address.port : PORT;
      console.log(`DevMind Studio listening on http://${HOST}:${boundPort}`);
      resolve({ server, port: boundPort });
    });
    server.on('error', reject);
  });
}

if (process.env.DEVMIND_EMBEDDED !== '1') {
  startServer().catch((err) => {
    console.error('DevMind Studio server failed to start:', err);
    process.exit(1);
  });
}
