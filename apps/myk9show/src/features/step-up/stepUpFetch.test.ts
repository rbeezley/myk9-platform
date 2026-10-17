import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createStepUpFetch, STEP_UP_REQUIRED_CODE, STEP_UP_SQLSTATE } from './stepUpFetch';
import {
  registerStepUpHost,
  requestStepUp,
  resetStepUpStore,
  settleStepUp,
  useStepUpStore,
} from './stepUpStore';

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
      server.freshTokens.add('fresh-token');
      return 'fresh-token';
    });
    const body = JSON.stringify({ p_club_id: 'c1' });

    const result = await createStepUpFetch(prompt, server.base)(url, {
      method: 'POST',
      body,
      headers: { Authorization: 'Bearer stale-token', apikey: 'anon' },
    });

    expect(result.status).toBe(200);
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(server.base).toHaveBeenCalledTimes(2);
    const replay = server.base.mock.calls[1][1];
    expect(bearer(replay)).toBe('Bearer fresh-token');
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
      server.freshTokens.add('fresh-token');
      return 'fresh-token';
    });
    const stepUpFetch = createStepUpFetch(prompt, server.base);

    await stepUpFetch(REST, { headers: { Authorization: 'Bearer stale-token' } });
    // supabase-js now sends the new session's token on every request.
    const second = await stepUpFetch(REST, { headers: { Authorization: 'Bearer fresh-token' } });

    expect(second.status).toBe(200);
    expect(prompt).toHaveBeenCalledTimes(1);
  });

  it('a batch of refusals at once shares a single prompt', async () => {
    const server = fakeServer(edgeRefusal);
    registerStepUpHost(async () => ({ userId: 'u1', email: 'sec@example.com', hasPassword: true }));
    const stepUpFetch = createStepUpFetch(requestStepUp, server.base);

    const batch = Promise.all(
      [1, 2, 3].map(() => stepUpFetch(EDGE, { headers: { Authorization: 'Bearer stale' } }))
    );
    await vi.waitFor(() => expect(useStepUpStore.getState().account).not.toBeNull());
    const promptsShown = useStepUpStore.getState().promptId;
    server.freshTokens.add('fresh');
    settleStepUp('fresh');

    const results = await batch;
    expect(results.map(r => r.status)).toEqual([200, 200, 200]);
    expect(promptsShown).toBe(1);
    expect(useStepUpStore.getState().account).toBeNull();
  });
});

describe('requestStepUp', () => {
  beforeEach(() => {
    resetStepUpStore();
  });

  it('answers null at once when no dialog is mounted to ask', async () => {
    await expect(requestStepUp()).resolves.toBeNull();
  });

  it('answers null when nobody is signed in', async () => {
    registerStepUpHost(async () => null);
    await expect(requestStepUp()).resolves.toBeNull();
    expect(useStepUpStore.getState().pending).toBeNull();
  });
});
