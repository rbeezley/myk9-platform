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

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// CORS headers - allow requests from app domain
const corsHeaders = {
  'Access-Control-Allow-Origin': '*', // Production should restrict to app.myk9q.com
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface ValidateRequest {
  passcode: string
}

interface RateLimitResult {
  allowed: boolean
  attempts_count: number
  remaining_attempts: number
  blocked_until: string | null
  message: string
}

interface PasscodeResult {
  role: 'admin' | 'judge' | 'steward' | 'exhibitor'
  licenseKey: string
  isValid: boolean
}

interface ShowData {
  showId: string
  showName: string
  clubName: string
  showDate: string
  licenseKey: string
  org: string
  competition_type: string
}

// Parse passcode to extract role
function parsePasscode(passcode: string): PasscodeResult {
  if (!passcode || passcode.length !== 5) {
    return { role: 'exhibitor', licenseKey: '', isValid: false }
  }

  const rolePrefix = passcode.charAt(0).toLowerCase()
  const digits = passcode.slice(1)

  let role: 'admin' | 'judge' | 'steward' | 'exhibitor'
  switch (rolePrefix) {
    case 'a': role = 'admin'; break
    case 'j': role = 'judge'; break
    case 's': role = 'steward'; break
    case 'e': role = 'exhibitor'; break
    default: return { role: 'exhibitor', licenseKey: '', isValid: false }
  }

  return { role, licenseKey: digits, isValid: true }
}

// Generate passcodes from license key
function generatePasscodesFromLicenseKey(licenseKey: string): {
  admin: string; judge: string; steward: string; exhibitor: string
} | null {
  if (!licenseKey) return null

  const parts = licenseKey.split('-')
  if (parts.length !== 4) return null

  return {
    admin: `a${parts[1].slice(0, 4)}`,
    judge: `j${parts[1].slice(4, 8)}`,
    steward: `s${parts[2].slice(0, 4)}`,
    exhibitor: `e${parts[3].slice(0, 4)}`
  }
}

// Validate passcode against a license key
function validatePasscodeAgainstLicenseKey(
  passcode: string,
  licenseKey: string
): PasscodeResult | null {
  const parsed = parsePasscode(passcode)
  if (!parsed.isValid) return null

  const generated = generatePasscodesFromLicenseKey(licenseKey)
  if (!generated) return null

  const isValid = Object.values(generated).includes(passcode.toLowerCase())
  if (!isValid) return null

  return { ...parsed, licenseKey }
}

// Get client IP from request headers
function getClientIP(req: Request): string {
  // Vercel/Cloudflare headers
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) {
    return forwarded.split(',')[0].trim()
  }

  // Cloudflare specific
  const cfIP = req.headers.get('cf-connecting-ip')
  if (cfIP) return cfIP

  // Vercel specific
  const realIP = req.headers.get('x-real-ip')
  if (realIP) return realIP

  // Fallback
  return 'unknown'
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // Only accept POST
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  try {
    // Initialize Supabase client with service role
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Parse request body
    const body: ValidateRequest = await req.json()
    const { passcode } = body

    if (!passcode || typeof passcode !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Passcode is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get client IP
    const clientIP = getClientIP(req)
    const userAgent = req.headers.get('user-agent') || 'unknown'
    const passcodePrefix = passcode.charAt(0).toLowerCase()

    console.log(`[Auth] Login attempt from IP: ${clientIP}, prefix: ${passcodePrefix}`)

    // Check rate limit
    const { data: rateLimitData, error: rateLimitError } = await supabaseClient
      .rpc('check_login_rate_limit', { p_ip_address: clientIP })

    if (rateLimitError) {
      console.error('[Auth] Rate limit check error:', rateLimitError)
      // Continue without rate limiting if function fails (fail open for availability)
    }

    const rateLimit = rateLimitData?.[0] as RateLimitResult | undefined

    // If rate limited, return 429
    if (rateLimit && !rateLimit.allowed) {
      console.log(`[Auth] IP ${clientIP} is rate limited: ${rateLimit.message}`)

      // Record blocked attempt
      await supabaseClient.rpc('record_login_attempt', {
        p_ip_address: clientIP,
        p_success: false,
        p_passcode_prefix: passcodePrefix,
        p_user_agent: userAgent
      })

      return new Response(
        JSON.stringify({
          error: 'rate_limited',
          message: rateLimit.message,
          blocked_until: rateLimit.blocked_until,
          remaining_attempts: 0
        }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Fetch all shows to check passcode
    const { data: shows, error: showsError } = await supabaseClient
      .from('shows')
      .select('id, show_name, club_name, start_date, license_key, organization, show_type')
      .order('created_at', { ascending: false })

    if (showsError) {
      console.error('[Auth] Error fetching shows:', showsError)
      return new Response(
        JSON.stringify({ error: 'Database error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Debug: Log shows count and license keys for troubleshooting
    console.log(`[Auth] Found ${shows?.length || 0} shows in database`)
    if (shows && shows.length > 0) {
      const licenseKeys = shows.map(s => s.license_key?.substring(0, 15) + '...')
      console.log(`[Auth] License key prefixes: ${licenseKeys.join(', ')}`)
    }

    // Validate passcode against each show
    let matchedShow: any = null
    let validationResult: PasscodeResult | null = null

    for (const show of shows || []) {
      const result = validatePasscodeAgainstLicenseKey(passcode, show.license_key)
      if (result) {
        matchedShow = show
        validationResult = result
        break
      }
    }

    // Record the attempt
    await supabaseClient.rpc('record_login_attempt', {
      p_ip_address: clientIP,
      p_success: !!matchedShow,
      p_passcode_prefix: passcodePrefix,
      p_license_key: matchedShow?.license_key || null,
      p_user_agent: userAgent
    })

    // If no match, return auth failure
    if (!matchedShow || !validationResult) {
      console.log(`[Auth] Invalid passcode from IP ${clientIP}`)

      // Get updated rate limit info for response
      const { data: newRateLimitData } = await supabaseClient
        .rpc('check_login_rate_limit', { p_ip_address: clientIP })
      const newRateLimit = newRateLimitData?.[0] as RateLimitResult | undefined

      return new Response(
        JSON.stringify({
          error: 'invalid_passcode',
          message: 'Invalid passcode. Please check and try again.',
          remaining_attempts: newRateLimit?.remaining_attempts ?? 4
        }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Success! Return show data
    console.log(`[Auth] Successful login for license: ${matchedShow.license_key.substring(0, 10)}...`)

    const showData: ShowData = {
      showId: matchedShow.id.toString(),
      showName: matchedShow.show_name,
      clubName: matchedShow.club_name,
      showDate: matchedShow.start_date,
      licenseKey: matchedShow.license_key,
      org: matchedShow.organization || '',
      competition_type: matchedShow.show_type || 'Regular'
    }

    return new Response(
      JSON.stringify({
        success: true,
        role: validationResult.role,
        showData
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: any) {
    console.error('[Auth] Edge Function error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

console.log('validate-passcode Edge Function loaded')
