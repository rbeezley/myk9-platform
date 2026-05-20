// supabase/functions/ask-myk9q/index.ts
// myK9Q AI chat endpoint. License-key auth (validated in-handler); no JWT.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

import { handle } from '../_shared/http/handler.ts';
import { MYK9Q_ORIGINS } from '../_shared/http/cors.ts';
import { HttpError } from '../_shared/http/responses.ts';

import type {
  ChatRequest,
  ChatResponse,
  ClaudeMessage,
  ClaudeContentBlock,
} from '../_shared/askq/types.ts';
import { TOOLS } from '../_shared/askq/toolDefinitions.ts';
import { callClaude } from '../_shared/askq/promptBuilder.ts';
import { executeTool } from '../_shared/askq/toolExecutor.ts';
import { collectSource, buildChatResponse } from '../_shared/askq/responseFormatter.ts';
import { MYK9Q_SYSTEM_PROMPT } from './promptBuilder.ts';

const ASK_MYK9Q_ALLOWED_HEADERS = [
  'authorization',
  'x-client-info',
  'apikey',
  'content-type',
  'x-license-key',
];

handle<ChatRequest>(
  { auth: 'none', origins: MYK9Q_ORIGINS, allowedHeaders: ASK_MYK9Q_ALLOWED_HEADERS },
  async ({ body, supabase }) => {
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!anthropicKey) {
      throw new HttpError(500, 'ANTHROPIC_API_KEY not configured');
    }

    const { message, licenseKey, organizationCode, sportCode } = body;

    if (!message?.trim()) {
      throw new HttpError(400, 'Message is required');
    }
    if (!licenseKey) {
      throw new HttpError(400, 'License key is required');
    }

    // Initialize conversation with user message
    const messages: ClaudeMessage[] = [{ role: 'user', content: message }];

    const toolsUsed: string[] = [];
    const sources: ChatResponse['sources'] = {};

    // Call Claude with tools
    console.log('Calling Claude with message:', message);
    let response = await callClaude(messages, anthropicKey, TOOLS, MYK9Q_SYSTEM_PROMPT);
    console.log('Claude response:', JSON.stringify(response, null, 2));

    // Process tool calls in a loop (Claude may call multiple tools)
    while (response.stop_reason === 'tool_use') {
      const toolUseBlocks = response.content.filter(block => block.type === 'tool_use');

      // Add assistant's response (with tool calls) to messages
      messages.push({ role: 'assistant', content: response.content });

      // Execute each tool and collect results
      const toolResults: ClaudeContentBlock[] = [];

      for (const toolUse of toolUseBlocks) {
        if (toolUse.type !== 'tool_use' || !toolUse.name || !toolUse.id) {
          continue;
        }

        toolsUsed.push(toolUse.name);

        const { result, error } = await executeTool(
          toolUse.name,
          toolUse.input || {},
          supabase,
          licenseKey,
          organizationCode,
          sportCode
        );

        // Store sources for response
        if (!error && result) {
          collectSource(sources, toolUse.name, result);
        }

        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: error ? JSON.stringify({ error }) : JSON.stringify(result),
        });
      }

      // Add tool results to messages
      messages.push({ role: 'user', content: toolResults });

      // Call Claude again with tool results
      console.log('Calling Claude with tool results...');
      response = await callClaude(messages, anthropicKey, TOOLS, MYK9Q_SYSTEM_PROMPT);
      console.log('Claude response:', JSON.stringify(response, null, 2));
    }

    // Build final response
    const chatResponse = buildChatResponse(response.content, toolsUsed, sources);

    // Log query for analytics (fire-and-forget)
    supabase
      .from('chatbot_query_log')
      .insert({
        query: message,
        tools_used: toolsUsed,
        license_key: licenseKey,
        organization_code: organizationCode || null,
        sport_code: sportCode || null,
      })
      .then(() => console.log('Query logged'))
      .catch((err: Error) => console.log('Query log skipped:', err.message));

    return chatResponse;
  },
);
