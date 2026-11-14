// Who is calling send-registration-email (MYK9-1963). Deno-free so vitest can import it.
//
// Two callers: a signed-in person (the exhibitor, a secretary or an admin; ownership is checked
// by the handler) and the scheduled receipt sweep in send-confirmation-email, which re-sends a
// failed receipt with the same secret that function's own cron call carries
// (HERITAGE_CONFIRMATION_SECRET in x-function-secret). The sweep has no user, so it is a
// distinct caller kind rather than a skipped check.

import { timingSafeEqual } from '../_shared/timingSafeEqual.ts';

/** True only when the request carries the configured sweep secret. A missing secret never matches. */
export function isReceiptSweepCaller(
  req: Request,
  getEnv: (name: string) => string | undefined
): boolean {
  const configured = getEnv('HERITAGE_CONFIRMATION_SECRET');
  const provided = req.headers.get('x-function-secret');
  return Boolean(configured) && Boolean(provided) && timingSafeEqual(provided!, configured!);
}
