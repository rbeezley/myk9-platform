// @vitest-environment node
/**
 * MYK9-1394: runs the real `stripe-payment-link` handler (not its source text)
 * against a stubbed Deno runtime, Supabase client and Stripe SDK. Every caller
 * must pass the JWT + role check; the shared CRON_SECRET is not a credential
 * here, and the function never reads it.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const CRON_SECRET_VALUE = 'cron-secret-value-for-test';
const SECRETARY_TOKEN = 'secretary-jwt';
const SECRETARY_ID = '11111111-1111-4111-8111-111111111111';
const SHOW_ID = '22222222-2222-4222-8222-222222222222';
const CLUB_ID = '33333333-3333-4333-8333-333333333333';
const ENTRY_ID = '44444444-4444-4444-8444-444444444444';
const ORIGIN = 'https://myk9show.com';

const ENV: Record<string, string> = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
  SUPABASE_ANON_KEY: 'anon-key',
  STRIPE_SECRET_KEY: 'sk_test_example',
  CRON_SECRET: CRON_SECRET_VALUE,
};

type Handler = (req: Request) => Promise<Response>;
type Result = { data: unknown; error: unknown };

const h = vi.hoisted(() => ({
  /** Every env name the function asked for, including at module load; never cleared. */
  envReads: [] as string[],
  getUser: vi.fn(),
  rpc: vi.fn(),
  tableResults: new Map<string, () => { data: unknown; error: unknown }>(),
  inserts: [] as Array<{ table: string; row: unknown }>,
  sessionsCreate: vi.fn(),
  handler: null as null | ((req: Request) => Promise<Response>),
}));

/** A chainable PostgREST stand-in: every filter returns itself, awaiting yields the table's result. */
function queryBuilder(table: string) {
  const result = (): Result => h.tableResults.get(table)?.() ?? { data: null, error: null };
  const builder: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'in', 'gt', 'overlaps', 'update']) {
    builder[method] = () => builder;
  }
  builder.maybeSingle = async () => result();
  builder.single = async () => result();
  builder.insert = async (row: unknown) => {
    h.inserts.push({ table, row });
    return { error: null };
  };
  builder.then = (resolve: (r: Result) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve(result()).then(resolve, reject);
  return builder;
}

vi.mock('jsr:@supabase/functions-js/edge-runtime.d.ts', () => ({}));
vi.mock('npm:@supabase/supabase-js@2.49.1', () => ({
  createClient: () => ({
    auth: { getUser: h.getUser },
    rpc: h.rpc,
    from: (table: string) => queryBuilder(table),
  }),
}));
vi.mock('npm:stripe@17.7.0', () => ({
  default: class {
    checkout = {
      sessions: {
        create: h.sessionsCreate,
        retrieve: vi.fn(),
        expire: vi.fn(),
      },
    };
  },
}));

function post(headers: Record<string, string>): Request {
  return new Request('https://example.supabase.co/functions/v1/stripe-payment-link', {
    method: 'POST',
    headers: { origin: ORIGIN, 'content-type': 'application/json', ...headers },
    body: JSON.stringify({
      entry_ids: [ENTRY_ID],
      success_url: `${ORIGIN}/pay/success`,
      cancel_url: `${ORIGIN}/pay/cancel`,
    }),
  });
}

function run(req: Request): Promise<Response> {
  const handler = h.handler as Handler | null;
  if (!handler) throw new Error('stripe-payment-link did not register a Deno.serve handler');
  return handler(req);
}

beforeAll(async () => {
  vi.stubGlobal('Deno', {
    env: {
      get: (name: string) => {
        h.envReads.push(name);
        return ENV[name];
      },
    },
    serve: (fn: Handler) => {
      h.handler = fn;
    },
  });
  // A computed specifier keeps the app's tsc from following the import into a
  // Deno module (npm: specifiers, the Deno global); vitest still loads it with the mocks above.
  const functionModule = '../../../supabase/functions/stripe-payment-link/index.ts';
  await import(/* @vite-ignore */ functionModule);
});

afterAll(() => {
  vi.unstubAllGlobals();
});

