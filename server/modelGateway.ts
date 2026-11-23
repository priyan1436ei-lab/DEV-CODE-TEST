import crypto from 'node:crypto';
import type { LlmProviderId, UsageLedger, UserLlmConfig } from '../src/types/devmind.ts';

export type TaskComplexity = 'fast' | 'deep';

export interface ProviderPreset {
  id: LlmProviderId;
  name: string;
  protocol: 'openai_compatible' | 'anthropic';
  defaultBaseUrl: string;
  defaultModel: string;
  requiresKey: boolean;
  suggestedModels: string[];
  inputPerMillionUsd: number;
  outputPerMillionUsd: number;
}

export const LLM_PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    protocol: 'openai_compatible',
    defaultBaseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    requiresKey: true,
    suggestedModels: ['gpt-4o-mini', 'gpt-4.1-mini', 'gpt-4.1', 'o3-mini'],
    inputPerMillionUsd: 0.15,
    outputPerMillionUsd: 0.6,
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    protocol: 'openai_compatible',
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'openai/gpt-4o-mini',
    requiresKey: true,
    suggestedModels: [
      'openai/gpt-4o-mini',
      'anthropic/claude-3.5-sonnet',
      'deepseek/deepseek-chat',
      'meta-llama/llama-3.3-70b-instruct',
    ],
    inputPerMillionUsd: 0.25,
    outputPerMillionUsd: 0.9,
  },
  {
    id: 'anthropic',
    name: 'Anthropic Claude',
    protocol: 'anthropic',
    defaultBaseUrl: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-sonnet-4-20250514',
    requiresKey: true,
    suggestedModels: ['claude-sonnet-4-20250514', 'claude-3-5-haiku-latest'],
    inputPerMillionUsd: 3.0,
    outputPerMillionUsd: 15.0,
  },
  {
    id: 'groq',
    name: 'Groq',
    protocol: 'openai_compatible',
    defaultBaseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.3-70b-versatile',
    requiresKey: true,
    suggestedModels: ['llama-3.3-70b-versatile', 'qwen-2.5-coder-32b'],
    inputPerMillionUsd: 0.59,
    outputPerMillionUsd: 0.79,
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    protocol: 'openai_compatible',
    defaultBaseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    requiresKey: true,
    suggestedModels: ['deepseek-chat', 'deepseek-reasoner'],
    inputPerMillionUsd: 0.27,
    outputPerMillionUsd: 1.1,
  },
  {
    id: 'ollama',
    name: 'Ollama (Local)',
    protocol: 'openai_compatible',
    defaultBaseUrl: 'http://localhost:11434/v1',
    defaultModel: 'qwen2.5-coder:7b',
    requiresKey: false,
    suggestedModels: ['qwen2.5-coder:7b', 'llama3.1:8b', 'deepseek-coder-v2'],
    inputPerMillionUsd: 0,
    outputPerMillionUsd: 0,
  },
  {
    id: 'custom',
    name: 'Custom OpenAI-Compatible',
    protocol: 'openai_compatible',
    defaultBaseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    requiresKey: false,
    suggestedModels: [],
    inputPerMillionUsd: 0.5,
    outputPerMillionUsd: 1.5,
  },
];

export function maskApiKey(key: string): string {
  const trimmed = key.trim();
  if (!trimmed) return '';
  if (trimmed.length <= 8) return '••••••••';
  return `${trimmed.slice(0, 4)}••••${trimmed.slice(-4)}`;
}

export function estimateTaskCostUsd(
  inputChars: number,
  expectedOutputTokens = 1600,
  providerId: LlmProviderId = 'openai'
): number {
  const preset = LLM_PROVIDER_PRESETS.find((p) => p.id === providerId) ?? LLM_PROVIDER_PRESETS[0];
  const estPromptTokens = Math.ceil(inputChars / 4);
  const cost =
    (estPromptTokens / 1_000_000) * preset.inputPerMillionUsd +
    (expectedOutputTokens / 1_000_000) * preset.outputPerMillionUsd;
  return Number(cost.toFixed(6));
}

function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

/**
 * Extracts a JSON object safely even when an LLM wraps JSON in markdown code fences.
 */
