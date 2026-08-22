import { HttpError } from './http/responses.ts';
import { timingSafeEqual } from './timingSafeEqual.ts';

/**
 * Bearer-secret authentication for a server-to-server function — pg_cron, a
 * database webhook, or another function. No user is involved, so there is no
 * JWT to validate and the shared envelope runs with `auth: 'none'`.
 *
 * Fails CLOSED on an unset secret: an unconfigured function that accepted
 * everything would be an open endpoint that writes to Storage and sends email.
 * 503 rather than 401 because the fault is the deployment's, not the caller's,
 * and the two need to be distinguishable in the logs.
 */
export function requireFunctionSecret(
  req: Request,
  envName: string,
  getEnv: (name: string) => string | undefined = name => Deno.env.get(name),
  unconfiguredMessage = 'Trigger is not configured'
): void {
  const secret = getEnv(envName);
  if (!secret) {
    throw new HttpError(503, unconfiguredMessage);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader || !timingSafeEqual(authHeader, `Bearer ${secret}`)) {
    throw new HttpError(401, 'Unauthorized');
  }
}
