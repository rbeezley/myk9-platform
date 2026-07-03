import { HttpError } from '../_shared/http/responses.ts';

export function requireConfirmationEmailSecret(
  req: Request,
  getEnv: (name: string) => string | undefined = name => Deno.env.get(name)
): void {
  const functionSecret = getEnv('HERITAGE_CONFIRMATION_SECRET');
  if (!functionSecret) {
    throw new HttpError(503, 'Confirmation email auth not configured');
  }

  const provided = req.headers.get('x-function-secret');
  if (provided !== functionSecret) {
    throw new HttpError(401, 'Unauthorized');
  }
}
