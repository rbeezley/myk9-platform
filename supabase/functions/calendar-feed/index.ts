// =====================================================
// Supabase Edge Function: calendar-feed
// =====================================================
// Serves an exhibitor's run schedule for one trial as an iCalendar document,
// for `webcal://` subscription and one-off `.ics` download (plan L5).
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
//   * A token scopes to exactly ONE exhibitor's entries in ONE trial.
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

  const token = new URL(req.url).searchParams.get('token')?.trim() ?? '';
  if (!TOKEN_PATTERN.test(token)) return notFound();

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data: tokenRow, error: tokenError } = await supabase
    .from('calendar_feed_tokens')
    .select('id, user_id, trial_id, revoked_at')
    .eq('token', token)
    .maybeSingle();

  if (tokenError) {
    console.error('calendar-feed: token lookup failed', tokenError.message);
    return new Response('Temporarily unavailable', { status: 503, headers: BASE_HEADERS });
  }
  if (!tokenRow || tokenRow.revoked_at) return notFound();

  const { user_id: userId, trial_id: trialId } = tokenRow as {
    id: string;
    user_id: string;
    trial_id: string;
    revoked_at: string | null;
  };

  const { data: trial, error: trialError } = await supabase
    .from('trials')
    .select('id, name, date, timezone, show:shows(name, venue_name, address, city, state)')
    .eq('id', trialId)
    .maybeSingle();

  if (trialError || !trial) {
    console.error('calendar-feed: trial lookup failed', trialError?.message);
    return notFound();
  }

  const trialRow = trial as unknown as {
    id: string;
    name: string | null;
    date: string;
    timezone: string | null;
    show?: {
      name?: string | null;
      venue_name?: string | null;
      address?: string | null;
      city?: string | null;
      state?: string | null;
    } | null;
  };

  // SCHEDULE ONLY. Every column here is something the exhibitor already sees
  // on their own entry; nothing about money or standing.
  const { data: entries, error: entriesError } = await supabase
    .from('entries')
    .select(
      'id, armband, dog:dogs!inner(call_name, owner_id, co_owner_id), class:classes!inner(id, name, start_time, estimated_duration, actual_start_time, actual_end_time, trial_id), handler:people!handler_id(auth_user_id)'
    )
    .eq('class.trial_id', trialId)
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
      trialRow.show?.venue_name,
      [trialRow.show?.address, trialRow.show?.city, trialRow.show?.state]
        .filter(Boolean)
        .join(', '),
    ]
      .filter(Boolean)
      .join('\n') || null;

  const timeZone = trialRow.timezone?.trim() || 'America/New_York';

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
      };
      handler?: { auth_user_id?: string | null } | null;
    };

    const isMine =
      (personId !== null &&
        (entry.dog?.owner_id === personId || entry.dog?.co_owner_id === personId)) ||
      entry.handler?.auth_user_id === userId;
    if (!isMine || !entry.class) continue;

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
      trialDate: trialRow.date,
      startTime: entry.class.start_time,
      actualStartTime: entry.class.actual_start_time,
      actualEndTime: entry.class.actual_end_time,
      estimatedDuration: entry.class.estimated_duration,
      timeZone,
      venue,
      armband: entry.armband,
      dogName: entry.dog?.call_name ?? null,
      trialName: trialRow.name,
    });
  }

  const calendarName = [trialRow.show?.name, trialRow.name].filter(Boolean).join(' — ') || 'My runs';
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
      'Content-Disposition': 'inline; filename="myk9show-runs.ics"',
    },
  });
});
