// =====================================================
// Supabase Edge Function: validate-passcode
// =====================================================
// Purpose: Server-side passcode validation with rate limiting
//
// Security Features:
// - IP-based rate limiting (5 attempts per 15 min, 30 min block)
// - Server-side passcode validation (bypasses client-side checks)
// - Attempt logging for forensic analysis
// - Protection against brute force attacks
//
// This function replaces direct client-side database queries for auth.
//
// Validation strategy (post-Phase-0):
// Calls the `validate_passcode(p_code)` RPC, which looks up the passcode's
// HMAC-SHA256 hash (with Vault-stored pepper) in `public.show_passcodes`
// and returns `{show_id, role}` on match. The RPC also joins through
// `public.shows` and filters `deleted_at IS NULL`, so soft-deleted shows
// are excluded server-side.
//
// History: the previous revision of this file bridged the new RPC with a
// legacy UUID-derivation scan to support shows that pre-dated the
// `show_passcodes` table. Migration `20260526013506_show_passcodes_backfill`
// populated `show_passcodes` for every existing show, so the legacy
// fallback is now dead code and has been removed.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders } from './cors.ts';
import { getClientIP } from './clientIP.ts';
import { enforcePasscodeRateLimit, type RateLimitResult } from './rateLimitGate.ts';

interface ValidateRequest {
  passcode: string;
}

type Role = 'admin' | 'judge' | 'steward' | 'exhibitor';

interface ShowData {
  showId: string;
  showName: string;
  clubName: string;
  showDate: string;
  licenseKey: string;
  org: string;
  competition_type: string;
}

interface ShowRow {
  id: string;
  name: string;
  start_date: string;
  organization: string | null;
  is_nationals: boolean | null;
}

