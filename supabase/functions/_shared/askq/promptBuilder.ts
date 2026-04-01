import type { ClaudeMessage, ToolDefinition } from './types.ts';

const MODEL = 'claude-3-5-haiku-20241022';
const MAX_TOKENS = 1024;

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
    const errorText = await response.text();
    throw new Error(`Claude API error (${response.status}): ${errorText}`);
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
    const errorText = await response.text();
    throw new Error(`Claude API error (${response.status}): ${errorText}`);
  }

  return response;
}
