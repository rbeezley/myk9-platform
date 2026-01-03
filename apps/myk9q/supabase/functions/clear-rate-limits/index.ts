// =====================================================
// Supabase Edge Function: clear-rate-limits
// =====================================================
// Purpose: Clear rate limit entries for E2E testing
//
// Security:
// - Requires X-E2E-Test header with specific value
// - Only clears entries from the last hour (not all historical data)
// - Logs all calls for audit trail

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-e2e-test',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// Secret key for E2E tests - must match CI workflow
const E2E_TEST_KEY = 'myK9Q-e2e-test-2024'

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
    // Verify E2E test header
    const e2eHeader = req.headers.get('x-e2e-test')
    if (e2eHeader !== E2E_TEST_KEY) {
      console.log('[ClearRateLimits] Unauthorized attempt - invalid or missing X-E2E-Test header')
      return new Response(
        JSON.stringify({ error: 'Unauthorized', message: 'This endpoint is for E2E testing only' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Initialize Supabase client with service role
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Clear rate limit entries from the last 2 hours only
    // This is conservative - E2E tests shouldn't have entries older than this
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()

    const { data, error } = await supabaseClient
      .from('login_attempts')
      .delete()
      .gte('attempted_at', twoHoursAgo)
      .select('id')

    if (error) {
      console.error('[ClearRateLimits] Delete error:', error)
      return new Response(
        JSON.stringify({ error: 'Database error', details: error.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const deletedCount = data?.length ?? 0
    console.log(`[ClearRateLimits] Cleared ${deletedCount} rate limit entries (last 2 hours)`)

    return new Response(
      JSON.stringify({
        success: true,
        message: `Cleared ${deletedCount} rate limit entries`,
        deleted_count: deletedCount
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: any) {
    console.error('[ClearRateLimits] Edge Function error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

console.log('clear-rate-limits Edge Function loaded')
