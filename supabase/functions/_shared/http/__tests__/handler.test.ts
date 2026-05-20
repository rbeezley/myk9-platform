// Unit tests for the shared edge-function envelope.
//
// These tests run under vitest (Node), not Deno. To do that they call
// `processRequest` directly with injected env/client stubs, avoiding the
// `Deno.serve` wrapper. The `npm:@supabase/supabase-js@2.49.1` import in
// handler.ts is short-circuited with `vi.mock` below so the import graph
// resolves under Node.

import { describe, expect, it, vi } from 'vitest';

vi.mock('npm:@supabase/supabase-js@2.49.1', () => ({
  createClient: () => ({}),
}));

import { processRequest } from '../handler';
import { HttpError } from '../responses';
import { MYK9SHOW_ORIGINS } from '../cors';

type StubAuthResult = { data: { user: unknown } | null; error: { message: string } | null };

function makeDeps(
  options: {
    env?: Record<string, string | undefined>;
    auth?: StubAuthResult;
  } = {},
) {
  const env = options.env ?? {
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
  };
  const auth =
    options.auth ?? ({ data: { user: { id: 'user-1' } }, error: null } satisfies StubAuthResult);

  const supabase = {
    auth: {
      getUser: vi.fn(async () => auth),
    },
  };

  return {
    supabase,
    getEnv: (name: string) => env[name],
    makeClient: () => supabase as never,
  };
}

function postRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('https://example.com/fn', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('processRequest', () => {
  describe('OPTIONS preflight', () => {
    it('returns 204 with CORS headers when origins is set', async () => {
      const deps = makeDeps();
      const res = await processRequest(
        new Request('https://example.com/fn', {
          method: 'OPTIONS',
          headers: { origin: 'https://app.myk9show.com' },
        }),
        { auth: 'jwt', origins: MYK9SHOW_ORIGINS },
        async () => ({ ok: true }),
        deps,
      );

      expect(res.status).toBe(204);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://app.myk9show.com');
      expect(res.headers.get('Access-Control-Allow-Methods')).toBe('POST, OPTIONS');
    });

    it('returns 204 with no CORS headers when origins is undefined', async () => {
      const deps = makeDeps();
      const res = await processRequest(
        new Request('https://example.com/fn', { method: 'OPTIONS' }),
        { auth: 'none' },
        async () => ({ ok: true }),
        deps,
      );

      expect(res.status).toBe(204);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
      expect(res.headers.get('Access-Control-Allow-Methods')).toBeNull();
    });
  });

  describe('method gating', () => {
    it('returns 405 for non-POST methods', async () => {
      const deps = makeDeps();
      const res = await processRequest(
        new Request('https://example.com/fn', { method: 'GET' }),
        { auth: 'jwt', origins: MYK9SHOW_ORIGINS },
        async () => ({ ok: true }),
        deps,
      );

      expect(res.status).toBe(405);
      const body = await res.json();
      expect(body).toEqual({ error: 'Method not allowed' });
    });
  });

  describe('JWT auth', () => {
    it('returns 401 when the Authorization header is missing', async () => {
      const deps = makeDeps();
      const res = await processRequest(
        postRequest({ hello: 'world' }),
        { auth: 'jwt', origins: MYK9SHOW_ORIGINS },
        async () => ({ ok: true }),
        deps,
      );

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body).toEqual({ error: 'Unauthorized' });
      expect(deps.supabase.auth.getUser).not.toHaveBeenCalled();
    });

    it('returns 401 when getUser reports an error', async () => {
      const deps = makeDeps({
        auth: { data: null, error: { message: 'invalid jwt' } },
      });
      const res = await processRequest(
        postRequest({ hello: 'world' }, { Authorization: 'Bearer bad-token' }),
        { auth: 'jwt', origins: MYK9SHOW_ORIGINS },
        async () => ({ ok: true }),
        deps,
      );

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body).toEqual({ error: 'Unauthorized' });
    });

    it('populates ctx.user and invokes the handler on a valid JWT', async () => {
      const deps = makeDeps();
      const handler = vi.fn(async (ctx) => ({ caller: (ctx.user as { id: string }).id }));

      const res = await processRequest(
        postRequest({ payload: 1 }, { Authorization: 'Bearer good-token' }),
        { auth: 'jwt', origins: MYK9SHOW_ORIGINS },
        handler,
        deps,
      );

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ caller: 'user-1' });
      expect(handler).toHaveBeenCalledOnce();
      const ctx = handler.mock.calls[0][0];
      expect(ctx.user).toEqual({ id: 'user-1' });
      expect(ctx.body).toEqual({ payload: 1 });
    });
  });

  describe('auth: none', () => {
    it('invokes the handler with ctx.user undefined and skips auth lookup', async () => {
      const deps = makeDeps();
      const handler = vi.fn(async () => ({ ok: true }));

      const res = await processRequest(
        postRequest({ hello: 'webhook' }),
        { auth: 'none' },
        handler,
        deps,
      );

      expect(res.status).toBe(200);
      expect(handler).toHaveBeenCalledOnce();
      const ctx = handler.mock.calls[0][0];
      expect(ctx.user).toBeUndefined();
      expect(deps.supabase.auth.getUser).not.toHaveBeenCalled();
    });
  });

  describe('error mapping', () => {
    it('maps thrown HttpError to its status and message', async () => {
      const deps = makeDeps();
      const res = await processRequest(
        postRequest({ x: 1 }, { Authorization: 'Bearer ok' }),
        { auth: 'jwt', origins: MYK9SHOW_ORIGINS },
        async () => {
          throw new HttpError(404, 'not found');
        },
        deps,
      );

      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: 'not found' });
    });

    it('maps unknown thrown errors to a generic 500', async () => {
      const deps = makeDeps();
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const res = await processRequest(
        postRequest({ x: 1 }, { Authorization: 'Bearer ok' }),
        { auth: 'jwt', origins: MYK9SHOW_ORIGINS },
        async () => {
          throw new Error('boom');
        },
        deps,
      );

      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: 'Internal server error' });
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('body parsing', () => {
    it('returns 400 on invalid JSON', async () => {
      const deps = makeDeps();
      const res = await processRequest(
        new Request('https://example.com/fn', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ok' },
          body: 'not-json',
        }),
        { auth: 'jwt', origins: MYK9SHOW_ORIGINS },
        async () => ({ ok: true }),
        deps,
      );

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'Invalid JSON body' });
    });
  });
});
