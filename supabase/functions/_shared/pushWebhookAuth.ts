import { HttpError } from './http/responses.ts';
import { timingSafeEqual } from './timingSafeEqual.ts';

export function requirePushWebhookSecret(
  req: Request,
  getEnv: (name: string) => string | undefined = name => Deno.env.get(name)
): void {
  const webhookSecret = getEnv('PUSH_WEBHOOK_SECRET') ?? getEnv('SUPABASE_SERVICE_ROLE_KEY');
  if (!webhookSecret) {
    throw new HttpError(503, 'Push trigger is not configured');
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader || !timingSafeEqual(authHeader, `Bearer ${webhookSecret}`)) {
    throw new HttpError(401, 'Unauthorized');
  }
}
