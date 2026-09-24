import type { ClaudeMessage, ToolDefinition } from './types.ts';

// claude-3-5-haiku-20241022 retired 2026-02-19; claude-haiku-4-5 is the
// drop-in replacement (same request surface — no temperature/top_p/thinking
// to migrate).
const MODEL = 'claude-haiku-4-5';
const MAX_TOKENS = 1024;

/**
 * The model API answered with an error (MYK9-684). Carries the upstream HTTP
 * status and Anthropic's `error.type` so the caller can answer the client with
 * a retryable 503 and the reserved query-log row can say what failed.
 */
export class ClaudeApiError extends Error {
  readonly status: number;
  readonly errorType: string;

  constructor(status: number, errorType: string, detail: string) {
    super(`Claude API error (${status} ${errorType}): ${detail}`);
    this.name = 'ClaudeApiError';
    this.status = status;
    this.errorType = errorType;
  }

  static async fromResponse(response: Response): Promise<ClaudeApiError> {
    const text = await response.text().catch(() => '');
    let errorType = 'unknown';
    try {
      const parsed = JSON.parse(text) as { error?: { type?: unknown } };
      if (typeof parsed.error?.type === 'string') errorType = parsed.error.type;
    } catch {
      // Not JSON (a gateway page); the status alone still classifies it.
    }
    return new ClaudeApiError(response.status, errorType, text.slice(0, 500));
  }
}

export async function callClaude(
  messages: ClaudeMessage[],
  apiKey: string,
  tools: ToolDefinition[],
  systemPrompt: string
): Promise<{
  content: Array<{
    type: string;
    text?: string;
    id?: string;
    name?: string;
    input?: Record<string, unknown>;
  }>;
  stop_reason: string;
}> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      tools,
      messages,
      system: systemPrompt,
    }),
  });

  if (!response.ok) {
    throw await ClaudeApiError.fromResponse(response);
  }

  return response.json();
}

export async function callClaudeStreaming(
  messages: ClaudeMessage[],
  apiKey: string,
  tools: ToolDefinition[],
  systemPrompt: string
): Promise<Response> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      tools,
      messages,
      system: systemPrompt,
      stream: true,
    }),
  });

  if (!response.ok) {
    throw await ClaudeApiError.fromResponse(response);
  }

  return response;
}
