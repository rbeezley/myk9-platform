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

// CORS configuration - restrict to known app domains
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
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

interface ValidateRequest {
  passcode: string;
}

interface RateLimitResult {
  allowed: boolean;
  attempts_count: number;
  remaining_attempts: number;
  blocked_until: string | null;
  message: string;
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
}

// Get client IP from request headers
function getClientIP(req: Request): string {
  // Vercel/Cloudflare headers
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }

  // Cloudflare specific
  const cfIP = req.headers.get('cf-connecting-ip');
  if (cfIP) return cfIP;

  // Vercel specific
  const realIP = req.headers.get('x-real-ip');
  if (realIP) return realIP;

  // Fallback
  return 'unknown';
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

    console.log(`[Auth] Login attempt from IP: ${clientIP}, prefix: ${passcodePrefix}`);

    // Check rate limit
    const { data: rateLimitData, error: rateLimitError } = await supabaseClient.rpc(
      'check_login_rate_limit',
      { p_ip_address: clientIP }
    );

    if (rateLimitError) {
      console.error('[Auth] Rate limit check error:', rateLimitError);
      // Continue without rate limiting if function fails (fail open for availability)
    }

    const rateLimit = rateLimitData?.[0] as RateLimitResult | undefined;

    // If rate limited, return 429
    if (rateLimit && !rateLimit.allowed) {
      console.log(`[Auth] IP ${clientIP} is rate limited: ${rateLimit.message}`);

      // Record blocked attempt
      await supabaseClient.rpc('record_login_attempt', {
        p_ip_address: clientIP,
        p_success: false,
        p_passcode_prefix: passcodePrefix,
        p_user_agent: userAgent,
      });

      return new Response(
        JSON.stringify({
          error: 'rate_limited',
          message: rateLimit.message,
          blocked_until: rateLimit.blocked_until,
          remaining_attempts: 0,
        }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate via HMAC-pepper RPC. Returns {show_id, role} on match (with
    // soft-deleted shows already filtered out server-side).
    let matchedShow: ShowRow | null = null;
    let matchedRole: Role | null = null;

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
      const row = rpcRows[0] as { show_id: string; role: Role };
      // Look up the show's display fields for the success response. The
      // `deleted_at` filter is defense-in-depth — validate_passcode already
      // joins through shows and excludes soft-deletes, so this filter only
      // fires if a show was soft-deleted in the ~milliseconds between the
      // RPC and this query (effectively unreachable but cheap).
      const { data: showRow, error: showErr } = await supabaseClient
        .from('shows')
        .select('id, name, start_date, organization')
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

    // Success! Return show data
    console.log(`[Auth] Successful login for show: ${matchedShow.id.substring(0, 8)}...`);

    const showData: ShowData = {
      showId: matchedShow.id,
      showName: matchedShow.name,
      clubName: '',
      showDate: matchedShow.start_date,
      licenseKey: matchedShow.id,
      org: matchedShow.organization || '',
      // TODO(phase-1): wire the real Nationals/Regular source before the
      // smart-input edge function starts invoking this path in production.
      // Downstream consumers (apps/myk9q/src/contexts/AuthContext.tsx,
      // apps/myk9q/src/utils/sortableEntryCardUtils.ts) interpret
      // `competition_type` as Nationals-vs-Regular routing context. The
      // original `matchedShow.type` column was renamed to `organization`
      // (now surfaced as `org` above), so there's no longer a direct
      // column to map from — the right source is likely a per-trial or
      // per-show flag added separately. Defaulting to 'Regular' preserves
      // the original code's fallback semantics — track in Phase 1 follow-up.
      competition_type: 'Regular',
    };

    return new Response(
      JSON.stringify({
        success: true,
        role: matchedRole,
        showData,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('[Auth] Edge Function error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

console.log('validate-passcode Edge Function loaded');
