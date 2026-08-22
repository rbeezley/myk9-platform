import { requireFunctionSecret } from './functionSecret.ts';

/** Push triggers keep their own wording; the mechanism is shared. */
export function requirePushWebhookSecret(
  req: Request,
  getEnv: (name: string) => string | undefined = name => Deno.env.get(name)
): void {
  requireFunctionSecret(req, 'PUSH_WEBHOOK_SECRET', getEnv, 'Push trigger is not configured');
}
