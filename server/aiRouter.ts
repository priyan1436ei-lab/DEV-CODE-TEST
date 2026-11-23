import type {
  AiProvenance,
  AiRoutingMode,
  LocalAiConfig,
  UserLlmConfig,
} from '../src/types/devmind.ts';
import type { GatewayCallResult, ModelGateway, TaskComplexity } from './modelGateway.ts';
import { DEFAULT_OLLAMA_HOST, DEFAULT_OLLAMA_MODEL, OllamaRuntime } from './ollamaRuntime.ts';

export interface HybridAiExecutionContext {
  routingMode: AiRoutingMode;
  onlineConfig: UserLlmConfig;
  localConfig: LocalAiConfig;
  clientOffline?: boolean;
}

export interface RoutedJsonResult<T> extends GatewayCallResult<T> {
  provenance: AiProvenance;
}

function extractJsonObject<T>(raw: string): T {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenceMatch) {
      return JSON.parse(fenceMatch[1].trim()) as T;
    }
    const firstBrace = trimmed.indexOf('{');
    const lastBrace = trimmed.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1)) as T;
    }
    throw new Error('Local model returned non-JSON output. Check model compatibility or retry.');
  }
}

function isConnectivityError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  return (
    msg.includes('fetch failed') ||
    msg.includes('econnrefused') ||
    msg.includes('enotfound') ||
    msg.includes('etimedout') ||
    msg.includes('network') ||
    msg.includes('offline') ||
    msg.includes('timed out')
  );
}

export class HybridAiRouter {
  public ollama = new OllamaRuntime();

  constructor(private readonly gateway: ModelGateway) {}

  public static defaultLocalConfig(): LocalAiConfig {
    return {
      host: process.env.OLLAMA_HOST || DEFAULT_OLLAMA_HOST,
      model: process.env.OLLAMA_MODEL || DEFAULT_OLLAMA_MODEL,
      enabled: true,
    };
  }

  public isOnlineProviderReady(ctx: HybridAiExecutionContext): boolean {
    if (ctx.clientOffline) return false;
    if (ctx.onlineConfig.provider === 'ollama') return false;
    return Boolean(
      ctx.onlineConfig.configured &&
        ctx.onlineConfig.baseUrl.trim() &&
        ctx.onlineConfig.model.trim()
    );
  }

  public async isLocalOllamaReady(ctx: HybridAiExecutionContext): Promise<boolean> {
    if (!ctx.localConfig.enabled || !ctx.localConfig.model.trim()) return false;
    const status = await this.ollama.getStatus(ctx.localConfig.host);
    if (!status.available) return false;
    const target = ctx.localConfig.model.trim().toLowerCase();
    const targetLatest = target.includes(':') ? target : `${target}:latest`;
    return status.models.some((m) => {
      const n = m.name.toLowerCase();
      return n === target || n === targetLatest || n.startsWith(`${target}:`);
    });
  }

  private async runLocalJson<T>(params: {
    ctx: HybridAiExecutionContext;
    operation: string;
    systemInstruction: string;
    prompt: string;
    jsonContractDescription: string;
  }): Promise<RoutedJsonResult<T>> {
    const fullSystem = `${params.systemInstruction}\n\nSTRICT OUTPUT FORMAT:\nReturn ONLY a valid JSON object matching this exact schema (no prose before or after JSON):\n${params.jsonContractDescription}`;
    const res = await this.ollama.chat({
      host: params.ctx.localConfig.host,
      model: params.ctx.localConfig.model,
      messages: [
        { role: 'system', content: fullSystem },
        { role: 'user', content: params.prompt },
      ],
      formatJson: true,
    });

    const parsed = extractJsonObject<T>(res.text);
    this.gateway.ledger.tokensUsed += res.promptTokens + res.completionTokens;
    this.gateway.ledger.totalModelCalls += 1;
    this.gateway.ledger.recentRecords.unshift({
      id: `usg_loc_${Date.now().toString(36)}`,
      timestamp: new Date().toISOString(),
      provider: 'ollama',
      model: res.model,
      operation: params.operation,
      promptTokens: res.promptTokens,
      completionTokens: res.completionTokens,
      costUsd: 0,
      latencyMs: res.latencyMs,
    });
    if (this.gateway.ledger.recentRecords.length > 40) {
      this.gateway.ledger.recentRecords.pop();
    }

    return {
      data: parsed,
      rawText: res.text,
      provider: 'ollama',
      model: res.model,
      promptTokens: res.promptTokens,
      completionTokens: res.completionTokens,
      costUsd: 0,
      latencyMs: res.latencyMs,
      provenance: 'local-ollama',
    };
  }

  public async generateJson<T>(params: {
    ctx: HybridAiExecutionContext;
    operation: string;
    systemInstruction: string;
    prompt: string;
    jsonContractDescription: string;
    complexity?: TaskComplexity;
  }): Promise<RoutedJsonResult<T>> {
    const { ctx } = params;

    if (ctx.routingMode === 'local') {
      return this.runLocalJson<T>(params);
    }

    if (ctx.routingMode === 'online') {
      if (ctx.clientOffline) {
        throw new Error(
          'Online AI mode is selected, but the device is currently offline. Switch AI Routing to Auto or Local AI.'
        );
      }
      const res = await this.gateway.generateJson<T>({
        config: ctx.onlineConfig,
        operation: params.operation,
        systemInstruction: params.systemInstruction,
        prompt: params.prompt,
        jsonContractDescription: params.jsonContractDescription,
        complexity: params.complexity,
      });
      return {
        ...res,
        provenance: res.provider === 'ollama' ? 'local-ollama' : 'online',
      };
    }

    // Auto routing: prefer Online AI when online & configured, automatically failover to Local Ollama when offline or unreachable
    if (this.isOnlineProviderReady(ctx)) {
      try {
        const res = await this.gateway.generateJson<T>({
          config: ctx.onlineConfig,
          operation: params.operation,
          systemInstruction: params.systemInstruction,
          prompt: params.prompt,
          jsonContractDescription: params.jsonContractDescription,
          complexity: params.complexity,
        });
        return {
          ...res,
          provenance: 'online',
        };
      } catch (onlineErr) {
        if (isConnectivityError(onlineErr) && (await this.isLocalOllamaReady(ctx))) {
          return this.runLocalJson<T>(params);
        }
        throw onlineErr;
      }
    }

    // Offline or no cloud key configured: try Local Ollama if configured & running
    if (ctx.onlineConfig.provider === 'ollama' && ctx.onlineConfig.configured) {
      return this.runLocalJson<T>({
        ...params,
        ctx: {
          ...ctx,
          localConfig: {
            host: ctx.onlineConfig.baseUrl || ctx.localConfig.host,
            model: ctx.onlineConfig.model || ctx.localConfig.model,
            enabled: true,
          },
        },
      });
    }

    if (await this.isLocalOllamaReady(ctx)) {
      return this.runLocalJson<T>(params);
    }

    throw new Error('NO_AI_RUNTIME_AVAILABLE');
  }
}
