import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import { store } from './server/agentOrchestrator.ts';
import { GATEWAY_PROVIDERS } from './server/modelGateway.ts';
import { hybridSearchRepository } from './server/repoBrain.ts';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '10mb' }));

  // Health endpoint
  app.get('/api/v1/health', (_req, res) => {
    res.json({ ok: true, service: 'devmind-ai-gateway', timestamp: new Date().toISOString() });
  });

  // Projects & Repository Brain (Section 12)
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

  // Security Center (M6)
  app.get('/api/v1/projects/:id/security', (req, res) => {
    try {
      const findings = store.getSecurityFindings(req.params.id);
      res.json({ findings });
    } catch (err) {
      res.status(404).json({ error: err instanceof Error ? err.message : 'Security scan failed' });
    }
  });

  // Isolated Sandbox Test Runner (M5 & Section 13)
  app.get('/api/v1/projects/:id/tests', (req, res) => {
    try {
      store.getProject(req.params.id);
      res.json({ testRuns: store.testRuns.get(req.params.id) ?? [] });
    } catch (err) {
      res.status(404).json({ error: err instanceof Error ? err.message : 'Project not found' });
    }
  });

  app.post('/api/v1/projects/:id/tests/run', async (req, res) => {
    try {
      const run = await store.executeSandboxTests(req.params.id);
      res.json({ testRun: run });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Sandbox run failed' });
    }
  });

  // Repository-Aware AI Chat (RAG)
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
      const reply = await store.repoChat(req.params.id, question);
      res.json({ reply, messages: store.chatHistories.get(req.params.id) ?? [] });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'AI chat failed' });
    }
  });

  // Debugging Center (M4)
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
      const analysis = await store.analyzeDebugError(req.params.id, errorLog);
      res.json({ analysis });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Debug analysis failed' });
    }
  });

  // Autonomous Agent Tasks & Approvals (M3 & Section 12)
  app.get('/api/v1/agent/tasks', (req, res) => {
    const projectId = req.query.projectId ? String(req.query.projectId) : undefined;
    const all = Array.from(store.tasks.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    const filtered = projectId ? all.filter((t) => t.projectId === projectId) : all;
    res.json({ tasks: filtered });
  });

  app.post('/api/v1/agent/tasks', async (req, res) => {
    try {
      const { projectId, title, description, executionMode } = req.body ?? {};
      if (!projectId || !description) {
        return res.status(400).json({ error: 'projectId and description are required.' });
      }
      const task = await store.startAutonomousTask({
        projectId,
        title: title || description.slice(0, 60),
        description,
        executionMode: executionMode === 'strict_sandbox' ? 'strict_sandbox' : 'approval',
      });
      res.status(201).json({ task, project: store.getProject(projectId) });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Agent task failed' });
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

  // Policy Engine, Billing/Usage & Immutable Audit Logs
  app.get('/api/v1/policies', (_req, res) => {
    res.json({ policies: store.policies, providers: GATEWAY_PROVIDERS });
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
    res.json({ policies: store.policies });
  });

  app.get('/api/v1/billing/usage', (_req, res) => {
    res.json({ usage: store.gateway.ledger, providers: GATEWAY_PROVIDERS });
  });

  app.put('/api/v1/billing/budget', (req, res) => {
    const monthlyBudgetUsd = Number(req.body?.monthlyBudgetUsd ?? 25);
    const monthlyTokenLimit = Number(req.body?.monthlyTokenLimit ?? 2_000_000);
    store.gateway.updateBudget(monthlyBudgetUsd, monthlyTokenLimit);
    res.json({ usage: store.gateway.ledger });
  });

  app.get('/api/v1/audit', (_req, res) => {
    res.json({ auditLogs: store.auditLogs });
  });

  // Mount Vite middleware in dev, or serve built dist/ in production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`DevMind AI listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
