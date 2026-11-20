import crypto from 'node:crypto';
import { GoogleGenAI, ThinkingLevel, Type, type Schema } from '@google/genai';
import type { UsageLedger } from '../src/types/devmind.ts';

export type TaskComplexity = 'fast' | 'deep';

export interface ProviderDescriptor {
  id: string;
  name: string;
  status: 'active' | 'configured_adapter';
  models: Array<{
    id: string;
    tier: 'fast' | 'deep';
    contextWindow: string;
    inputPerMillionUsd: number;
    outputPerMillionUsd: number;
    toolCalling: boolean;
  }>;
}

export const GATEWAY_PROVIDERS: ProviderDescriptor[] = [
  {
    id: 'google-gemini',
    name: 'Google Gemini (Managed Gateway)',
    status: 'active',
    models: [
      {
        id: 'gemini-4-hydrogen',
        tier: 'fast',
        contextWindow: '1M tokens',
        inputPerMillionUsd: 0.35,
        outputPerMillionUsd: 1.05,
        toolCalling: true,
      },
      {
        id: 'gemini-4-hydrogen (High Reasoning)',
        tier: 'deep',
        contextWindow: '1M tokens',
        inputPerMillionUsd: 0.35,
        outputPerMillionUsd: 1.05,
        toolCalling: true,
      },
    ],
  },
  {
    id: 'openai-compatible',
    name: 'OpenAI / Compatible Adapter',
    status: 'configured_adapter',
    models: [
      {
        id: 'gpt-4.1-mini',
        tier: 'fast',
        contextWindow: '128K tokens',
        inputPerMillionUsd: 0.4,
        outputPerMillionUsd: 1.6,
        toolCalling: true,
      },
    ],
  },
  {
    id: 'anthropic-adapter',
    name: 'Anthropic Adapter',
    status: 'configured_adapter',
    models: [
      {
        id: 'claude-sonnet-4',
        tier: 'deep',
        contextWindow: '200K tokens',
        inputPerMillionUsd: 3.0,
        outputPerMillionUsd: 15.0,
        toolCalling: true,
      },
    ],
  },
];

const MODEL_ID = 'gemini-4-hydrogen';
const INPUT_RATE_PER_MILLION = 0.35;
const OUTPUT_RATE_PER_MILLION = 1.05;

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY is not available on the server. Configure it in Settings > Secrets.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export function estimateTaskCostUsd(inputChars: number, expectedOutputTokens = 1600): number {
  const estPromptTokens = Math.ceil(inputChars / 4);
  const cost =
    (estPromptTokens / 1_000_000) * INPUT_RATE_PER_MILLION +
    (expectedOutputTokens / 1_000_000) * OUTPUT_RATE_PER_MILLION;
  return Number(cost.toFixed(6));
}

export interface GatewayCallResult<T> {
  data: T;
  rawText: string;
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
  latencyMs: number;
}

export class ModelGateway {
  public ledger: UsageLedger = {
    planName: 'Pro',
    monthlyTokenLimit: 2_000_000,
    tokensUsed: 0,
    monthlyBudgetUsd: 25.0,
    spentUsd: 0,
    alertThreshold80Triggered: false,
    alertThreshold100Triggered: false,
    totalModelCalls: 0,
    secretsRedactedTotal: 0,
    unauthorizedActionsBlocked: 0,
    recentRecords: [],
  };

  public recordSecretsRedacted(count: number): void {
    this.ledger.secretsRedactedTotal += count;
  }

  public recordUnauthorizedBlock(): void {
    this.ledger.unauthorizedActionsBlocked += 1;
  }

  public updateBudget(monthlyBudgetUsd: number, monthlyTokenLimit: number): void {
    this.ledger.monthlyBudgetUsd = Math.max(1, monthlyBudgetUsd);
    this.ledger.monthlyTokenLimit = Math.max(10_000, monthlyTokenLimit);
    this.recomputeAlerts();
  }

  private recomputeAlerts(): void {
    const pctSpend = this.ledger.spentUsd / this.ledger.monthlyBudgetUsd;
    const pctTokens = this.ledger.tokensUsed / this.ledger.monthlyTokenLimit;
    const maxPct = Math.max(pctSpend, pctTokens);
    this.ledger.alertThreshold80Triggered = maxPct >= 0.8;
    this.ledger.alertThreshold100Triggered = maxPct >= 1.0;
  }

