// =====================================================
// Supabase Edge Function: calendar-feed
// =====================================================
// Serves an exhibitor's run schedule for one SHOW — every trial in it — as an
// iCalendar document, for `webcal://` subscription and `.ics` download (L5).
//
// Scoped per SHOW, not per trial: a show is the weekend an exhibitor entered,
// and one subscribe link per weekend is what they actually want. Each trial
// inside it still supplies its own date and timezone, so a multi-day show that
// spans a DST change stays correct.
//
// Deploy: supabase functions deploy calendar-feed --no-verify-jwt
//
// WHY THIS DOES NOT USE THE SHARED `handle()` ENVELOPE:
// that envelope calls `req.json()` unconditionally, rejects non-POST with 405,
// and wraps every return in `json()`. A calendar feed is the inverse of all
// three — a GET with no body, fetched by Google's and Apple's servers, that
// must answer `text/calendar`. So this follows the raw-serve pattern already
// used by validate-passcode and ask-myk9show.
//
// SECURITY MODEL: the URL is the credential. There is no session on a webcal
// fetch — no cookie, no Authorization header. Therefore:
//   * The token is 32 random bytes (see migration 20260816130000).
//   * A token scopes to exactly ONE exhibitor's entries in ONE show.
//   * The response carries SCHEDULE ONLY — class, venue, times, armband.
//     Never payment status, entry status, fees, or scores. The query below is
//     the enforcement point; keep it narrow.
//   * A revoked token is indistinguishable from a wrong one: both 404.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { buildIcsDocument, type CalendarClassEvent } from './icsBuilder.ts';

const TOKEN_PATTERN = /^[0-9a-f]{64}$/;

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const feedOrigin = (Deno.env.get('CALENDAR_FEED_ORIGIN') || 'myk9show.com').trim();

/** Calendar clients send bare GETs; no CORS preflight is involved. Kept
 *  permissive for read-only, non-credentialed content. */
const BASE_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'no-cache, max-age=0',
};

