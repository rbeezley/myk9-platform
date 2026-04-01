// supabase/functions/ask-myk9show/index.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type {
  AskQShowRequest,
  ChatResponse,
  ClaudeContentBlock,
  UserContext,
} from '../_shared/askq/types.ts';
import { TOOLS } from '../_shared/askq/toolDefinitions.ts';
import { executeTool } from '../_shared/askq/toolExecutor.ts';
import { collectSource } from '../_shared/askq/responseFormatter.ts';
import { callClaude } from '../_shared/askq/promptBuilder.ts';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? 'http://localhost:5173',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const RATE_LIMITS = { free: 10, premium: 50 };

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: CORS_HEADERS });
  }

  const startTime = Date.now();

  try {
    // 1. Auth
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const {
      data: { user },
      error: authError,
    } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    // 2. Parse request
    const { message, showId } = (await req.json()) as AskQShowRequest;
    if (!message?.trim()) {
      return new Response(JSON.stringify({ error: 'Message is required' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }
    if (message.length > 2000) {
      return new Response(JSON.stringify({ error: 'Message too long (max 2000 characters)' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    // 3. Rate limiting
    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { count: todayCount } = await serviceClient
      .from('chatbot_query_log')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('created_at', new Date().toISOString().split('T')[0]);

    const { data: personData } = await serviceClient
      .from('people')
      .select('id, first_name, last_name, subscription_tier')
      .eq('auth_user_id', user.id)
      .single();

    const tier = personData?.subscription_tier === 'premium' ? 'premium' : 'free';
    const limit = RATE_LIMITS[tier];
    const used = todayCount ?? 0;

    if (used >= limit) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);
      return new Response(
        JSON.stringify({
          error: 'Daily limit reached',
          remaining: 0,
          limit,
          resetsAt: tomorrow.toISOString(),
        }),
        { status: 429, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // 4. Resolve user context
    const personId = personData?.id;
    const displayName = personData
      ? [personData.first_name, personData.last_name].filter(Boolean).join(' ')
      : null;

    let dogs: UserContext['dogs'] = [];
    if (personId) {
      const { data: dogData } = await serviceClient
        .from('dogs')
        .select('id, name, call_name, breed')
        .eq('owner_id', personId)
        .is('deleted_at', null);
      dogs = (dogData ?? []).map(d => ({
        id: d.id,
        name: d.name,
        callName: d.call_name,
        breed: d.breed,
      }));
    }

    let showName: string | null = null;
    if (showId) {
      const { data: showData } = await serviceClient
        .from('shows')
        .select('show_name')
        .eq('id', showId)
        .single();
      showName = showData?.show_name ?? null;
    }

    const userContext: UserContext = {
      userId: user.id,
      displayName,
      dogs,
      showId: showId ?? null,
      showName,
    };

    // 5. Build system prompt
    const systemPrompt = buildMyK9ShowPrompt(userContext);

    // 6. Tool-calling loop
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')!;
    const messages = [{ role: 'user' as const, content: message }];
    const toolsUsed: string[] = [];
    const sources: ChatResponse['sources'] = {};

    let result = await callClaude(messages, anthropicKey, TOOLS, systemPrompt);

    while (result.stop_reason === 'tool_use') {
      const assistantContent = result.content;
      messages.push({ role: 'assistant' as const, content: assistantContent });

      const toolResults: ClaudeContentBlock[] = [];
      for (const block of assistantContent) {
        if (block.type === 'tool_use') {
          toolsUsed.push(block.name!);
          const toolResult = await executeTool(
            serviceClient,
            block.name!,
            block.input!,
            userContext
          );
          collectSource(block.name!, toolResult, sources);
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id!,
            content: JSON.stringify(toolResult),
          });
        }
      }
      messages.push({ role: 'user' as const, content: toolResults });
      result = await callClaude(messages, anthropicKey, TOOLS, systemPrompt);
    }

    const responseTimeMs = Date.now() - startTime;
    const remaining = limit - used - 1;

    // 7. Log query FIRST (need the ID for feedback in the stream)
    const { data: logRow } = await serviceClient
      .from('chatbot_query_log')
      .insert({
        query: message,
        tools_used: [...new Set(toolsUsed)],
        user_id: user.id,
        app_source: 'myk9show',
        response_time_ms: responseTimeMs,
      })
      .select('id')
      .single();

    // 8. Stream the final text response via SSE
    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        const send = (event: string, data: unknown) => {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        };

        if (toolsUsed.length > 0) {
          send('tools_used', [...new Set(toolsUsed)]);
        }
        const hasAnySources = Object.values(sources).some(s => s && s.length > 0);
        if (hasAnySources) {
          send('sources', sources);
        }

        const textBlock = result.content.find(b => b.type === 'text');
        const fullText = textBlock?.text ?? '';
        const CHUNK_SIZE = 4;
        for (let i = 0; i < fullText.length; i += CHUNK_SIZE) {
          send('token', fullText.slice(i, i + CHUNK_SIZE));
        }

        send('meta', { remaining, limit, responseTimeMs, queryLogId: logRow?.id ?? null });
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
  } catch (error) {
    console.error('ask-myk9show error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
});

function buildMyK9ShowPrompt(ctx: UserContext): string {
  let userPreamble = '';
  if (ctx.displayName) {
    userPreamble += `The user is ${ctx.displayName}. `;
  }
  if (ctx.dogs.length > 0) {
    const dogList = ctx.dogs
      .map(d => `${d.callName || d.name} (registered: ${d.name}, breed: ${d.breed})`)
      .join(', ');
    userPreamble += `Their dogs: ${dogList}. `;
    if (ctx.dogs.length > 1) {
      userPreamble += `When the user says "my dog" without specifying which one, ask them to clarify. `;
    }
  }
  if (ctx.showId && ctx.showName) {
    userPreamble += `The user is currently viewing show: "${ctx.showName}" (ID: ${ctx.showId}). Use this show context for queries unless they specify otherwise. `;
  }

  return `You are AskQ, an AI assistant for the myK9Show dog show management platform.

${userPreamble}

You help users with three types of questions:
1. RULES QUESTIONS - Use search_rules to look up official competition rules and regulations.
2. SHOW DATA QUESTIONS - Use get_class_summary, get_entry_results, get_trial_overview, or search_entries to query live show data.
3. APP HELP QUESTIONS - Use search_user_guide to find how-to instructions (when available).

DECISION LOGIC:
- If the question is about rules, regulations, requirements, or time limits -> use search_rules
- If the question is about results, entries, classes, trials, or schedules -> use show data tools
- If the question is about how to use the app -> use search_user_guide
- If the question is general app help and search_user_guide returns no results, give a brief helpful answer based on your knowledge

TOOL USAGE:
- Always use tools when data is needed. Never guess or make up show data.
- For rules questions, rely on the "measurements" JSON field for numerical data, NOT descriptive text.
- When the user asks about "my dog" or "my results", use their dog information provided above.

RESPONSE STYLE:
- Be concise and direct. Lead with the answer.
- Format data clearly with bullet points or short lists.
- If no data is found, say so clearly and suggest what the user could try instead.
- Do not speculate about data that wasn't returned by tools.`;
}
