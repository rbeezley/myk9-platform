// supabase/functions/_shared/http/handler.ts
// Shared HTTP envelope for edge functions: CORS, JWT auth, JSON body
// parsing, and error response mapping. Domain logic lives in the handler;
// the envelope handles the boilerplate that was duplicated across 20+
// functions.
//
// The envelope is split into two pieces so it can be tested under Node
// without `Deno.serve`:
//   - `processRequest`: pure (Request -> Promise<Response>) — unit-tested.
//   - `handle`: thin wrapper that calls `Deno.serve(processRequest)`.

import { createClient, type SupabaseClient, type User } from 'npm:@supabase/supabase-js@2.49.1';

import { corsHeaders } from './cors.ts';
import { HttpError, json } from './responses.ts';

export type HandlerCtx<TBody> = {
  req: Request;
  body: TBody;
  /** Populated when `auth: 'jwt'`; undefined when `auth: 'none'`. */
  user?: User;
  /** Service-role client. Domain logic does RBAC checks against it. */
  supabase: SupabaseClient;
};

export type HandlerOptions = {
  auth: 'jwt' | 'none';
  /**
   * CORS origin allowlist. Omit for webhooks / server-to-server calls that
   * should not advertise any CORS headers.
   */
  origins?: readonly string[];
  /** Override the default Access-Control-Allow-Headers list. */
  allowedHeaders?: readonly string[];
};

/**
 * Internal: takes a Request and returns the Response the envelope would
 * send. Exposed for testing; production code should call `handle`.
 *
 * Dependencies (env vars, Supabase factory) are injected so tests can
 * stub them without touching globals.
 */
export async function processRequest<TBody>(
  req: Request,
  options: HandlerOptions,
  handler: (ctx: HandlerCtx<TBody>) => Promise<unknown>,
  deps: {
    getEnv: (name: string) => string | undefined;
    makeClient: (url: string, key: string) => SupabaseClient;
  },
): Promise<Response> {
  const headers = options.origins
    ? corsHeaders(req, options.origins, options.allowedHeaders)
    : {};

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405, headers);
  }

  const supabaseUrl = deps.getEnv('SUPABASE_URL');
  const supabaseServiceKey = deps.getEnv('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('handle: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    return json({ error: 'Server misconfigured' }, 500, headers);
  }
  const supabase = deps.makeClient(supabaseUrl, supabaseServiceKey);

  let user: User | undefined;
  if (options.auth === 'jwt') {
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '').trim();
    if (!token) {
      return json({ error: 'Unauthorized' }, 401, headers);
    }
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) {
      return json({ error: 'Unauthorized' }, 401, headers);
    }
    user = data.user;
  }

  let body: TBody;
  try {
    body = (await req.json()) as TBody;
  } catch {
    return json({ error: 'Invalid JSON body' }, 400, headers);
  }

  try {
    const result = await handler({ req, body, user, supabase });
    return json(result ?? { success: true }, 200, headers);
  } catch (err) {
    if (err instanceof HttpError) {
      return json({ error: err.message }, err.status, headers);
    }
    console.error('handle: unexpected handler error', err);
    return json({ error: 'Internal server error' }, 500, headers);
  }
}

/**
 * Wrap a domain handler with the standard envelope and serve it.
 *
 * The envelope:
 * - Replies to OPTIONS with 204 (with CORS headers when `origins` is set).
 * - Rejects non-POST with 405.
 * - When `auth: 'jwt'`, validates the bearer token and populates `ctx.user`.
 * - Parses the JSON body into `ctx.body` (400 on parse failure).
 * - Maps thrown `HttpError` to `{ error: message }` with that status.
 * - Maps any other thrown value to a generic 500.
 */
export function handle<TBody = unknown>(
  options: HandlerOptions,
  handler: (ctx: HandlerCtx<TBody>) => Promise<unknown>,
): void {
  Deno.serve((req: Request) =>
    processRequest<TBody>(req, options, handler, {
      getEnv: (name) => Deno.env.get(name),
      makeClient: (url, key) => createClient(url, key),
    }),
  );
}
