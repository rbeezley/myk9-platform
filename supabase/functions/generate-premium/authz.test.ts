import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  PREMIUM_MANAGER_PREDICATES,
  resolvePremiumGenerationAuthorization,
  type PremiumAuthzClient,
} from './authz.ts';

/** An rpc mock that answers each predicate by name. */
function makeClient(answers: Record<string, unknown>, error: unknown = null) {
  const rpc = vi.fn((fn: string) =>
    Promise.resolve({ data: error ? null : (answers[fn] ?? false), error })
  );
  return { client: { rpc } as unknown as PremiumAuthzClient, rpc };
}

const realAccount = { id: 'user-1', is_anonymous: false };

describe('generate-premium authorization', () => {
  it('denies an anonymous identity without asking the database', async () => {
    const { client, rpc } = makeClient({});

    const outcome = await resolvePremiumGenerationAuthorization({
      user: { id: 'anon-1', is_anonymous: true },
      showId: 'show-1',
      client,
    });

    expect(outcome).toEqual({ authorized: false, reason: 'anonymous' });
    // An anonymous session is free to mint, so it can never be a manager —
    // no round trip needed to know that.
    expect(rpc).not.toHaveBeenCalled();
  });

  it('denies an authenticated non-manager', async () => {
    // This is the finding: the caller CAN read the show (it is public), which the
    // old code accepted as management authority.
    const { client } = makeClient({ can_manage_show: false, is_show_secretary: false });

    const outcome = await resolvePremiumGenerationAuthorization({
      user: realAccount,
      showId: 'show-1',
      client,
    });

    expect(outcome).toEqual({ authorized: false, reason: 'not-a-manager' });
  });

  it('allows a club admin (can_manage_show)', async () => {
    const { client } = makeClient({ can_manage_show: true, is_show_secretary: false });

    await expect(
      resolvePremiumGenerationAuthorization({ user: realAccount, showId: 'show-1', client })
    ).resolves.toEqual({ authorized: true });
  });

  it('allows a secretary (is_show_secretary)', async () => {
    const { client } = makeClient({ can_manage_show: false, is_show_secretary: true });

    await expect(
      resolvePremiumGenerationAuthorization({ user: realAccount, showId: 'show-1', client })
    ).resolves.toEqual({ authorized: true });
  });

  it('fails closed when a predicate errors', async () => {
    const { client } = makeClient({}, new Error('boom'));

    await expect(
      resolvePremiumGenerationAuthorization({ user: realAccount, showId: 'show-1', client })
    ).resolves.toEqual({ authorized: false, reason: 'check-failed' });
  });

  it('treats a non-boolean answer as unauthorized', async () => {
    // A predicate that returns null (e.g. renamed argument silently yielding no
    // row) must not read as permission.
    const { client } = makeClient({ can_manage_show: null, is_show_secretary: undefined });

    await expect(
      resolvePremiumGenerationAuthorization({ user: realAccount, showId: 'show-1', client })
    ).resolves.toEqual({ authorized: false, reason: 'not-a-manager' });
  });

  it('passes the show id to every predicate', async () => {
    const { client, rpc } = makeClient({ can_manage_show: true });

    await resolvePremiumGenerationAuthorization({ user: realAccount, showId: 'show-42', client });

    for (const fn of PREMIUM_MANAGER_PREDICATES) {
      expect(rpc).toHaveBeenCalledWith(fn, { check_show_id: 'show-42' });
    }
  });
});

describe('generate-premium authorization ordering (source contract)', () => {
  const source = readFileSync(join(__dirname, 'index.ts'), 'utf8');

  it('authorizes before the rate limiter and the model call', () => {
    // The acceptance criterion is not just "denied calls 403" — it is that a
    // denied call never reaches the limiter (which would record an attempt) or
    // Anthropic (which costs money). Ordering is the property; assert it.
    const authorizeAt = source.indexOf('resolvePremiumGenerationAuthorization({');
    const limiterAt = source.indexOf('runPremiumGenerationAttempt({');
    const showFetchAt = source.indexOf(".from('shows')");

    expect(authorizeAt).toBeGreaterThan(-1);
    expect(limiterAt).toBeGreaterThan(-1);
    expect(showFetchAt).toBeGreaterThan(-1);

    expect(authorizeAt).toBeLessThan(limiterAt);
    expect(authorizeAt).toBeLessThan(showFetchAt);
  });

  it('no longer claims the show fetch is the authorization check', () => {
    // The old comment asserted RLS collapsed authorization into the show fetch.
    // It was wrong, and leaving it would invite someone to delete the real check.
    expect(source).not.toMatch(/collapses authorization into a single check/i);
  });
});
