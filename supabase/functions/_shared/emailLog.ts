import { HttpError } from './http/responses.ts';

export function requireEmailLogWrite(error: unknown, context: string): void {
  if (!error) return;

  const code =
    typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : 'unknown';
  console.error(`${context}: failed to record email delivery history`, { code });
  throw new HttpError(500, 'Failed to record email delivery history');
}
