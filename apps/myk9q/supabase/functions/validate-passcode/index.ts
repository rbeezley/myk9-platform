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
// This function replaces direct client-side database queries for auth

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// CORS configuration - restrict to known app domains.
// myk9-platform-myk9q.vercel.app is the unified-platform myK9Q staging
// surface; without it staging POSTs are rejected at the preflight, the
// fetch in authService.ts throws, and we silently fall back to the
// client-side legacy validator — which cannot validate the new
// HMAC-hashed random show_passcodes, so every staging login fails.
const ALLOWED_ORIGINS = [
  'https://myk9q.com',
  'https://www.myk9q.com',
  'https://app.myk9q.com',
  'https://myk9-platform-myk9q.vercel.app',
  'https://myk9-platform-myk9show.vercel.app',
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

interface PasscodeResult {
  role: 'admin' | 'judge' | 'steward' | 'exhibitor';
  licenseKey: string;
  isValid: boolean;
}

interface ShowData {
  showId: string;
  showName: string;
  clubName: string;
  showDate: string;
  licenseKey: string;
  org: string;
  competition_type: string;
}

// Parse passcode to extract role
function parsePasscode(passcode: string): PasscodeResult {
  if (!passcode || passcode.length !== 5) {
    return { role: 'exhibitor', licenseKey: '', isValid: false };
  }

  const rolePrefix = passcode.charAt(0).toLowerCase();
  const digits = passcode.slice(1);

  let role: 'admin' | 'judge' | 'steward' | 'exhibitor';
  switch (rolePrefix) {
    case 'a':
      role = 'admin';
      break;
    case 'j':
      role = 'judge';
      break;
    case 's':
      role = 'steward';
      break;
    case 'e':
      role = 'exhibitor';
      break;
    default:
      return { role: 'exhibitor', licenseKey: '', isValid: false };
  }

  return { role, licenseKey: digits, isValid: true };
}

// Generate passcodes from show UUID or legacy license key
function generatePasscodesFromLicenseKey(licenseKey: string): {
  admin: string;
  judge: string;
  steward: string;
  exhibitor: string;
} | null {
  if (!licenseKey) return null;

  const parts = licenseKey.split('-');

  if (parts.length === 5) {
    // UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
    return {
      admin: `a${parts[1]}`,
      judge: `j${parts[2]}`,
      steward: `s${parts[3]}`,
      exhibitor: `e${parts[4].slice(0, 4)}`,
    };
  }

  if (parts.length === 4) {
    // Legacy format: myK9Q1-8hex-8hex-8hex
    return {
      admin: `a${parts[1].slice(0, 4)}`,
      judge: `j${parts[1].slice(4, 8)}`,
      steward: `s${parts[2].slice(0, 4)}`,
      exhibitor: `e${parts[3].slice(0, 4)}`,
    };
  }

  return null;
}

// Validate passcode against a license key
function validatePasscodeAgainstLicenseKey(
  passcode: string,
  licenseKey: string
): PasscodeResult | null {
  const parsed = parsePasscode(passcode);
  if (!parsed.isValid) return null;

  const generated = generatePasscodesFromLicenseKey(licenseKey);
  if (!generated) return null;

  const isValid = Object.values(generated).includes(passcode.toLowerCase());
  if (!isValid) return null;

  return { ...parsed, licenseKey };
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

    // Fetch all shows to check passcode. The legacy column `type` no longer
    // exists — it was renamed to `organization` (the AKC/UKC sanctioning
    // body), which is already selected and surfaced as `org` below. There
    // is NO direct successor column for what `type` was used for in the
    // original `competition_type` assignment (Nationals vs Regular); that
    // distinction now lives elsewhere in the schema. See the TODO at the
    // competition_type assignment for the wiring needed before Phase 1.
    //
    // (Earlier revisions of this fix mistakenly substituted `shows.style`,
    // which is the premium landing experience from migration 195 —
    // monogram/heritage — and not a competition-context field.)
    //
    // The bug was symptomless until now because myK9Q's client-side
    // authService.ts does its own scan and never invokes this function.
    // The Phase 1 smart input WILL invoke it, so fix-while-touching.
    //
    // SOFT-DELETE FILTER (deleted_at IS NULL) — closes the same
    // soft-delete gap the validate_passcode RPC closes server-side. Both
    // the new-RPC-result `find` AND the legacy UUID-derivation scan
    // iterate this list; filtering at the query keeps soft-deleted shows
    // out of both paths in one place. validate_passcode now also filters
    // server-side (migration 20260526013506), so this filter is
    // defense-in-depth on the edge-function side and required correctness
    // on the legacy-scan side until the legacy fallback is deleted in the
    // next sub-PR.
    const { data: shows, error: showsError } = await supabaseClient
      .from('shows')
      .select('id, name, start_date, organization')
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (showsError) {
      console.error('[Auth] Error fetching shows:', showsError);
      return new Response(JSON.stringify({ error: 'Database error' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Debug: Log shows count and license keys for troubleshooting
    console.log(`[Auth] Found ${shows?.length || 0} shows in database`);
    if (shows && shows.length > 0) {
      const showIds = shows.map((s: { id: string }) => s.id.substring(0, 8) + '...');
      console.log(`[Auth] Show ID prefixes: ${showIds.join(', ')}`);
    }

    // Validate passcode against each show
    let matchedShow: any = null;
    let validationResult: PasscodeResult | null = null;

    // 1. Try the new HMAC-pepper lookup first. show_passcodes is populated
    // by insert_show_passcodes for every show created via the unified
    // wizard. This bridges new server-generated codes during the
    // Phase 0 PR-1 → PR-2 transition: until packages/ringside ships, both
    // the new RPC lookup and the legacy UUID-derivation scan are tried.
    const { data: rpcRows, error: rpcError } = await supabaseClient.rpc('validate_passcode', {
      p_code: passcode.toLowerCase(),
    });
    if (rpcError) {
      console.warn('[Auth] validate_passcode RPC failed; falling back to legacy scan:', rpcError);
    } else if (Array.isArray(rpcRows) && rpcRows.length > 0) {
      const row = rpcRows[0] as { show_id: string; role: string };
      const showRow = (shows || []).find((s: { id: string }) => s.id === row.show_id);
      if (showRow) {
        matchedShow = showRow;
        validationResult = {
          role: row.role as PasscodeResult['role'],
          licenseKey: row.show_id,
          isValid: true,
        };
      }
    }

    // 2. Fall back to the legacy UUID-derivation scan — but ONLY over shows
    // that don't yet have show_passcodes rows. Once a show is "migrated"
    // (insert_show_passcodes has run for it) its random codes are the only
    // valid ones; accepting the deterministic UUID-derived codes too would
    // leak admin/judge access to anyone holding the show id (which is
    // effectively public — it's in every URL). The set of migrated shows
    // shrinks the legacy accept-list to zero once PR #2's backfill lands;
    // the fallback then becomes dead code that PR #2 can remove.
    if (!matchedShow) {
      const { data: migratedRows, error: migratedErr } = await supabaseClient
        .from('show_passcodes')
        .select('show_id');
      if (migratedErr) {
        console.warn('[Auth] show_passcodes membership query failed; refusing legacy scan to avoid double-accept:', migratedErr);
      } else {
        const migratedShowIds = new Set(
          (migratedRows || []).map((r: { show_id: string }) => r.show_id)
        );
        for (const show of shows || []) {
          if (migratedShowIds.has(show.id)) continue;
          const result = validatePasscodeAgainstLicenseKey(passcode, show.id);
          if (result) {
            matchedShow = show;
            validationResult = result;
            break;
          }
        }
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
    if (!matchedShow || !validationResult) {
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
      // the original code's fallback semantics (the `|| 'Regular'` always
      // fired because the column was broken anyway), but suppresses
      // Nationals-only behavior — track in Phase 1 follow-up.
      competition_type: 'Regular',
    };

    return new Response(
      JSON.stringify({
        success: true,
        role: validationResult.role,
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