function extractJsonObject<T>(raw: string): T {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    // Strip ```json ... ``` fences if present
    const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenceMatch) {
      return JSON.parse(fenceMatch[1].trim()) as T;
    }
    const firstBrace = trimmed.indexOf('{');
    const lastBrace = trimmed.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1)) as T;
    }
    throw new Error('Model returned non-JSON output. Check model compatibility or retry.');
  }
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
    provider: LlmProviderId,
    model: string,
    operation: string,
    promptTokens: number,
    completionTokens: number,
    latencyMs: number
  ): number {
    const preset = LLM_PROVIDER_PRESETS.find((p) => p.id === provider) ?? LLM_PROVIDER_PRESETS[0];
    const costUsd = Number(
      (
        (promptTokens / 1_000_000) * preset.inputPerMillionUsd +
        (completionTokens / 1_000_000) * preset.outputPerMillionUsd
      ).toFixed(6)
    );
    this.ledger.tokensUsed += promptTokens + completionTokens;
    this.ledger.spentUsd = Number((this.ledger.spentUsd + costUsd).toFixed(6));
    this.ledger.totalModelCalls += 1;
    this.ledger.recentRecords.unshift({
      id: `usg_${crypto.randomBytes(4).toString('hex')}`,
      timestamp: new Date().toISOString(),
      provider,
      model,
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

  private validateProviderUrl(rawUrl: string, provider: LlmProviderId): string {
    const cleaned = normalizeBaseUrl(rawUrl);
    let parsed: URL;
    try {
      parsed = new URL(cleaned);
    } catch {
      throw new Error('Invalid LLM API Base URL. Use a valid https:// or http:// endpoint.');
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      throw new Error('LLM API Base URL must start with https:// or http://.');
    }
    const host = parsed.hostname.toLowerCase();
    // Block cloud instance metadata endpoints to prevent metadata SSRF
    if (
      host === '169.254.169.254' ||
      host === '169.254.170.2' ||
      host === 'metadata.google.internal' ||
      host === 'metadata.goog' ||
      host.startsWith('169.254.')
    ) {
      throw new Error('Blocked unsafe metadata endpoint URL.');
    }
    // Only allow localhost/loopback for local Ollama or explicit Custom endpoints
    const isLoopback =
      host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';
    if (isLoopback && provider !== 'ollama' && provider !== 'custom') {
      throw new Error(`Loopback URLs are only permitted for Ollama or Custom endpoints.`);
    }
    return cleaned;
  }

  private async invokeProviderHttp(params: {
    config: UserLlmConfig;
    systemInstruction: string;
    prompt: string;
    expectJson: boolean;
    maxTokens?: number;
    disableResponseFormat?: boolean;
  }): Promise<{ text: string; promptTokens: number; completionTokens: number }> {
    const { config, systemInstruction, prompt, expectJson, maxTokens, disableResponseFormat } = params;
    const preset = LLM_PROVIDER_PRESETS.find((p) => p.id === config.provider);
    const rawBaseUrl = config.baseUrl || preset?.defaultBaseUrl || '';
    const model = (config.model || preset?.defaultModel || '').trim();

    if (!config.configured || !rawBaseUrl.trim() || !model) {
      throw new Error(
        'No LLM API configured for this session. Open Settings to connect your provider API key and model.'
      );
    }
    if (preset?.requiresKey && !config.apiKey.trim()) {
      throw new Error(`An API key is required for ${preset.name}. Update your LLM credentials.`);
    }

    const baseUrl = this.validateProviderUrl(rawBaseUrl, config.provider);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 90_000);

    try {
      if (config.provider === 'anthropic') {
        const res = await fetch(`${baseUrl}/messages`, {
          method: 'POST',
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': config.apiKey.trim(),
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model,
            max_tokens: maxTokens ?? 4096,
            system: systemInstruction,
            messages: [{ role: 'user', content: prompt }],
          }),
        });

        const body = (await res.json().catch(() => ({}))) as {
          error?: { message?: string };
          content?: Array<{ type: string; text?: string }>;
          usage?: { input_tokens?: number; output_tokens?: number };
        };

        if (!res.ok) {
          throw new Error(body?.error?.message || `Anthropic API error (${res.status})`);
        }

        const text = (body.content ?? [])
          .filter((b) => b.type === 'text' && b.text)
          .map((b) => b.text)
          .join('\n')
          .trim();

        return {
          text,
          promptTokens: body.usage?.input_tokens ?? Math.ceil(prompt.length / 4),
          completionTokens: body.usage?.output_tokens ?? Math.ceil(text.length / 4),
        };
      }

      // Standard OpenAI-Compatible `/chat/completions` protocol (OpenAI, OpenRouter, Groq, DeepSeek, Ollama, Custom)
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (config.apiKey.trim()) {
        headers['Authorization'] = `Bearer ${config.apiKey.trim()}`;
      }
      if (config.provider === 'openrouter') {
        headers['HTTP-Referer'] = process.env.APP_URL || 'http://localhost:3000';
        headers['X-Title'] = 'DevMind AI';
      }

      const payload: Record<string, unknown> = {
        model,
        messages: [
          { role: 'system', content: systemInstruction },
          { role: 'user', content: prompt },
        ],
      };
      if (maxTokens) {
        payload.max_tokens = maxTokens;
      }
      if (expectJson && !disableResponseFormat && config.provider !== 'ollama') {
        payload.response_format = { type: 'json_object' };
      }

      const endpoint = baseUrl.endsWith('/chat/completions')
        ? baseUrl
        : `${baseUrl}/chat/completions`;

      const res = await fetch(endpoint, {
        method: 'POST',
        signal: controller.signal,
        headers,
        body: JSON.stringify(payload),
      });

      const body = (await res.json().catch(() => ({}))) as {
        error?: { message?: string } | string;
        choices?: Array<{ message?: { content?: string } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };

      if (!res.ok) {
        const errMsg =
          typeof body?.error === 'string'
            ? body.error
            : body?.error?.message || `LLM provider error (${res.status})`;

        // Automatic fallback for OpenAI-compatible models that reject response_format: json_object
        if (
          res.status === 400 &&
          expectJson &&
          !disableResponseFormat &&
          /response_format|json_object|not supported/i.test(errMsg)
        ) {
          clearTimeout(timer);
          return this.invokeProviderHttp({
            ...params,
            disableResponseFormat: true,
          });
        }
        throw new Error(errMsg);
      }

      const text = (body.choices?.[0]?.message?.content ?? '').trim();
      return {
        text,
        promptTokens: body.usage?.prompt_tokens ?? Math.ceil(prompt.length / 4),
        completionTokens: body.usage?.completion_tokens ?? Math.ceil(text.length / 4),
      };
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error('LLM API request timed out after 90 seconds.');
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  public async testConnection(config: UserLlmConfig): Promise<{
    ok: boolean;
    latencyMs: number;
    model: string;
    replyPreview: string;
  }> {
    const startedAt = Date.now();
    const out = await this.invokeProviderHttp({
      config: { ...config, configured: true },
      systemInstruction: 'Reply with the single word OK.',
      prompt: 'Health check ping.',
      expectJson: false,
      maxTokens: 16,
    });
    return {
      ok: true,
      latencyMs: Math.max(1, Date.now() - startedAt),
      model: config.model,
      replyPreview: out.text.slice(0, 60) || 'OK',
    };
  }

  private async withRetry<T>(fn: () => Promise<T>, maxRetries = 2): Promise<T> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastError = err;
        const msg = err instanceof Error ? err.message : String(err);
        if (/401|403|invalid api key|incorrect api key|unauthorized|not configured/i.test(msg)) {
          throw err;
        }
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, 400 * attempt));
        }
      }
    }
    throw lastError;
  }

  public async generateJson<T>(params: {
    config: UserLlmConfig;
    operation: string;
    systemInstruction: string;
    prompt: string;
    jsonContractDescription: string;
    complexity?: TaskComplexity;
  }): Promise<GatewayCallResult<T>> {
    if (this.ledger.alertThreshold100Triggered) {
      throw new Error(
        'Workspace monthly spending/token budget reached (100%). Increase limit in Governance & Usage.'
      );
    }

    const startedAt = Date.now();
    const fullSystem = `${params.systemInstruction}\n\nSTRICT OUTPUT FORMAT:\nReturn ONLY a valid JSON object matching this exact schema (no prose before or after JSON):\n${params.jsonContractDescription}`;

    const out = await this.withRetry(() =>
      this.invokeProviderHttp({
        config: params.config,
        systemInstruction: fullSystem,
        prompt: params.prompt,
        expectJson: true,
      })
    );

    const latencyMs = Math.max(1, Date.now() - startedAt);
    const parsed = extractJsonObject<T>(out.text);
    const costUsd = this.recordUsage(
      params.config.provider,
      params.config.model,
      params.operation,
      out.promptTokens,
      out.completionTokens,
      latencyMs
    );

    return {
      data: parsed,
      rawText: out.text,
      provider: params.config.provider,
      model: params.config.model,
      promptTokens: out.promptTokens,
      completionTokens: out.completionTokens,
      costUsd,
      latencyMs,
    };
  }
}
