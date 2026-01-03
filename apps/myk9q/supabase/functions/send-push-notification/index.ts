// =====================================================
// Supabase Edge Function: send-push-notification
// =====================================================
// Purpose: Send Web Push notifications via database triggers
//
// User Identification:
// - user_id format: "{role}_{uuid}" (e.g., "exhibitor_a1b2c3d4-...")
// - Since passcodes are shared, each browser/device gets unique UUID
// - Generated on frontend and persists in localStorage
//
// Trigger Sources:
// - announcements table (INSERT) → sends announcement notifications
// - results table (UPDATE when is_scored changes) → sends "up soon" notifications
//
// This function is called via HTTP POST from database triggers

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Web Push library for Deno
// @deno-types="npm:@types/web-push"
import webpush from 'npm:web-push@3.6.7'

// Allowed origins for CORS
const ALLOWED_ORIGINS = [
  "https://myk9q.com",
  "https://www.myk9q.com",
  "https://app.myk9q.com",
];

/**
 * Get CORS headers with dynamic origin checking
 */
function getCorsHeaders(requestOrigin: string | null): Record<string, string> {
  const origin = requestOrigin && ALLOWED_ORIGINS.includes(requestOrigin)
    ? requestOrigin
    : ALLOWED_ORIGINS[0];

  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-trigger-secret',
  };
}

interface NotificationPayload {
  type: 'announcement' | 'up_soon'
  license_key: string
  [key: string]: any
}

interface PushSubscription {
  endpoint: string
  p256dh: string
  auth: string
  user_id: string
  notification_preferences: {
    announcements: boolean
    up_soon: boolean
    results: boolean
    favorite_armbands: number[]
  }
}

serve(async (req) => {
  // Get CORS headers based on request origin
  const corsHeaders = getCorsHeaders(req.headers.get("origin"));

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Authenticate requests from database triggers using shared secret
    const triggerSecret = Deno.env.get('TRIGGER_SECRET')
    const requestSecret = req.headers.get('x-trigger-secret')

    console.log(`[Auth Debug] TRIGGER_SECRET exists: ${!!triggerSecret}`)
    console.log(`[Auth Debug] Request has x-trigger-secret: ${!!requestSecret}`)
    console.log(`[Auth Debug] Secrets match: ${triggerSecret === requestSecret}`)

    // Check if request is from a database trigger (has trigger secret)
    const isFromTrigger = triggerSecret && requestSecret === triggerSecret

    console.log(`[Auth Debug] isFromTrigger: ${isFromTrigger}`)

    // For non-trigger requests, reject immediately (no direct API calls allowed)
    if (!isFromTrigger) {
      const authHeader = req.headers.get('authorization')
      console.log(`[Auth Debug] Authorization header exists: ${!!authHeader}`)
      console.log(`[Auth Rejection] Request rejected - invalid or missing trigger secret`)
      return new Response(
        JSON.stringify({
          error: 'Unauthorized - Invalid or missing trigger secret',
          message: 'This endpoint only accepts requests from database triggers with valid shared secret'
        }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Initialize Supabase client with service role key
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Parse notification payload from request body
    const payload: NotificationPayload = await req.json()

    console.log(`[Push Notification] Received ${payload.type} notification for license_key: ${payload.license_key}`)

    // Configure VAPID details for Web Push
    const vapidPublicKey = Deno.env.get('VITE_VAPID_PUBLIC_KEY')
    const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY')

    if (!vapidPublicKey || !vapidPrivateKey) {
      throw new Error('VAPID keys not configured')
    }

    webpush.setVapidDetails(
      'mailto:support@myk9q.com',
      vapidPublicKey,
      vapidPrivateKey
    )

    // Query push_subscriptions for this license_key
    const { data: subscriptions, error: subError } = await supabaseClient
      .from('push_subscriptions')
      .select('*')
      .eq('license_key', payload.license_key)
      .eq('is_active', true)

    if (subError) {
      console.error('[Push Notification] Error fetching subscriptions:', subError)
      throw subError
    }

    if (!subscriptions || subscriptions.length === 0) {
      console.log('[Push Notification] No active subscriptions found for license_key:', payload.license_key)
      return new Response(
        JSON.stringify({ success: true, sent: 0, message: 'No active subscriptions' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    console.log(`[Push Notification] Found ${subscriptions.length} active subscriptions`)

    // Filter subscriptions based on notification type and preferences
    const targetedSubscriptions = filterSubscriptionsByPreferences(
      subscriptions,
      payload
    )

    console.log(`[Push Notification] After filtering: ${targetedSubscriptions.length} targeted subscriptions`)

    // Send push notifications
    const results = await Promise.allSettled(
      targetedSubscriptions.map(async (sub) => {
        try {
          const pushSubscription = {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh,
              auth: sub.auth
            }
          }

          // Send the raw payload to service worker
          // Service worker will build notification options from this payload
          // Urgency levels: 'very-low', 'low', 'normal', 'high'
          // 'high' urgency helps notifications break through DND and appear more prominently
          const urgency = payload.type === 'up_soon' ? 'high' : 'normal'

          await webpush.sendNotification(
            pushSubscription,
            JSON.stringify(payload),
            {
              TTL: 3600, // 1 hour
              urgency: urgency,
            }
          )

          // Update last_used_at timestamp
          await supabaseClient
            .from('push_subscriptions')
            .update({ last_used_at: new Date().toISOString() })
            .eq('endpoint', sub.endpoint)

          console.log(`[Push Notification] ✓ Sent to user ${sub.user_id}`)
          return { success: true, user_id: sub.user_id }
        } catch (error: any) {
          console.error(`[Push Notification] ✗ Failed for user ${sub.user_id}:`, error)

          // Handle expired/invalid subscriptions (410 Gone)
          if (error.statusCode === 410 || error.statusCode === 404) {
            console.log(`[Push Notification] Deactivating expired subscription for user ${sub.user_id}`)
            await supabaseClient
              .from('push_subscriptions')
              .update({ is_active: false })
              .eq('endpoint', sub.endpoint)
          }

          return { success: false, user_id: sub.user_id, error: error.message }
        }
      })
    )

    // Count successes and failures
    const successful = results.filter(r => r.status === 'fulfilled' && (r.value as any).success).length
    const failed = results.length - successful

    console.log(`[Push Notification] Results: ${successful} sent, ${failed} failed`)

    return new Response(
      JSON.stringify({
        success: true,
        sent: successful,
        failed: failed,
        total: results.length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )

  } catch (error: any) {
    console.error('[Push Notification] Edge Function error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})

// Filter subscriptions based on notification type and user preferences
function filterSubscriptionsByPreferences(
  subscriptions: any[],
  payload: NotificationPayload
): PushSubscription[] {
  return subscriptions.filter(sub => {
    const prefs = sub.notification_preferences || {}

    // Check if user wants this type of notification
    if (payload.type === 'announcement' && !prefs.announcements) {
      return false
    }

    if (payload.type === 'up_soon') {
      // Check if user wants "up soon" notifications
      if (!prefs.up_soon) {
        return false
      }

      // Check if user has favorited this specific armband
      const favoriteArmbands = prefs.favorite_armbands || []
      if (!favoriteArmbands.includes(payload.armband_number)) {
        return false
      }
    }

    return true
  })
}

/* No-op to satisfy Deno Deploy */
console.log('Push notification Edge Function loaded')