function notFound(): Response {
  // Deliberately identical for absent / malformed / revoked / unknown tokens:
  // a probing client learns nothing about which it was.
  return new Response('Not found', { status: 404, headers: BASE_HEADERS });
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: { ...BASE_HEADERS, 'Access-Control-Allow-Headers': 'content-type' },
    });
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return new Response('Method not allowed', { status: 405, headers: BASE_HEADERS });
  }

  const requestUrl = new URL(req.url);
  const token = requestUrl.searchParams.get('token')?.trim() ?? '';
  if (!TOKEN_PATTERN.test(token)) return notFound();

  // `download=1` is the one-off snapshot; without it the response is inline,
  // which is what a subscribing calendar client expects.
  const asAttachment = requestUrl.searchParams.get('download') === '1';

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data: tokenRow, error: tokenError } = await supabase
    .from('calendar_feed_tokens')
    .select('id, user_id, show_id, revoked_at')
    .eq('token', token)
    .maybeSingle();

  if (tokenError) {
    console.error('calendar-feed: token lookup failed', tokenError.message);
    return new Response('Temporarily unavailable', { status: 503, headers: BASE_HEADERS });
  }
  if (!tokenRow || tokenRow.revoked_at) return notFound();

  const { user_id: userId, show_id: showId } = tokenRow as {
    id: string;
    user_id: string;
    show_id: string;
    revoked_at: string | null;
  };

  // A show spans several trials (days/rings); the feed covers the whole
  // weekend, and each trial carries its OWN date and timezone.
  const { data: show, error: showError } = await supabase
    .from('shows')
    .select('id, name, venue_name, address, city, state, trials(id, name, date, timezone)')
    .eq('id', showId)
    .is('deleted_at', null)
    .maybeSingle();

  if (showError || !show) {
    console.error('calendar-feed: show lookup failed', showError?.message);
    return notFound();
  }

  const showRow = show as unknown as {
    id: string;
    name: string | null;
    venue_name: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    trials?: Array<{ id: string; name: string | null; date: string; timezone: string | null }>;
  };

  const trialsById = new Map(
    (showRow.trials ?? []).map(t => [t.id, t] as const)
  );
  if (trialsById.size === 0) {
    console.error('calendar-feed: show has no trials', showId);
  }

  // SCHEDULE ONLY. Every column here is something the exhibitor already sees
  // on their own entry; nothing about money or standing.
  const { data: entries, error: entriesError } = await supabase
    .from('entries')
    .select(
      'id, armband, dog:dogs!inner(call_name, owner_id, co_owner_id), class:classes!inner(id, name, start_time, estimated_duration, actual_start_time, actual_end_time, trial_id), handler:people!handler_id(auth_user_id)'
    )
    .in('class.trial_id', [...trialsById.keys()])
    .is('deleted_at', null)
    .not('entry_status', 'in', '("withdrawn","scratched","absent")');

  if (entriesError) {
    console.error('calendar-feed: entry lookup failed', entriesError.message);
    return new Response('Temporarily unavailable', { status: 503, headers: BASE_HEADERS });
  }

  // Resolve which of those entries belong to THIS account. Ownership lives on
  // people rows, so map the account to its person id first.
  const { data: person } = await supabase
    .from('people')
    .select('id')
    .eq('auth_user_id', userId)
    .maybeSingle();
  const personId = (person as { id?: string } | null)?.id ?? null;

  const venue =
    [
      showRow.venue_name,
      [showRow.address, showRow.city, showRow.state].filter(Boolean).join(', '),
    ]
      .filter(Boolean)
      .join('\n') || null;

  // One event per class, deduped: an exhibitor with two dogs in the same class
  // gets one calendar entry, not two overlapping ones.
  const eventsByClass = new Map<string, CalendarClassEvent>();

  for (const raw of entries ?? []) {
    const entry = raw as unknown as {
      id: string;
      armband: number | null;
      dog?: { call_name?: string | null; owner_id?: string | null; co_owner_id?: string | null };
      class?: {
        id: string;
        name: string | null;
        start_time: string | null;
        estimated_duration: number | null;
        actual_start_time: string | null;
        actual_end_time: string | null;
        trial_id: string;
      };
      handler?: { auth_user_id?: string | null } | null;
    };

    const isMine =
      (personId !== null &&
        (entry.dog?.owner_id === personId || entry.dog?.co_owner_id === personId)) ||
      entry.handler?.auth_user_id === userId;
    if (!isMine || !entry.class) continue;

    // Each class belongs to a trial, and each trial carries its own date and
    // zone — a multi-day show can legitimately span a DST change.
    const trial = trialsById.get(entry.class.trial_id);
    if (!trial) continue;

    const existing = eventsByClass.get(entry.class.id);
    if (existing) {
      // Second dog in the same class — keep the event, drop the per-dog naming
      // rather than claim it is only about one of them.
      existing.dogName = null;
      existing.armband = null;
      continue;
    }

    eventsByClass.set(entry.class.id, {
      classId: entry.class.id,
      className: entry.class.name ?? 'Class',
      trialDate: trial.date,
      startTime: entry.class.start_time,
      actualStartTime: entry.class.actual_start_time,
      actualEndTime: entry.class.actual_end_time,
      estimatedDuration: entry.class.estimated_duration,
      timeZone: trial.timezone?.trim() || 'America/New_York',
      venue,
      armband: entry.armband,
      dogName: entry.dog?.call_name ?? null,
      trialName: trial.name,
    });
  }

  const calendarName = showRow.name ?? 'My runs';
  const ics = buildIcsDocument({
    calendarName,
    events: [...eventsByClass.values()],
    dtstamp: new Date(),
    origin: feedOrigin,
  });

  // Best-effort telemetry: whether anyone actually subscribes decides if this
  // feature earns its keep. Never block the response on it.
  supabase
    .from('calendar_feed_tokens')
    .update({ last_fetched_at: new Date().toISOString() })
    .eq('id', (tokenRow as { id: string }).id)
    .then(undefined, () => undefined);

  return new Response(req.method === 'HEAD' ? null : ics, {
    status: 200,
    headers: {
      ...BASE_HEADERS,
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `${asAttachment ? 'attachment' : 'inline'}; filename="myk9show-runs.ics"`,
    },
  });
});
