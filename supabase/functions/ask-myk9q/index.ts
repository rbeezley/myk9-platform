// @deno-types="npm:@types/node"
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

const ALLOWED_ORIGINS = [
  'https://myk9q.com',
  'https://www.myk9q.com',
  'https://app.myk9q.com',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5173',
];

function getCorsHeaders(requestOrigin: string | null): Record<string, string> {
  const origin =
    requestOrigin && ALLOWED_ORIGINS.includes(requestOrigin) ? requestOrigin : ALLOWED_ORIGINS[0];

  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type, x-license-key',
  };
}

serve(async req => {
  const corsHeaders = getCorsHeaders(req.headers.get('origin'));

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Get environment variables
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');

    if (!anthropicKey) {
      return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Parse request
    const { message, licenseKey, organizationCode, sportCode }: ChatRequest = await req.json();

    // Validate required fields
    if (!message?.trim()) {
      return new Response(JSON.stringify({ error: 'Message is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!licenseKey) {
      return new Response(JSON.stringify({ error: 'License key is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Create Supabase client
    const supabase = createClient(supabaseUrl, supabaseKey);

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

    return new Response(JSON.stringify(chatResponse), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in ask-myk9q function:', error);

    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Internal server error',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
