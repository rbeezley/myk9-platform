import { HttpError } from '../_shared/http/responses.ts';
import { timingSafeEqual } from '../_shared/timingSafeEqual.ts';

export function requireConfirmationEmailSecret(
  req: Request,
  getEnv: (name: string) => string | undefined = name => Deno.env.get(name)
): void {
  const functionSecret = getEnv('HERITAGE_CONFIRMATION_SECRET');
  if (!functionSecret) {
    throw new HttpError(503, 'Confirmation email auth not configured');
  }

  const provided = req.headers.get('x-function-secret');
  // MYK9-404 / SA-2026-09-05-08: this was `provided !== functionSecret`, the one
  // secret gate in the repo that short-circuited on the first differing byte
  // while requireFunctionSecret, requirePushWebhookSecret and
  // assertWaitlistInviteSecret all use the shared constant-time compare. Not
  // practically exploitable over a network against a high-entropy secret; the
  // point is that the next gate someone copies from should be the right shape.
  if (!provided || !timingSafeEqual(provided, functionSecret)) {
    throw new HttpError(401, 'Unauthorized');
  }
}
