import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createStepUpFetch, STEP_UP_REQUIRED_CODE, STEP_UP_SQLSTATE } from './stepUpFetch';
import {
  registerStepUpHost,
  requestStepUp,
  resetStepUpStore,
  settleStepUp,
  useStepUpStore,
} from './stepUpStore';
import { reusableFreshToken } from './stepUpToken';
import { testJwt } from './stepUpTestTokens';

const STALE = testJwt('u1', 14 * 86_400, 'stale');
const FRESH = testJwt('u1', 1, 'fresh');
const OTHER_ACCOUNT = testJwt('u2', 1, 'other');

const REST = 'https://test.supabase.co/rest/v1/rpc/grant_club_secretary';
const EDGE = 'https://test.supabase.co/functions/v1/stripe-refund-entry';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const postgrestRefusal = () =>
  json(400, { code: STEP_UP_SQLSTATE, message: 'Confirm your password to continue.' });
const edgeRefusal = () => json(403, { error: STEP_UP_REQUIRED_CODE, message: 'x' });

const bearer = (init?: RequestInit) => new Headers(init?.headers).get('Authorization');

/**
 * A server that, like the real one, accepts a request only while the token it carries
 * re-authenticated recently: here, any token issued by the prompt.
 */
function fakeServer(refusal: () => Response) {
  const freshTokens = new Set<string>();
  const base = vi.fn<typeof fetch>(async (_input, init) => {
    const token = bearer(init)?.replace('Bearer ', '') ?? '';
    return freshTokens.has(token) ? json(200, { ok: true }) : refusal();
  });
  return { base, freshTokens };
}

describe('createStepUpFetch', () => {
  beforeEach(() => {
    resetStepUpStore();
  });
  afterEach(() => {
    resetStepUpStore();
  });

  it('passes every other response through without asking', async () => {
    const prompt = vi.fn(async () => 'never');
    for (const response of [
      json(200, { ok: true }),
      json(400, { code: '42501', message: 'nope' }),
      json(422, { error: 'payout_already_sent' }),
      new Response('step_up_required', { status: 403 }),
    ]) {
      const base = vi.fn<typeof fetch>(async () => response);
      const result = await createStepUpFetch(prompt, base)(REST, {});
      expect(result).toBe(response);
      expect(base).toHaveBeenCalledTimes(1);
    }
    expect(prompt).not.toHaveBeenCalled();
  });

  it.each([
    ['a refused RPC (SQLSTATE MKAUT)', REST, postgrestRefusal],
    ['a refused edge function (step_up_required)', EDGE, edgeRefusal],
  ])('asks once for %s, then replays it with the new token', async (_label, url, refusal) => {
    const server = fakeServer(refusal);
    const prompt = vi.fn(async () => {
      server.freshTokens.add(FRESH);
      return FRESH;
    });
    const body = JSON.stringify({ p_club_id: 'c1' });

    const result = await createStepUpFetch(prompt, server.base)(url, {
      method: 'POST',
      body,
      headers: { Authorization: `Bearer ${STALE}`, apikey: 'anon' },
    });

    expect(result.status).toBe(200);
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(server.base).toHaveBeenCalledTimes(2);
    const replay = server.base.mock.calls[1][1];
    expect(bearer(replay)).toBe(`Bearer ${FRESH}`);
    expect(new Headers(replay?.headers).get('apikey')).toBe('anon');
    expect(replay?.body).toBe(body);
    expect(replay?.method).toBe('POST');
  });

  it('hands back the readable refusal when the person cancels', async () => {
    const base = vi.fn<typeof fetch>(async () => edgeRefusal());
    const result = await createStepUpFetch(async () => null, base)(EDGE, {});
    expect(base).toHaveBeenCalledTimes(1);
    expect(await result.json()).toMatchObject({ error: STEP_UP_REQUIRED_CODE });
  });

  it('never intercepts the sign-in that answers the prompt', async () => {
    const prompt = vi.fn(async () => 'x');
    const base = vi.fn<typeof fetch>(async () => json(400, { code: STEP_UP_SQLSTATE }));
    await createStepUpFetch(prompt, base)('https://test.supabase.co/auth/v1/token', {});
    expect(prompt).not.toHaveBeenCalled();
  });

  it('a second action inside the window does not prompt again', async () => {
    const server = fakeServer(postgrestRefusal);
    const prompt = vi.fn(async () => {
      server.freshTokens.add(FRESH);
      return FRESH;
    });
    const stepUpFetch = createStepUpFetch(prompt, server.base);

    await stepUpFetch(REST, { headers: { Authorization: `Bearer ${STALE}` } });
    // supabase-js now sends the new session's token on every request.
    const second = await stepUpFetch(REST, { headers: { Authorization: `Bearer ${FRESH}` } });

    expect(second.status).toBe(200);
    expect(prompt).toHaveBeenCalledTimes(1);
  });

  it('a batch of refusals at once shares a single prompt', async () => {
    const server = fakeServer(edgeRefusal);
    registerStepUpHost(async () => ({ userId: 'u1', email: 'sec@example.com', hasPassword: true }));
    const stepUpFetch = createStepUpFetch(requestStepUp, server.base);

    const batch = Promise.all(
      [1, 2, 3].map(() => stepUpFetch(EDGE, { headers: { Authorization: `Bearer ${STALE}` } }))
    );
    await vi.waitFor(() => expect(useStepUpStore.getState().account).not.toBeNull());
    const promptsShown = useStepUpStore.getState().promptId;
    server.freshTokens.add(FRESH);
    settleStepUp(FRESH);

    const results = await batch;
    expect(results.map(r => r.status)).toEqual([200, 200, 200]);
    expect(promptsShown).toBe(1);
    expect(useStepUpStore.getState().account).toBeNull();
  });
});

