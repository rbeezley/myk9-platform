import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

import { callClaude } from '../_shared/askq/promptBuilder.ts';
import {
  handleOperatorSupportRequest,
  OperatorSupportError,
  type OperatorSupportBody,
} from '../_shared/askq/operatorSupport.ts';
import { createOperatorSupportAudit } from '../_shared/askq/operatorSupportAudit.ts';
import { executeOperatorTool } from '../_shared/askq/operatorToolExecutor.ts';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? 'http://localhost:5173',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: CORS_HEADERS });
  }

  try {
    const authorization = request.headers.get('authorization');
    if (!authorization) {
      return jsonResponse({ error: 'Missing authorization header' }, 401);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!supabaseUrl || !anonKey || !serviceRoleKey || !anthropicKey) {
      console.error('Operator Support is missing required environment variables');
      return jsonResponse({ error: 'Service configuration error' }, 500);
    }

    // This client carries the caller's JWT. It is the only client permitted to
    // reach operator data, so the operator_alerts RLS policy remains authoritative.
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
    });
    const {
      data: { user },
      error: authError,
    } = await callerClient.auth.getUser();
    if (authError || !user) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    let body: OperatorSupportBody;
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: 'Invalid JSON body' }, 400);
    }

    // Service-role access is deliberately contained inside the audit writer.
    // The handler and tool executor receive only the caller-scoped client.
    const auditClient = createClient(supabaseUrl, serviceRoleKey);
    const result = await handleOperatorSupportRequest({
      body,
      user,
      callerClient,
      audit: createOperatorSupportAudit(auditClient),
      callModel: (messages, tools, systemPrompt) =>
        callClaude(messages, anthropicKey, tools, systemPrompt),
      executeTool: executeOperatorTool,
    });

    return eventStreamResponse(result);
  } catch (error) {
    if (error instanceof OperatorSupportError) {
      return jsonResponse({ error: error.message }, error.status);
    }

    console.error('ask-operator-support error:', (error as Error).message);
    return jsonResponse({ error: 'Internal server error' }, 500);
  }
});

function jsonResponse(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

function eventStreamResponse(result: {
  text: string;
  toolsUsed: string[];
  queryLogId: string;
  responseTimeMs: number;
}): Response {
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      if (result.toolsUsed.length > 0) {
        send('tools_used', result.toolsUsed);
      }
      for (let index = 0; index < result.text.length; index += 4) {
        send('token', result.text.slice(index, index + 4));
      }
      send('meta', {
        remaining: null,
        limit: null,
        responseTimeMs: result.responseTimeMs,
        queryLogId: result.queryLogId,
      });
      send('done', {});
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