beforeEach(() => {
  h.getUser.mockReset();
  h.rpc.mockReset();
  h.sessionsCreate.mockReset();
  h.inserts.length = 0;
  h.tableResults.clear();

  h.getUser.mockImplementation(async (token: string) =>
    token === SECRETARY_TOKEN
      ? { data: { user: { id: SECRETARY_ID } }, error: null }
      : { data: { user: null }, error: { message: 'invalid JWT' } }
  );
  h.rpc.mockImplementation(async (fn: string) => ({
    data: fn === 'is_show_secretary',
    error: null,
  }));
  h.sessionsCreate.mockResolvedValue({ id: 'cs_test_1', url: 'https://checkout.stripe.test/cs_1' });

  h.tableResults.set('entries', () => ({
    data: [
      {
        id: ENTRY_ID,
        payment_status: 'pending',
        entry_status: 'pending',
        entry_fee: 30,
        junior_fee_declared: false,
        junior_fee_override_by: null,
        dog: { call_name: 'Rex' },
        class: { name: 'Novice Container', entry_fee: 30 },
        show: {
          id: SHOW_ID,
          club_id: CLUB_ID,
          name: 'Fall Trial',
          organization: 'AKC',
          pre_entry_fee: null,
          day_of_show_fee: null,
          junior_handler_fee: null,
          start_date: '2099-10-10',
          trials: [{ id: 't1', date: '2099-10-10', timezone: 'America/Chicago' }],
        },
      },
    ],
    error: null,
  }));
  h.tableResults.set('club_stripe_accounts', () => ({
    data: { payouts_enabled: true },
    error: null,
  }));
  h.tableResults.set('entry_payment_links', () => ({ data: [], error: null }));
});

describe('stripe-payment-link caller authentication (MYK9-1394)', () => {
  it('refuses the shared cron secret without a JWT', async () => {
    const res = await run(post({ 'x-function-secret': CRON_SECRET_VALUE }));

    expect(res.status).toBe(401);
    expect(h.sessionsCreate).not.toHaveBeenCalled();
    expect(h.inserts).toEqual([]);
  });

  it('never reads CRON_SECRET from the environment', async () => {
    await run(post({ 'x-function-secret': CRON_SECRET_VALUE }));
    await run(post({ Authorization: `Bearer ${SECRETARY_TOKEN}` }));

    // Positive control: the recorder saw the module-load reads.
    expect(h.envReads).toContain('STRIPE_SECRET_KEY');
    expect(h.envReads).not.toContain('CRON_SECRET');
  });

  it('does not advertise x-function-secret to browsers', async () => {
    const res = await run(
      new Request('https://example.supabase.co/functions/v1/stripe-payment-link', {
        method: 'OPTIONS',
        headers: { origin: ORIGIN },
      })
    );

    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Headers')).not.toContain('x-function-secret');
  });

  it('creates the link for an authenticated show secretary and records who issued it', async () => {
    const res = await run(post({ Authorization: `Bearer ${SECRETARY_TOKEN}` }));

    expect(res.status).toBe(200);
    expect(h.getUser).toHaveBeenCalledWith(SECRETARY_TOKEN);
    expect(h.rpc).toHaveBeenCalledWith('is_show_secretary', { check_show_id: SHOW_ID });
    expect(h.sessionsCreate).toHaveBeenCalledTimes(1);
    expect(h.inserts).toEqual([
      expect.objectContaining({
        table: 'entry_payment_links',
        row: expect.objectContaining({ created_by: SECRETARY_ID, entry_ids: [ENTRY_ID] }),
      }),
    ]);
  });

  it('lets an exhibitor with a JWT claim their own active waitlist offer', async () => {
    h.rpc.mockResolvedValue({ data: false, error: null });
    h.tableResults.set('exhibitor_profiles', () => ({ data: { id: 'exhibitor-1' }, error: null }));
    h.tableResults.set('waitlist_entries', () => ({
      data: [{ promoted_entry_id: ENTRY_ID }],
      error: null,
    }));

    const res = await run(post({ Authorization: `Bearer ${SECRETARY_TOKEN}` }));

    expect(res.status).toBe(200);
    expect(h.sessionsCreate).toHaveBeenCalledTimes(1);
  });

  it('refuses a JWT caller who holds no role and no waitlist offer, even with the cron secret', async () => {
    h.rpc.mockResolvedValue({ data: false, error: null });
    h.tableResults.set('exhibitor_profiles', () => ({ data: null, error: null }));

    const res = await run(
      post({ Authorization: `Bearer ${SECRETARY_TOKEN}`, 'x-function-secret': CRON_SECRET_VALUE })
    );

    expect(res.status).toBe(403);
    expect(h.sessionsCreate).not.toHaveBeenCalled();
  });
});
