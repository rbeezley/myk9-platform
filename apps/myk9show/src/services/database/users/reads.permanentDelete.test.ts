import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock only the supabase client; keep the real createDatabaseError / logQuery so
// the code-propagation path is exercised end to end. `vi.hoisted` so the spy
// exists before the hoisted vi.mock factory runs.
const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('../supabaseClient', async importOriginal => {
  const actual = await importOriginal<typeof import('../supabaseClient')>();
  return { ...actual, supabase: { functions: { invoke } } };
});

import { permanentDeleteUser } from './reads';

describe('permanentDeleteUser — edge error code propagation', () => {
  beforeEach(() => invoke.mockReset());

  it('preserves the MK001 guard code from a 409 FunctionsHttpError body', async () => {
    invoke.mockResolvedValue({
      data: null,
      error: Object.assign(new Error('Edge Function returned a non-2xx status code'), {
        name: 'FunctionsHttpError',
        context: new Response(
          JSON.stringify({
            error: 'This person still owns 2 live dog(s). Delete those dogs first.',
            code: 'MK001',
          }),
          { status: 409 }
        ),
      }),
    });

    const result = await permanentDeleteUser('p1');

    expect(result.error?.code).toBe('MK001');
    expect(result.error?.message).toContain('still owns');
  });

  it('falls back to the raw error when the body carries no code', async () => {
    invoke.mockResolvedValue({
      data: null,
      error: Object.assign(new Error('Internal server error'), {
        name: 'FunctionsHttpError',
        context: new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500 }),
      }),
    });

    const result = await permanentDeleteUser('p1');

    expect(result.error).toBeTruthy();
    expect(result.error?.code).toBeUndefined();
  });
});