serve(async req => {
  const corsHeaders = getCorsHeaders(req.headers.get('origin'));

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Only accept POST
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    // Initialize Supabase client with service role
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Parse request body
    const body: ValidateRequest = await req.json();
    const { passcode } = body;

    if (!passcode || typeof passcode !== 'string') {
      return new Response(JSON.stringify({ error: 'Passcode is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get client IP
    const clientIP = getClientIP(req);
    const userAgent = req.headers.get('user-agent') || 'unknown';
    const passcodePrefix = passcode.charAt(0).toLowerCase();

    console.log(`[Auth] Login attempt from IP: ${clientIP}`);

    const rateLimitGate = await enforcePasscodeRateLimit({
      clientIP,
      checkRateLimit: () =>
        supabaseClient.rpc('check_login_rate_limit', { p_ip_address: clientIP }),
      recordBlockedAttempt: async () => {
        const { error } = await supabaseClient.rpc('record_login_attempt', {
          p_ip_address: clientIP,
          p_success: false,
          p_passcode_prefix: passcodePrefix,
          p_user_agent: userAgent,
        });
        if (error) throw error;
      },
      persistAlert: async alert => {
        const { error } = await supabaseClient.from('operator_alerts').insert(alert);
        if (error && error.code !== '23505') throw error;
      },
      logError: (message, error) => console.error(`[Auth] ${message}`, error),
    });

    if (rateLimitGate.kind === 'response') {
      return new Response(JSON.stringify(rateLimitGate.body), {
        status: rateLimitGate.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validate via HMAC-pepper RPC. Returns {show_id, role} on match (with
    // soft-deleted shows already filtered out server-side).
    let matchedShow: ShowRow | null = null;
    let matchedRole: Role | null = null;
    // J1.3 — the passcode GENERATION (show_passcodes.created_at) the code was
    // valid for, returned ATOMICALLY by validate_passcode. Stamping this (rather
    // than a separate follow-up SELECT) closes the validate-then-read race: if a
    // regeneration lands after validation, we stamp the OLD generation → the DB
    // tier revokes the claim (fail closed), never the reverse.
    let matchedGeneration: string | null = null;

    const { data: rpcRows, error: rpcError } = await supabaseClient.rpc('validate_passcode', {
      p_code: passcode.toLowerCase(),
    });

    if (rpcError) {
      console.error('[Auth] validate_passcode RPC error:', rpcError);
      return new Response(JSON.stringify({ error: 'Database error' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (Array.isArray(rpcRows) && rpcRows.length > 0) {
      const row = rpcRows[0] as { show_id: string; role: Role; passcode_generation: string };
      // Look up the show's display fields for the success response. The
      // `deleted_at` filter is defense-in-depth — validate_passcode already
      // joins through shows and excludes soft-deletes, so this filter only
      // fires if a show was soft-deleted in the ~milliseconds between the
      // RPC and this query (effectively unreachable but cheap).
      const { data: showRow, error: showErr } = await supabaseClient
        .from('shows')
        .select('id, name, start_date, organization, is_nationals')
        .eq('id', row.show_id)
        .is('deleted_at', null)
        .maybeSingle();

      if (showErr) {
        // The RPC proved the passcode is valid, but we couldn't load the
        // show's display fields. Surfacing this as `invalid_passcode` would
        // (a) lie to the user about an authoritative auth failure and
        // (b) waste a rate-limit attempt on a server-side fault. Return 500
        // instead — same shape the legacy bulk-shows error path used, and
        // the same shape the RPC-error branch above returns. The login
        // attempt is intentionally NOT recorded here (matches the RPC
        // error path) because the failure is server-side, not credential-
        // related, and rate-limit counters should track credential probes.
        console.error('[Auth] Show lookup error after successful RPC match:', showErr);
        return new Response(JSON.stringify({ error: 'Database error' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (showRow) {
        matchedShow = showRow as ShowRow;
        matchedRole = row.role;
        matchedGeneration = row.passcode_generation ?? null;
      }
    }

    // Record the attempt
    await supabaseClient.rpc('record_login_attempt', {
      p_ip_address: clientIP,
      p_success: !!matchedShow,
      p_passcode_prefix: passcodePrefix,
      p_license_key: matchedShow?.id || null,
      p_user_agent: userAgent,
    });

    // If no match, return auth failure
    if (!matchedShow || !matchedRole) {
      console.log(`[Auth] Invalid passcode from IP ${clientIP}`);

      // Get updated rate limit info for response
      const { data: newRateLimitData } = await supabaseClient.rpc('check_login_rate_limit', {
        p_ip_address: clientIP,
      });
      const newRateLimit = newRateLimitData?.[0] as RateLimitResult | undefined;

      return new Response(
        JSON.stringify({
          error: 'invalid_passcode',
          message: 'Invalid passcode. Please check and try again.',
          remaining_attempts: newRateLimit?.remaining_attempts ?? 4,
        }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ---------------------------------------------------------------------
    // Phase C — mint the ringside claim onto an ANONYMOUS caller's session.
    //
    // A passcode user (no account) signs in anonymously client-side first, so
    // this request carries that anon user's JWT as the Authorization bearer.
    // We stamp the SERVER-VALIDATED (show, role) into their app_metadata; the
    // client then refreshes its session so the reissued JWT carries the claim,
    // which the A+B DB tier (view + ringside_update_entry) authorizes on.
    //
    // SECURITY:
    //  * app_metadata is settable ONLY by the service role — forge-proof. The
    //    user cannot set it themselves; the DB reads app_metadata exclusively.
    //  * show_id / ringside_role come from `matchedShow`/`matchedRole` (the RPC
    //    result), NEVER from the request body — a caller cannot widen scope.
    //  * We stamp ONLY anonymous callers. A real account that enters a passcode
    //    keeps its account session untouched (its access is auth.uid()-based +
    //    a client-only UI grant) — we must NEVER write ringside claims into a
    //    real account's app_metadata.
    //  * Merge (don't clobber) existing app_metadata; set the explicit
    //    kind='ringside_passcode' marker the DB tier requires.
    // ---------------------------------------------------------------------
    let sessionStamped = false;
    const authHeader = req.headers.get('Authorization');
    const bearer = authHeader?.startsWith('Bearer ')
      ? authHeader.slice('Bearer '.length).trim()
      : null;
    // The anon publishable key is also a (user-less) JWT sent on unauthenticated
    // calls; getUser returns no user for it, so we simply skip stamping then.
    if (bearer) {
      const { data: userData, error: userErr } = await supabaseClient.auth.getUser(bearer);
      const caller = userData?.user;
      if (!userErr && caller?.is_anonymous === true) {
        // J1.3 — stamp the passcode GENERATION so the claim can be revoked when
        // the secretary regenerates codes. show_passcodes.created_at is bumped in
        // place on every regenerate_show_passcodes call (the row id is stable), so
        // it is a monotonic generation marker. The ringside RPCs + read view
        // re-look-up the current created_at and reject/narrow a claim whose stamped
        // generation no longer matches. matchedGeneration was returned ATOMICALLY by
        // validate_passcode (same row that matched the hash) — no separate SELECT,
        // no validate-then-read race.
        if (!matchedGeneration) {
          // Fail closed: without the generation marker the DB tier would reject
          // every write/heartbeat as a stale claim, so a "success" here would lie.
          console.error('[Auth] validate_passcode returned no generation for claim');
          return new Response(JSON.stringify({ error: 'session_error' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const { error: stampErr } = await supabaseClient.auth.admin.updateUserById(caller.id, {
          app_metadata: {
            ...(caller.app_metadata ?? {}),
            kind: 'ringside_passcode',
            show_id: matchedShow.id,
            ringside_role: matchedRole,
            passcode_generation: matchedGeneration,
          },
        });
        if (stampErr) {
          // Fail closed for the anon path: without the claim the user can read
          // nothing and score nothing, so surfacing success would be a lie.
          console.error('[Auth] Failed to stamp ringside claim on anon session:', stampErr);
          return new Response(JSON.stringify({ error: 'session_error' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        sessionStamped = true;
        console.log(`[Auth] Stamped ringside_passcode claim (role=${matchedRole}) on anon session`);
      }
    }

    // Success! Return show data
    console.log(`[Auth] Successful login for show: ${matchedShow.id.substring(0, 8)}...`);

    const showData: ShowData = {
      showId: matchedShow.id,
      showName: matchedShow.name,
      clubName: '',
      showDate: matchedShow.start_date,
      licenseKey: matchedShow.id,
      org: matchedShow.organization || '',
      // Nationals-vs-Regular routing context. Ringside consumers
      // (packages/ringside isNationalsCompetition) match the substring
      // 'national', so emit 'Nationals' / 'Regular' from shows.is_nationals
      // (added by migration 20260615160000 for placement finalization).
      competition_type: matchedShow.is_nationals ? 'Nationals' : 'Regular',
    };

    return new Response(
      JSON.stringify({
        success: true,
        role: matchedRole,
        showData,
        // True iff this request carried an anonymous session that we stamped
        // with the ringside claim. The client uses it to decide whether to
        // refresh the session before routing to /at-show.
        sessionStamped,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    // Log the full error server-side; do NOT leak internal error text (DB
    // structure, field names, stack hints) to the client.
    console.error('[Auth] Edge Function error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

console.log('validate-passcode Edge Function loaded');
