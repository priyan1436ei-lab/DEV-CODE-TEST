import type { OllamaModelInfo, OllamaRuntimeStatus } from '../src/types/devmind.ts';

export const DEFAULT_OLLAMA_HOST = 'http://127.0.0.1:11434';
export const DEFAULT_OLLAMA_MODEL = 'qwen2.5-coder:7b';

export function normalizeOllamaHost(rawHost?: string): string {
  const trimmed = (rawHost || DEFAULT_OLLAMA_HOST).trim().replace(/\/+$/, '');
  const withoutV1 = trimmed.replace(/\/v1$/i, '');
  let parsed: URL;
  try {
    parsed = new URL(withoutV1);
  } catch {
    throw new Error('Invalid Ollama host URL. Example: http://127.0.0.1:11434');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Ollama host URL must use http:// or https://.');
  }
  const host = parsed.hostname.toLowerCase();
  // Always block cloud metadata endpoints
  if (
    host === '169.254.169.254' ||
    host === '169.254.170.2' ||
    host === 'metadata.google.internal' ||
    host === 'metadata.goog' ||
    host.startsWith('169.254.')
  ) {
    throw new Error('Blocked unsafe metadata endpoint URL.');
  }
  return withoutV1;
}

export interface OllamaChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface OllamaChatResult {
  text: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  latencyMs: number;
}

