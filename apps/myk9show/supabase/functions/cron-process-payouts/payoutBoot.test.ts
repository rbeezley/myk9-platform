// MYK9-2187 Codex round 1: the payout function boots without a usable Stripe
// key, so a missing, empty or unrecognised STRIPE_SECRET_KEY reaches the
// operator alert instead of failing at module load where nobody hears it.
// Imports index.ts itself, with Deno and the Deno-only imports stubbed.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const stripeCtor = vi.fn();
const alertAdmin = vi.fn(async () => undefined);

vi.mock('jsr:@supabase/functions-js/edge-runtime.d.ts', () => ({}));
vi.mock('npm:stripe@17.7.0', () => ({
  default: class {
    transfers = { list: vi.fn(), create: vi.fn() };
    constructor(...args: unknown[]) {
      stripeCtor(...args);
    }
  },
}));
vi.mock('../_shared/alertAdmin.ts', () => ({ alertAdmin }));

type Handler = (req: Request) => Promise<Response>;

const CRON_SECRET = 'cron-secret';

async function boot(env: Record<string, string | undefined>): Promise<Handler> {
  let handler: Handler | null = null;
  vi.stubGlobal('Deno', {
    env: { get: (name: string) => env[name] },
    serve: (fn: Handler) => {
      handler = fn;
    },
  });
  vi.resetModules();
  // A path held in a variable keeps tsc from type-checking the Deno-only
  // index.ts (its own check is Deno's); vitest still loads it through the aliases.
  const entry = './index.ts';
  await import(/* @vite-ignore */ entry);
  if (!handler) throw new Error('index.ts did not call Deno.serve');
  return handler;
}

const baseEnv = {
  SUPABASE_URL: 'https://example.supabase.test',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role',
  PAYOUT_CRON_SECRET: CRON_SECRET,
};

const post = () =>
  new Request('https://example.test/cron-process-payouts', {
    method: 'POST',
    headers: { 'x-function-secret': CRON_SECRET },
  });

beforeEach(() => {
  stripeCtor.mockClear();
  alertAdmin.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('cron-process-payouts boot without a usable Stripe key', () => {
  it.each([
    { label: 'missing', key: undefined },
    { label: 'empty', key: '' },
    { label: 'a publishable key', key: 'pk_live_123' },
  ])('$label key: boots, alerts, sends nothing, answers 500', async ({ key }) => {
    const handler = await boot({ ...baseEnv, STRIPE_SECRET_KEY: key });
    expect(stripeCtor).not.toHaveBeenCalled();

    const res = await handler(post());

    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ error: 'Stripe key mode unknown' });
    expect(alertAdmin).toHaveBeenCalledWith(
      'Payout run stopped: Stripe key mode unknown',
      expect.stringContaining('STRIPE_SECRET_KEY'),
      expect.objectContaining({
        source: 'cron-process-payouts',
        dedupeKey: 'payout-key-mode-unknown',
      })
    );
    expect(stripeCtor).not.toHaveBeenCalled();
  });

  it('still refuses to boot without the cron secret', async () => {
    await expect(
      boot({ ...baseEnv, PAYOUT_CRON_SECRET: undefined, STRIPE_SECRET_KEY: 'sk_test_1' })
    ).rejects.toThrow('Missing required environment variables');
  });

  it('a request without the cron secret is refused before any Stripe work', async () => {
    const handler = await boot({ ...baseEnv, STRIPE_SECRET_KEY: undefined });
    const res = await handler(new Request('https://example.test/x', { method: 'POST' }));
    expect(res.status).toBe(403);
    expect(alertAdmin).not.toHaveBeenCalled();
  });
});
