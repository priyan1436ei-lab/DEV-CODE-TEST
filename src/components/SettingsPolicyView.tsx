import React, { useState } from 'react';
import { Lock, Save } from 'lucide-react';
import type { ProviderInfo } from '../services/api';
import type { PermissionLevel, PermissionPolicyRule, UsageLedger } from '../types/devmind';

interface SettingsPolicyViewProps {
  policies: PermissionPolicyRule[];
  providers: ProviderInfo[];
  usage: UsageLedger | null;
  onUpdatePolicy: (actionType: string, level: PermissionLevel) => Promise<void>;
  onUpdateBudget: (monthlyBudgetUsd: number, monthlyTokenLimit: number) => Promise<void>;
}

export const SettingsPolicyView: React.FC<SettingsPolicyViewProps> = ({
  policies,
  providers,
  usage,
  onUpdatePolicy,
  onUpdateBudget,
}) => {
  const [budgetUsd, setBudgetUsd] = useState(String(usage?.monthlyBudgetUsd ?? 25));
  const [tokenLimit, setTokenLimit] = useState(String(usage?.monthlyTokenLimit ?? 2000000));
  const [savingBudget, setSavingBudget] = useState(false);

  const handleSaveBudget = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingBudget(true);
    try {
      await onUpdateBudget(Number(budgetUsd) || 25, Number(tokenLimit) || 2000000);
    } finally {
      setSavingBudget(false);
    }
  };

  return (
    <div className="h-full overflow-auto bg-[#0D0F14] p-6 space-y-6">
      <div className="border-b border-[#262B3A] pb-4">
        <h1 className="text-[20px] font-semibold text-[#E6E9F2] tracking-tight">
          Governance, Policy Engine & Usage Controls
        </h1>
        <p className="text-[13px] text-[#A3AABF] mt-1">
          Configure Section 10 tool permission checkpoints, inspect provider-agnostic Model Gateway routing, and set spending caps.
        </p>
      </div>

      {/* Section 10 Permission Policy Matrix */}
      <section className="bg-[#151821] border border-[#262B3A] rounded-[10px] overflow-hidden">
        <div className="px-5 py-3.5 border-b border-[#262B3A]">
          <h2 className="text-[15px] font-semibold text-[#E6E9F2]">
            Agent Permission Policy Matrix
          </h2>
          <p className="text-[12px] text-[#A3AABF] mt-0.5">
            Enforced server-side on every tool call before workspace mutation or sandbox execution.
          </p>
        </div>

        <div className="divide-y divide-[#262B3A]">
          {policies.map((rule) => {
            const isLocked = rule.actionType === 'access_secrets';
            return (
              <div
                key={rule.actionType}
                className="flex flex-wrap items-center justify-between gap-4 px-5 py-3 hover:bg-[#1C2030]/35"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-medium text-[#E6E9F2]">{rule.label}</span>
                    <span className="font-mono text-[11px] text-[#6B728A]">{rule.actionType}</span>
                  </div>
                  <p className="text-[12px] text-[#A3AABF]">{rule.description}</p>
                </div>

                {isLocked ? (
                  <div className="flex items-center gap-1.5 font-mono text-[12px] text-[#FF5C6C] shrink-0">
                    <Lock className="w-3.5 h-3.5" />
                    <span>RESTRICTED (LOCKED)</span>
                  </div>
                ) : (
                  <select
                    aria-label={`Permission for ${rule.label}`}
                    value={rule.level}
                    onChange={(e) =>
                      void onUpdatePolicy(rule.actionType, e.target.value as PermissionLevel)
                    }
                    className="bg-[#0F1117] border border-[#262B3A] text-[#E6E9F2] text-[12px] rounded-[6px] px-2.5 py-1.5 outline-none"
                  >
                    <option value="allowed">Allowed in Workspace</option>
                    <option value="approval_required">Approval Required</option>
                    <option value="explicit_approval">Explicit Approval Required</option>
                    <option value="restricted">Restricted (Blocked)</option>
                  </select>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Section 8 Model Gateway Routing (Managed Server-Side — No API Key UI) */}
      <section className="bg-[#151821] border border-[#262B3A] rounded-[10px] overflow-hidden">
        <div className="px-5 py-3.5 border-b border-[#262B3A]">
          <h2 className="text-[15px] font-semibold text-[#E6E9F2]">
            Provider-Agnostic Model Gateway
          </h2>
          <p className="text-[12px] text-[#A3AABF] mt-0.5">
            All model calls execute server-side through the managed gateway with automatic retries, schema validation, and secret redaction.
          </p>
        </div>

        <div className="divide-y divide-[#262B3A]">
          {providers.map((prov) => (
            <div key={prov.id} className="px-5 py-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-semibold text-[#E6E9F2]">{prov.name}</span>
                <span
                  className={`font-mono text-[11px] uppercase ${
                    prov.status === 'active' ? 'text-[#3DD68C]' : 'text-[#6B728A]'
                  }`}
                >
                  {prov.status === 'active' ? 'Active Route' : 'Adapter Ready'}
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {prov.models.map((m) => (
                  <div
                    key={m.id}
                    className="px-3 py-2 rounded-[6px] bg-[#0F1117] border border-[#262B3A] text-[12px] flex items-center justify-between gap-2"
                  >
                    <span className="font-mono text-[#E6E9F2] truncate">{m.id}</span>
                    <span className="font-mono text-[11px] text-[#A3AABF] tabular-nums shrink-0">
                      {m.contextWindow} · ${m.inputPerMillionUsd}/${m.outputPerMillionUsd} per 1M
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Section 15 Budget & Token Guardrails */}
      <section className="bg-[#151821] border border-[#262B3A] rounded-[10px] p-5 space-y-4">
        <div>
          <h2 className="text-[15px] font-semibold text-[#E6E9F2]">
            Workspace Spending & Token Budget Controls
          </h2>
          <p className="text-[12px] text-[#A3AABF] mt-0.5">
            Hard spending guardrails trigger warnings at 80% and block model execution at 100%.
          </p>
        </div>

        <form onSubmit={(e) => void handleSaveBudget(e)} className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
          <div className="space-y-1">
            <label htmlFor="budget-usd" className="block text-[12px] text-[#A3AABF]">
              Monthly Spend Limit (USD)
            </label>
            <input
              id="budget-usd"
              type="number"
              min="1"
              step="1"
              value={budgetUsd}
              onChange={(e) => setBudgetUsd(e.target.value)}
              className="w-full bg-[#0F1117] border border-[#262B3A] focus:border-[#6C7BFF] rounded-[6px] px-3 py-2 font-mono text-[13px] text-[#E6E9F2] outline-none tabular-nums"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="token-limit" className="block text-[12px] text-[#A3AABF]">
              Monthly Token Quota
            </label>
            <input
              id="token-limit"
              type="number"
              min="10000"
              step="50000"
              value={tokenLimit}
              onChange={(e) => setTokenLimit(e.target.value)}
              className="w-full bg-[#0F1117] border border-[#262B3A] focus:border-[#6C7BFF] rounded-[6px] px-3 py-2 font-mono text-[13px] text-[#E6E9F2] outline-none tabular-nums"
            />
          </div>

          <button
            type="submit"
            disabled={savingBudget}
            className="flex items-center justify-center gap-1.5 px-4 py-2 text-[13px] font-semibold bg-[#6C7BFF] hover:bg-[#8793FF] text-[#0D0F14] rounded-[6px] transition-colors duration-120 whitespace-nowrap"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{savingBudget ? 'Saving...' : 'Update Guardrails'}</span>
          </button>
        </form>

        {/* Recent Metered Calls */}
        {usage && usage.recentRecords.length > 0 && (
          <div className="pt-3 border-t border-[#262B3A] space-y-2">
            <div className="text-[12px] font-medium text-[#A3AABF]">Recent Metered Model Calls</div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[12px] font-mono tabular-nums">
                <thead>
                  <tr className="text-[#6B728A] border-b border-[#262B3A]">
                    <th className="py-1.5 pr-4 font-medium">Operation</th>
                    <th className="py-1.5 pr-4 font-medium">Model</th>
                    <th className="py-1.5 pr-4 font-medium text-right">Tokens</th>
                    <th className="py-1.5 pr-4 font-medium text-right">Latency</th>
                    <th className="py-1.5 font-medium text-right">Cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#262B3A]/60 text-[#A3AABF]">
                  {usage.recentRecords.slice(0, 8).map((rec) => (
                    <tr key={rec.id}>
                      <td className="py-1.5 pr-4 text-[#E6E9F2]">{rec.operation}</td>
                      <td className="py-1.5 pr-4">{rec.model}</td>
                      <td className="py-1.5 pr-4 text-right">
                        {(rec.promptTokens + rec.completionTokens).toLocaleString()}
                      </td>
                      <td className="py-1.5 pr-4 text-right">{rec.latencyMs}ms</td>
                      <td className="py-1.5 text-right text-[#3DD68C]">${rec.costUsd.toFixed(6)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
};