describe('a refusal that lands after another request already confirmed', () => {
  beforeEach(() => {
    resetStepUpStore();
  });

  it('replays with the confirmed session instead of prompting a second time', async () => {
    const stale = STALE;
    const fresh = FRESH;
    let held = stale;
    registerStepUpHost(
      async () => ({ userId: 'u1', email: 'sec@example.com', hasPassword: true }),
      async refused => reusableFreshToken(held, refused)
    );

    let releaseSlowRefusal!: () => void;
    const slowRefusalGate = new Promise<void>(resolve => {
      releaseSlowRefusal = resolve;
    });
    const base = vi.fn<typeof fetch>(async (input, init) => {
      if (bearer(init) === `Bearer ${fresh}`) return json(200, { ok: true });
      if (String(input).endsWith('/slow')) await slowRefusalGate;
      return edgeRefusal();
    });
    const stepUpFetch = createStepUpFetch(requestStepUp, base);
    const staleHeaders = { headers: { Authorization: `Bearer ${stale}` } };

    const first = stepUpFetch(`${EDGE}/fast`, staleHeaders);
    const second = stepUpFetch(`${EDGE}/slow`, staleHeaders);

    await vi.waitFor(() => expect(useStepUpStore.getState().account).not.toBeNull());
    held = fresh; // what signInWithPassword leaves in the client
    settleStepUp(fresh);
    expect((await first).status).toBe(200);
    expect(useStepUpStore.getState().pending).toBeNull();

    releaseSlowRefusal();
    expect((await second).status).toBe(200);
    expect(useStepUpStore.getState().promptId).toBe(1);
    expect(useStepUpStore.getState().account).toBeNull();
  });
});

describe('prompts and replays are bound to the refused account', () => {
  beforeEach(() => {
    resetStepUpStore();
  });

  const accountA = { userId: 'u1', email: 'a@example.com', hasPassword: true };

  it('another tab switched accounts before the prompt: no prompt and no replay', async () => {
    registerStepUpHost(async () => ({ userId: 'u2', email: 'b@example.com', hasPassword: true }));
    const base = vi.fn<typeof fetch>(async () => edgeRefusal());

    const result = await createStepUpFetch(requestStepUp, base)(EDGE, {
      headers: { Authorization: `Bearer ${STALE}` },
    });

    expect(await result.json()).toMatchObject({ error: STEP_UP_REQUIRED_CODE });
    expect(base).toHaveBeenCalledTimes(1);
    expect(useStepUpStore.getState().promptId).toBe(0);
  });

  it('a confirmation that comes back for another account is never replayed', async () => {
    registerStepUpHost(async () => accountA);
    const base = vi.fn<typeof fetch>(async () => edgeRefusal());
    const pending = createStepUpFetch(requestStepUp, base)(EDGE, {
      headers: { Authorization: `Bearer ${STALE}` },
    });

    await vi.waitFor(() => expect(useStepUpStore.getState().account).not.toBeNull());
    settleStepUp(OTHER_ACCOUNT);

    expect(await (await pending).json()).toMatchObject({ error: STEP_UP_REQUIRED_CODE });
    expect(base).toHaveBeenCalledTimes(1);
  });

  it('an open prompt for one account is not shared with another account’s refusal', async () => {
    registerStepUpHost(async () => accountA);
    const server = fakeServer(edgeRefusal);
    const stepUpFetch = createStepUpFetch(requestStepUp, server.base);
    const forA = stepUpFetch(EDGE, { headers: { Authorization: `Bearer ${STALE}` } });
    await vi.waitFor(() => expect(useStepUpStore.getState().account).not.toBeNull());

    const staleB = testJwt('u2', 14 * 86_400, 'stale-b');
    const forB = await stepUpFetch(EDGE, { headers: { Authorization: `Bearer ${staleB}` } });
    expect(forB.status).toBe(403);
    expect(useStepUpStore.getState().promptId).toBe(1);

    server.freshTokens.add(FRESH);
    settleStepUp(FRESH);
    expect((await forA).status).toBe(200);
    // B's request went out once and was never replayed under A's confirmation.
    const bCalls = server.base.mock.calls.filter(([, init]) => bearer(init) === `Bearer ${staleB}`);
    expect(bCalls).toHaveLength(1);
    expect(server.base).toHaveBeenCalledTimes(3);
  });
});

describe('requestStepUp', () => {
  beforeEach(() => {
    resetStepUpStore();
  });

  it('answers null at once when no dialog is mounted to ask', async () => {
    await expect(requestStepUp(STALE)).resolves.toBeNull();
  });

  it('answers null when nobody is signed in', async () => {
    registerStepUpHost(async () => null);
    await expect(requestStepUp(STALE)).resolves.toBeNull();
    expect(useStepUpStore.getState().pending).toBeNull();
  });
});
