// stripe-approve-refund (MYK9-876): a site admin approves ONE queued refund
// (public.refund_requests) and this function issues it. Refunds are never
// automatic: stripe-webhook only queues them and alerts; the Stripe call
// happens here, behind a person's explicit approval. The exactly-once logic
// lives in ../_shared/refundApproval.ts (colocated vitest); this file is the
// Deno glue: CORS, authentication, and the site-admin check.
//
// Site admin only: every queued refund comes out of the PLATFORM balance
// (separate charges and transfers), for lines that never became paid entries.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import Stripe from 'npm:stripe@17.7.0';
import { createClient } from 'npm:@supabase/supabase-js@2.49.1';
import { alertAdmin } from '../_shared/alertAdmin.ts';
import { approveRefundRequest, type ApprovalRefund } from '../_shared/refundApproval.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
const stripeSecret = Deno.env.get('STRIPE_SECRET_KEY')!;

if (!supabaseUrl || !supabaseServiceKey || !supabaseAnonKey || !stripeSecret) {
  throw new Error('Missing required environment variables');
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);
const stripe = new Stripe(stripeSecret, {
  appInfo: { name: 'myK9Show', version: '1.0.0' },
});

const ALLOWED_ORIGINS = [
  'https://myk9show.com',
  'https://www.myk9show.com',
  'https://app.myk9show.com',
  'https://myk9-platform-myk9show.vercel.app',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5173',
];

function corsHeaders(requestOrigin: string | null): Record<string, string> {
  const origin =
    requestOrigin && ALLOWED_ORIGINS.includes(requestOrigin) ? requestOrigin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
}

function json(headers: Record<string, string>, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async req => {
  const headers = corsHeaders(req.headers.get('origin'));
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (req.method !== 'POST') return json(headers, { error: 'Method not allowed' }, 405);

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json(headers, { error: 'Missing Authorization header' }, 401);
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authError || !user) return json(headers, { error: 'Authentication failed' }, 401);

    // Evaluated AS THE CALLER through the canonical predicate.
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: isSiteAdmin, error: adminError } = await userClient.rpc('is_site_admin');
    if (adminError || isSiteAdmin !== true) {
      return json(headers, { error: 'Only a site admin can approve refunds' }, 403);
    }

    const body = (await req.json().catch(() => ({}))) as { refund_request_id?: unknown };
    const requestId = body.refund_request_id;
    if (typeof requestId !== 'string' || !UUID_RE.test(requestId)) {
      return json(headers, { error: 'refund_request_id must be a uuid' }, 400);
    }

    const result = await approveRefundRequest(
      {
        rpc: (fn, args) => supabase.rpc(fn, args),
        alertAdmin,
        listRefunds: async paymentIntentId =>
          (await stripe.refunds.list({ payment_intent: paymentIntentId, limit: 100 }))
            .data as ApprovalRefund[],
        createRefund: async (params, idempotencyKey) =>
          (await stripe.refunds.create(params, { idempotencyKey })) as ApprovalRefund,
      },
      { requestId, actorAuthUserId: user.id }
    );
    return json(headers, result.body, result.status);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('stripe-approve-refund error:', message);
    return json(headers, { error: 'Refund approval failed' }, 500);
  }
});
