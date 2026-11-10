import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type { AskQShowRequest, ChatResponse, UserContext } from '../_shared/askq/types.ts';
import { executeTool } from '../_shared/askq/toolExecutor.ts';
import { collectSource } from '../_shared/askq/responseFormatter.ts';
import { callClaude } from '../_shared/askq/promptBuilder.ts';
import { ASKQ_GUIDES, ASKQ_RULEBOOKS } from '../_shared/askq/documentAssets.ts';
import { type AskQRulebookAsset, selectRulebook } from '../_shared/askq/documentContext.ts';
import { parseAskQRouting } from '../_shared/askq/requestRouting.ts';
import {
  answerQuestion,
  guideSourcesForEvent,
  routeMarkers,
} from '../_shared/askq/answerQuestion.ts';
import {
  getSupportEscalationForQuestion,
  isSupportModeEnabled,
  type SupportEscalationPayload,
} from '../_shared/askq/supportMode.ts';
import { reserveAskQQuery } from '../_shared/askq/askqRateLimit.ts';
import { classifyAskQFailure } from '../_shared/askq/askqFailure.ts';
import { describeShowRegistries } from '../_shared/askq/showRegistries.ts';
import { callerHasShowAccess } from '../_shared/askq/showAccess.ts';
import { callerHoldsStaffRole } from '../_shared/askq/guideScope.ts';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? 'http://localhost:5173',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function jsonResponse(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

function eventStreamResponse(
  sendEvents: (send: (event: string, data: unknown) => void) => void
): Response {
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      sendEvents(send);
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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: CORS_HEADERS });
  }

  const startTime = Date.now();
  // Set once a log row is reserved, so the catch can record what failed on it.
  let markReservedRow: (marker: string) => Promise<unknown> = async () => undefined;

  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return jsonResponse({ error: 'Missing authorization header' }, 401);
    }

    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!serviceRoleKey || !anthropicKey) {
      console.error('Missing required env vars: SUPABASE_SERVICE_ROLE_KEY or ANTHROPIC_API_KEY');
      return jsonResponse({ error: 'Service configuration error' }, 500);
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
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }
    if (user.is_anonymous === true) {
      return jsonResponse({ error: 'An account is required for AskQ' }, 403);
    }

    // Parse request — wrap in try/catch for malformed JSON
    let body: AskQShowRequest;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: 'Invalid JSON body' }, 400);
    }

    const { message, showId } = body;
    const supportMode = isSupportModeEnabled(body.supportMode);
    // questionMode is validated for the deployed client but no longer restricts sources.
    const routing = parseAskQRouting(body.questionMode, body.rulebookScope);
    if (!routing.ok) {
      return jsonResponse({ error: routing.error }, 400);
    }
    if (!message?.trim()) {
      return jsonResponse({ error: 'Message is required' }, 400);
    }
    if (message.length > 2000) {
      return jsonResponse({ error: 'Message too long (max 2000 characters)' }, 400);
    }
    // Validate showId format if provided
    if (showId && !UUID_RE.test(showId)) {
      return jsonResponse({ error: 'Invalid showId format' }, 400);
    }

    const serviceClient = createClient(Deno.env.get('SUPABASE_URL')!, serviceRoleKey);

    // Resolve basic account/show context before reserving quota.
    const [{ data: personData }, showResult] = await Promise.all([
      serviceClient
        .from('people')
        .select('id, first_name, last_name')
        .eq('auth_user_id', user.id)
        .single(),
      showId
        ? serviceClient.from('shows').select('name').eq('id', showId).single()
        : Promise.resolve({ data: null } as { data: null }),
    ]);

    let showData = showResult?.data ?? null;

    const reservation = await reserveAskQQuery(supabaseClient, message);
    if (reservation.status === 'unavailable') {
      console.error('AskQ quota reservation failed');
      return jsonResponse({ error: 'Service temporarily unavailable' }, 503);
    }
    if (reservation.status === 'limited') {
      return jsonResponse(
        {
          error: 'Daily limit reached',
          remaining: reservation.remaining,
          limit: reservation.limit,
          resetsAt: reservation.resetsAt,
        },
        429
      );
    }

    const logRow = { id: reservation.logId };
    markReservedRow = async marker =>
      await serviceClient
        .from('chatbot_query_log')
        .update({ tools_used: [marker], response_time_ms: Date.now() - startTime })
        .eq('id', reservation.logId);
    const { remaining, limit } = reservation;
    const supportQuestionEscalation = supportMode ? getSupportEscalationForQuestion(message) : null;

    if (supportQuestionEscalation) {
      const responseTimeMs = Date.now() - startTime;
      if (logRow?.id) {
        await serviceClient
          .from('chatbot_query_log')
          .update({
            tools_used: ['support_escalation'],
            response_time_ms: responseTimeMs,
          })
          .eq('id', logRow.id);
      }

      return buildSupportEscalationStream(supportQuestionEscalation, {
        remaining,
        limit,
        responseTimeMs,
        queryLogId: logRow?.id ?? null,
      });
    }

    const personId = personData?.id;
    const displayName = personData
      ? [personData.first_name, personData.last_name].filter(Boolean).join(' ')
      : null;

    let dogs: UserContext['dogs'] = [];
    if (personId) {
      const { data: dogData } = await serviceClient
        .from('dogs')
        .select('id, call_name, breed')
        .eq('owner_id', personId)
        .is('deleted_at', null);
      dogs = (dogData ?? []).map(d => ({
        id: d.id,
        callName: d.call_name,
        breed: d.breed,
      }));
    }

    // Verify the caller may see this show (same predicate the app uses) before using it as context
    let verifiedShowId: string | null = null;
    let showName: string | null = null;
    let showRulebooks: AskQRulebookAsset[] = [];
    let showRegistries: string[] = [];
    if (showId && showData?.name) {
      const hasAccess = await callerHasShowAccess(supabaseClient, showId);
      if (hasAccess) {
        verifiedShowId = showId;
        showName = showData.name;
        const { data: trialContexts } = await serviceClient
          .from('trials')
          .select('registry_id, trial_type')
          .eq('show_id', showId)
          .order('trial_number', { ascending: true });
        showRulebooks = selectUniqueRulebooksForTrials(trialContexts ?? []);
        showRegistries = describeShowRegistries(trialContexts ?? [], ASKQ_RULEBOOKS);
      }
    }

    const userContext: UserContext = {
      userId: user.id,
      displayName,
      dogs,
      showId: verifiedShowId,
      showName,
      showRegistries,
    };

    const hasStaffRole = await callerHoldsStaffRole(serviceClient, user.id);
    const sources: ChatResponse['sources'] = {};

    const answered = await answerQuestion({
      message,
      userContext,
      hasStaffRole,
      supportMode,
      rulebookScope: routing.rulebookScope,
      allGuides: ASKQ_GUIDES,
      allRulebooks: ASKQ_RULEBOOKS,
      showRulebooks,
      call: (messages, tools, system, maxTokens) =>
        callClaude(messages, anthropicKey, tools, system, maxTokens),
      runTool: async (name, input) => {
        const toolResult = await executeTool(
          name,
          input,
          serviceClient,
          '', // myK9Show uses show_id scoping via userContext, not license_key
          undefined,
          undefined,
          userContext,
          // Entry results are read as the caller, so the server's release
          // and privacy rules apply to them (MYK9-969).
          supabaseClient
        );
        // Fixed argument order: (sources, toolName, result)
        collectSource(sources, name, toolResult.result);
        return toolResult;
      },
    });
    const toolsUsed = answered.toolsUsed;
    const guideSources = guideSourcesForEvent(answered, supportMode);
    if (guideSources.length > 0) {
      sources.guide = guideSources;
    }
    const responseText = answered.text;
    const responseTimeMs = Date.now() - startTime;
    // Update the provisional log row with actual data
    const supportAnswerEscalation = answered.escalation;
    const loggedTools = [
      ...new Set([
        ...routeMarkers(answered.sources),
        ...toolsUsed,
        ...(supportAnswerEscalation
          ? [
              'support_escalation',
              answered.escalationCause === 'quote_rejected'
                ? 'support_quote_rejected'
                : 'support_handoff',
            ]
          : []),
      ]),
    ];

    if (logRow?.id) {
      await serviceClient
        .from('chatbot_query_log')
        .update({
          tools_used: loggedTools,
          response_time_ms: responseTimeMs,
        })
        .eq('id', logRow.id);
    }

    if (supportAnswerEscalation) {
      return buildSupportEscalationStream(supportAnswerEscalation, {
        remaining,
        limit,
        responseTimeMs,
        queryLogId: logRow?.id ?? null,
      });
    }

    return eventStreamResponse(send => {
      if (toolsUsed.length > 0) {
        send('tools_used', [...new Set(toolsUsed)]);
      }
      const hasAnySources = Object.values(sources).some(s => s && (s as unknown[]).length > 0);
      if (hasAnySources) {
        send('sources', sources);
      }

      const CHUNK_SIZE = 4;
      for (let i = 0; i < responseText.length; i += CHUNK_SIZE) {
        send('token', responseText.slice(i, i + CHUNK_SIZE));
      }

      send('meta', { remaining, limit, responseTimeMs, queryLogId: logRow?.id ?? null });
      send('done', {});
    });
  } catch (error) {
    // MYK9-684: one bare 500 hid every cause, and the reserved row stayed at
    // tools_used {} / response_time_ms 0 with nothing to say what went wrong.
    const failure = classifyAskQFailure(error);
    console.error('ask-myk9show error:', failure.logMarker, (error as Error).message);
    // Best effort: a failed audit write must not mask the answer to the client.
    await markReservedRow(failure.logMarker).catch(() => undefined);
    return jsonResponse(failure.body, failure.httpStatus);
  }
});

function buildSupportEscalationStream(
  escalation: SupportEscalationPayload,
  meta: { remaining: number; limit: number; responseTimeMs: number; queryLogId: string | null }
): Response {
  return eventStreamResponse(send => {
    send('support_escalation', escalation);
    send('meta', meta);
    send('done', {});
  });
}

function buildTextStream(
  text: string,
  meta: { remaining: number; limit: number; responseTimeMs: number; queryLogId: string | null }
): Response {
  return eventStreamResponse(send => {
    const CHUNK_SIZE = 4;
    for (let i = 0; i < text.length; i += CHUNK_SIZE) {
      send('token', text.slice(i, i + CHUNK_SIZE));
    }
    send('meta', meta);
    send('done', {});
  });
}

function selectUniqueRulebooksForTrials(
  trials: Array<{ registry_id?: string | null; trial_type?: string | null }>
): AskQRulebookAsset[] {
  const selected = new Map<string, AskQRulebookAsset>();
  for (const trial of trials) {
    const rulebook = selectRulebook(
      ASKQ_RULEBOOKS,
      trial.registry_id ?? undefined,
      trial.trial_type ?? undefined
    );
    if (rulebook) selected.set(rulebook.id, rulebook);
  }
  return [...selected.values()];
}
