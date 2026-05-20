// supabase/functions/_shared/http/responses.ts
// JSON response + typed error class for edge functions.
//
// `HttpError` is the contract between domain handlers and the shared
// envelope: throw with a status + message and the envelope serialises it
// to `{ error: message }` with that status. Anything else thrown becomes
// a generic 500.

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

/**
 * Build a JSON response with the given status and optional extra headers
 * (typically CORS headers merged in by the envelope).
 */
export function json(
  body: unknown,
  status: number,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
}