  private recordUsage(
    operation: string,
    promptTokens: number,
    completionTokens: number,
    latencyMs: number
  ): number {
    const costUsd = Number(
      (
        (promptTokens / 1_000_000) * INPUT_RATE_PER_MILLION +
        (completionTokens / 1_000_000) * OUTPUT_RATE_PER_MILLION
      ).toFixed(6)
    );
    this.ledger.tokensUsed += promptTokens + completionTokens;
    this.ledger.spentUsd = Number((this.ledger.spentUsd + costUsd).toFixed(6));
    this.ledger.totalModelCalls += 1;
    this.ledger.recentRecords.unshift({
      id: `usg_${crypto.randomBytes(4).toString('hex')}`,
      timestamp: new Date().toISOString(),
      provider: 'google-gemini',
      model: MODEL_ID,
      operation,
      promptTokens,
      completionTokens,
      costUsd,
      latencyMs,
    });
    if (this.ledger.recentRecords.length > 40) {
      this.ledger.recentRecords.pop();
    }
    this.recomputeAlerts();
    return costUsd;
  }

  /**
   * Exponential backoff retry (max 3 attempts) per Section 8.
   */
  private async withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastError = err;
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('API_KEY_INVALID') || msg.includes('PERMISSION_DENIED') || msg.includes('NOT_FOUND')) {
          throw err;
        }
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, 350 * Math.pow(2, attempt - 1)));
        }
      }
    }
    throw lastError;
  }

  public async generateText(params: {
    operation: string;
    systemInstruction: string;
    prompt: string;
    complexity?: TaskComplexity;
  }): Promise<GatewayCallResult<string>> {
    if (this.ledger.alertThreshold100Triggered) {
      throw new Error('Workspace monthly token/spending budget reached (100%). Increase limit in Settings.');
    }

    const ai = getGeminiClient();
    const startedAt = Date.now();
    const thinkingLevel =
      params.complexity === 'deep' ? ThinkingLevel.HIGH : ThinkingLevel.LOW;

    const response = await this.withRetry(() =>
      ai.models.generateContent({
        model: MODEL_ID,
        contents: params.prompt,
        config: {
          systemInstruction: params.systemInstruction,
          thinkingConfig: { thinkingLevel },
        },
      })
    );

    const latencyMs = Math.max(1, Date.now() - startedAt);
    const text = (response.text ?? '').trim();
    const promptTokens = response.usageMetadata?.promptTokenCount ?? Math.ceil(params.prompt.length / 4);
    const completionTokens = response.usageMetadata?.candidatesTokenCount ?? Math.ceil(text.length / 4);
    const costUsd = this.recordUsage(params.operation, promptTokens, completionTokens, latencyMs);

    return {
      data: text,
      rawText: text,
      provider: 'google-gemini',
      model: MODEL_ID,
      promptTokens,
      completionTokens,
      costUsd,
      latencyMs,
    };
  }

  public async generateJson<T>(params: {
    operation: string;
    systemInstruction: string;
    prompt: string;
    responseSchema: Schema;
    complexity?: TaskComplexity;
  }): Promise<GatewayCallResult<T>> {
    if (this.ledger.alertThreshold100Triggered) {
      throw new Error('Workspace monthly token/spending budget reached (100%). Increase limit in Settings.');
    }

    const ai = getGeminiClient();
    const startedAt = Date.now();
    const thinkingLevel =
      params.complexity === 'deep' ? ThinkingLevel.HIGH : ThinkingLevel.LOW;

    const response = await this.withRetry(() =>
      ai.models.generateContent({
        model: MODEL_ID,
        contents: params.prompt,
        config: {
          systemInstruction: params.systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: params.responseSchema,
          thinkingConfig: { thinkingLevel },
        },
      })
    );

    const latencyMs = Math.max(1, Date.now() - startedAt);
    const rawText = (response.text ?? '{}').trim();
    const promptTokens = response.usageMetadata?.promptTokenCount ?? Math.ceil(params.prompt.length / 4);
    const completionTokens = response.usageMetadata?.candidatesTokenCount ?? Math.ceil(rawText.length / 4);
    const costUsd = this.recordUsage(params.operation, promptTokens, completionTokens, latencyMs);

    const parsed = JSON.parse(rawText) as T;
    return {
      data: parsed,
      rawText,
      provider: 'google-gemini',
      model: MODEL_ID,
      promptTokens,
      completionTokens,
      costUsd,
      latencyMs,
    };
  }
}

export { Type };