export class OllamaRuntime {
  public async getStatus(rawHost?: string): Promise<OllamaRuntimeStatus> {
    const checkedAt = new Date().toISOString();
    let host: string;
    try {
      host = normalizeOllamaHost(rawHost);
    } catch (err) {
      return {
        available: false,
        host: rawHost || DEFAULT_OLLAMA_HOST,
        models: [],
        checkedAt,
        error: err instanceof Error ? err.message : 'Invalid Ollama host URL.',
      };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);

    try {
      const tagsRes = await fetch(`${host}/api/tags`, {
        method: 'GET',
        signal: controller.signal,
      });

      if (!tagsRes.ok) {
        return {
          available: false,
          host,
          models: [],
          checkedAt,
          error: `Ollama responded with HTTP ${tagsRes.status} at ${host}.`,
        };
      }

      const tagsJson = (await tagsRes.json().catch(() => ({}))) as {
        models?: Array<{
          name?: string;
          model?: string;
          size?: number;
          modified_at?: string;
          details?: {
            parameter_size?: string;
            quantization_level?: string;
          };
        }>;
      };

      const models: OllamaModelInfo[] = (Array.isArray(tagsJson.models) ? tagsJson.models : [])
        .map((m) => ({
          name: String(m.name || m.model || '').trim(),
          sizeBytes: typeof m.size === 'number' ? m.size : undefined,
          modifiedAt: typeof m.modified_at === 'string' ? m.modified_at : undefined,
          parameterSize: m.details?.parameter_size,
          quantizationLevel: m.details?.quantization_level,
        }))
        .filter((m) => m.name.length > 0);

      let version: string | undefined;
      try {
        const verRes = await fetch(`${host}/api/version`, {
          method: 'GET',
          signal: controller.signal,
        });
        if (verRes.ok) {
          const verJson = (await verRes.json().catch(() => ({}))) as { version?: string };
          if (verJson.version) version = String(verJson.version);
        }
      } catch {
        // /api/version is optional on older Ollama releases
      }

      return {
        available: true,
        host,
        version,
        models,
        checkedAt,
      };
    } catch (err) {
      const isAbort = err instanceof Error && err.name === 'AbortError';
      return {
        available: false,
        host,
        models: [],
        checkedAt,
        error: isAbort
          ? `Ollama runtime did not respond within 2.5s at ${host}. Ensure Ollama is installed and running.`
          : `Ollama runtime not reachable at ${host}. Install/start Ollama to enable local AI models.`,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  public async assertModelInstalled(rawHost: string, model: string): Promise<OllamaRuntimeStatus> {
    const status = await this.getStatus(rawHost);
    if (!status.available) {
      throw new Error(
        status.error ||
          `Ollama runtime is not running at ${status.host}. Start Ollama locally to use offline AI.`
      );
    }
    const target = model.trim();
    if (!target) {
      throw new Error('No local Ollama model selected. Choose an installed model in Settings.');
    }

    const normalizedTarget = target.includes(':') ? target : `${target}:latest`;
    const found = status.models.some((m) => {
      const n = m.name.toLowerCase();
      return (
        n === target.toLowerCase() ||
        n === normalizedTarget.toLowerCase() ||
        n.startsWith(`${target.toLowerCase()}:`)
      );
    });

    if (!found) {
      const installedNames = status.models.map((m) => m.name).slice(0, 6).join(', ');
      throw new Error(
        `Local model "${target}" is not installed in Ollama (${
          installedNames ? `installed: ${installedNames}` : 'no local models found'
        }). Run "ollama pull ${target}" manually — DevMind will never download large models automatically without your consent.`
      );
    }

    return status;
  }

  public async chat(params: {
    host: string;
    model: string;
    messages: OllamaChatMessage[];
    formatJson?: boolean;
  }): Promise<OllamaChatResult> {
    const status = await this.assertModelInstalled(params.host, params.model);
    const startedAt = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 90_000);

    try {
      const body: Record<string, unknown> = {
        model: params.model.trim(),
        messages: params.messages,
        stream: false,
      };
      if (params.formatJson) {
        body.format = 'json';
      }

      const res = await fetch(`${status.host}/api/chat`, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const payload = (await res.json().catch(() => ({}))) as {
        error?: string;
        message?: { content?: string };
        prompt_eval_count?: number;
        eval_count?: number;
      };

      if (!res.ok) {
        throw new Error(payload.error || `Ollama chat error (HTTP ${res.status}).`);
      }

      const text = (payload.message?.content ?? '').trim();
      const inputChars = params.messages.reduce((sum, m) => sum + m.content.length, 0);
      return {
        text,
        model: params.model.trim(),
        promptTokens: payload.prompt_eval_count ?? Math.ceil(inputChars / 4),
        completionTokens: payload.eval_count ?? Math.ceil(text.length / 4),
        latencyMs: Math.max(1, Date.now() - startedAt),
      };
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error('Local Ollama chat request timed out after 90 seconds.');
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  public async streamChat(params: {
    host: string;
    model: string;
    messages: OllamaChatMessage[];
    onToken: (chunk: string) => void;
    signal?: AbortSignal;
  }): Promise<OllamaChatResult> {
    const status = await this.assertModelInstalled(params.host, params.model);
    const startedAt = Date.now();

    const res = await fetch(`${status.host}/api/chat`, {
      method: 'POST',
      signal: params.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: params.model.trim(),
        messages: params.messages,
        stream: true,
      }),
    });

    if (!res.ok) {
      const errBody = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(errBody.error || `Ollama streaming chat error (HTTP ${res.status}).`);
    }

    if (!res.body) {
      throw new Error('Ollama returned an empty response stream.');
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullText = '';
    let promptTokens = 0;
    let completionTokens = 0;

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const rawLine of lines) {
        const trimmed = rawLine.trim();
        if (!trimmed) continue;
        try {
          const parsed = JSON.parse(trimmed) as {
            message?: { content?: string };
            done?: boolean;
            prompt_eval_count?: number;
            eval_count?: number;
            error?: string;
          };
          if (parsed.error) {
            throw new Error(parsed.error);
          }
          const delta = parsed.message?.content ?? '';
          if (delta) {
            fullText += delta;
            params.onToken(delta);
          }
          if (parsed.done) {
            promptTokens = parsed.prompt_eval_count ?? promptTokens;
            completionTokens = parsed.eval_count ?? completionTokens;
          }
        } catch (parseErr) {
          if (parseErr instanceof Error && !/JSON/.test(parseErr.message)) {
            throw parseErr;
          }
        }
      }
    }

    const inputChars = params.messages.reduce((sum, m) => sum + m.content.length, 0);
    return {
      text: fullText.trim(),
      model: params.model.trim(),
      promptTokens: promptTokens || Math.ceil(inputChars / 4),
      completionTokens: completionTokens || Math.ceil(fullText.length / 4),
      latencyMs: Math.max(1, Date.now() - startedAt),
    };
  }
}
