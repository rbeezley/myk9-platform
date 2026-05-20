import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import webpush from 'npm:web-push@3';

import { handle } from '../_shared/http/handler.ts';
import { MYK9SHOW_ORIGINS } from '../_shared/http/cors.ts';
import { HttpError } from '../_shared/http/responses.ts';

const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY')!;
const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY')!;
const vapidSubject = Deno.env.get('VAPID_SUBJECT') || 'mailto:support@myk9show.com';

webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

interface SendPushPayload {
  user_id?: string;
  payload?: unknown;
}

// Dual-mode auth: accepts either service-role key (server-to-server, used by
// push-trigger-* webhooks via supabase.functions.invoke) or user JWT (client
// pushing to themselves). The envelope's built-in JWT validation can't
// express this contract, so we use auth: 'none' and validate in-handler.
handle<SendPushPayload>(
  { auth: 'none', origins: MYK9SHOW_ORIGINS },
  async ({ req, body, supabase }) => {
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      throw new HttpError(401, 'Unauthorized');
    }

    const { user_id, payload } = body;

    if (!user_id || !payload) {
      throw new HttpError(400, 'user_id and payload are required');
    }

    // If not service role key, verify as JWT and enforce self-send only
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    if (token !== supabaseServiceKey) {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser(token);
      if (authError || !user) {
        throw new HttpError(401, 'Invalid token');
      }
      if (user.id !== user_id) {
        throw new HttpError(403, 'Cannot send push to other users');
      }
    }

    const { data: subscriptions, error } = await supabase
      .from('push_subscriptions')
      .select('endpoint, keys')
      .eq('user_id', user_id);

    if (error) throw error;
    if (!subscriptions?.length) {
      return { sent: 0, message: 'No subscriptions found' };
    }

    let sent = 0;
    const errors: string[] = [];
    const expiredEndpoints: string[] = [];

    for (const sub of subscriptions) {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: sub.keys,
          },
          JSON.stringify(payload)
        );
        sent++;
      } catch (err: unknown) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 410 || statusCode === 404) {
          expiredEndpoints.push(sub.endpoint);
        }
        errors.push(`${sub.endpoint}: ${(err as Error).message}`);
      }
    }

    // Batch-delete expired subscriptions in a single query
    if (expiredEndpoints.length > 0) {
      await supabase
        .from('push_subscriptions')
        .delete()
        .eq('user_id', user_id)
        .in('endpoint', expiredEndpoints);
    }

    return { sent, errors: errors.length ? errors : undefined };
  },
);
