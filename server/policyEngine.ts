import path from 'node:path';
import type { PermissionPolicyRule } from '../src/types/devmind.ts';

export const DEFAULT_PERMISSION_POLICIES: PermissionPolicyRule[] = [
  {
    actionType: 'read_files',
    label: 'Read workspace files',
    category: 'filesystem',
    level: 'allowed',
    description: 'Read source files inside the active project boundary.',
  },
  {
    actionType: 'search_code',
    label: 'Search repository brain',
    category: 'filesystem',
    level: 'allowed',
    description: 'Run hybrid lexical, symbol, and dependency graph queries.',
  },
  {
    actionType: 'edit_workspace_files',
    label: 'Apply multi-file code patches',
    category: 'filesystem',
    level: 'approval_required',
    description: 'Modify source files in workspace (creates rollback snapshot first).',
  },
  {
    actionType: 'install_extensions',
    label: 'Install & activate extensions',
    category: 'extensions',
    level: 'allowed',
    description: 'Install verified marketplace extensions with declared permission scopes.',
  },
  {
    actionType: 'install_dependencies',
    label: 'Install packages / dependencies',
    category: 'execution',
    level: 'approval_required',
    description: 'Modify dependency manifests or fetch registry packages.',
  },
  {
    actionType: 'arbitrary_shell',
    label: 'Execute arbitrary shell commands',
    category: 'execution',
    level: 'approval_required',
    description: 'Run commands outside standard workspace operations.',
  },
  {
    actionType: 'delete_files',
    label: 'Delete repository files',
    category: 'filesystem',
    level: 'approval_required',
    description: 'Remove files from the workspace tree.',
  },
  {
    actionType: 'push_remote',
    label: 'Push commits to remote Git',
    category: 'git',
    level: 'approval_required',
    description: 'Push local commits or branches to remote repositories.',
  },
  {
    actionType: 'deploy_production',
    label: 'Deploy to production',
    category: 'git',
    level: 'explicit_approval',
    description: 'Trigger production deployment pipelines.',
  },
  {
    actionType: 'access_secrets',
    label: 'Access host secrets & credentials',
    category: 'secrets',
    level: 'restricted',
    description: 'Hard-blocked. Secrets are never exposed to models or extensions.',
  },
];

export interface PolicyEvaluation {
  allowed: boolean;
  requiresApproval: boolean;
  blocked: boolean;
  reason: string;
}

export function evaluatePolicy(
  actionType: string,
  policies: PermissionPolicyRule[],
  targetPaths: string[] = []
): PolicyEvaluation {
  for (const p of targetPaths) {
    const normalized = path.posix.normalize(p.replace(/\\/g, '/'));
    if (normalized.startsWith('..') || normalized.startsWith('/') || normalized.includes('/../')) {
      return {
        allowed: false,
        requiresApproval: false,
        blocked: true,
        reason: `Blocked workspace escape attempt on path "${p}".`,
      };
    }
  }

  const rule = policies.find((r) => r.actionType === actionType);
  if (!rule) {
    return {
      allowed: false,
      requiresApproval: true,
      blocked: false,
      reason: `Unregistered action "${actionType}" requires explicit developer approval.`,
    };
  }

  if (rule.level === 'restricted') {
    return {
      allowed: false,
      requiresApproval: false,
      blocked: true,
      reason: `Policy violation: "${rule.label}" is strictly restricted.`,
    };
  }

  if (rule.level === 'approval_required' || rule.level === 'explicit_approval') {
    return {
      allowed: false,
      requiresApproval: true,
      blocked: false,
      reason: `Policy checkpoint: "${rule.label}" requires developer approval before execution.`,
    };
  }

  return {
    allowed: true,
    requiresApproval: false,
    blocked: false,
    reason: `Allowed within workspace policy (${rule.label}).`,
  };
}
