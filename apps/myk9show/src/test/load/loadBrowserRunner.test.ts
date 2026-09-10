import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { LoadSessionAssignment } from './loadAssignments';
import { LOAD_SHOWS } from './loadFixture';
import {
  assertAllSessionsOpenAtStart,
  AUTH_STATE_SIGN_IN_TIMEOUT_MS,
  closeBrowserContexts,
  connectedSessionHoldMs,
  mapWithConcurrency,
} from './loadBrowserRunner';
import { DEFAULT_SIGN_IN_NAVIGATION_TIMEOUT_MS } from '../e2e/helpers/testUsers';

describe('connectedSessionHoldMs', () => {
  it('keeps a completed non-scoring device mounted until the scenario deadline', () => {
    expect(connectedSessionHoldMs(10_000, 2_500)).toBe(7_500);
    expect(connectedSessionHoldMs(10_000, 10_500)).toBe(0);
  });

  it('keeps passive sessions connected without hard browser reloads', () => {
    const source = readFileSync(resolve(__dirname, 'loadBrowserRunner.ts'), 'utf8');

    expect(source).toContain('await delay(connectedSessionHoldMs(endsAt, Date.now()))');
    expect(source).not.toContain('page.reload(');
  });
});

describe('prepared session readiness', () => {
  const assignment: LoadSessionAssignment = {
    sequence: 0,
    index: 0,
    kind: 'ringside-scoring',
    role: 'secretary',
    target: {
      showIndex: 0,
      showId: LOAD_SHOWS[0].showId,
      trialId: LOAD_SHOWS[0].trials[0].trialId,
      classId: LOAD_SHOWS[0].classIds[0],
      ringIndex: 0,
      entryNumber: 1,
    },
  };

  it('returns assignments whose browser pages are still open at synchronized start', () => {
    expect(
      assertAllSessionsOpenAtStart([
        {
          assignment,
          page: { isClosed: () => false },
        },
      ])
    ).toEqual([assignment]);
  });

  it('fails closed when a prepared browser page closed before synchronized start', () => {
    expect(() =>
      assertAllSessionsOpenAtStart([
        {
          assignment,
          page: { isClosed: () => true },
        },
      ])
    ).toThrow('1 prepared browser session was no longer open');
  });
});

describe('browser context cleanup', () => {
  it('does not let an unresponsive Chromium context suppress the shard artifact', async () => {
    const responsiveClose = vi.fn().mockResolvedValue(undefined);
    const stuckClose = vi.fn(() => new Promise<void>(() => undefined));
    const startedAt = performance.now();

    await closeBrowserContexts([{ close: responsiveClose }, { close: stuckClose }], 5);

    expect(responsiveClose).toHaveBeenCalledOnce();
    expect(stuckClose).toHaveBeenCalledOnce();
    expect(performance.now() - startedAt).toBeLessThan(100);
  });
});

describe('mapWithConcurrency', () => {
  it('bounds concurrent preparation while preserving assignment order', async () => {
    let active = 0;
    let peak = 0;
    const resolvers: Array<() => void> = [];

    const resultPromise = mapWithConcurrency([1, 2, 3, 4, 5], 2, async value => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise<void>(resolve => resolvers.push(resolve));
      active -= 1;
      return value * 10;
    });

    await expect.poll(() => resolvers.length).toBe(2);
    resolvers.shift()?.();
    await expect.poll(() => resolvers.length).toBe(2);
    resolvers.shift()?.();
    await expect.poll(() => resolvers.length).toBe(2);
    resolvers.shift()?.();
    await expect.poll(() => resolvers.length).toBe(2);
    resolvers.shift()?.();
    await expect.poll(() => resolvers.length).toBe(1);
    resolvers.shift()?.();

    await expect(resultPromise).resolves.toEqual([10, 20, 30, 40, 50]);
    expect(peak).toBe(2);
  });

  it('rejects invalid concurrency', async () => {
    await expect(mapWithConcurrency([1], 0, async value => value)).rejects.toThrow(
      'Concurrency must be a positive integer'
    );
  });
});

describe('AUTH_STATE_SIGN_IN_TIMEOUT_MS', () => {
  it('gives the per-shard UI sign-in more room than a single-spec sign-in gets', () => {
    // MYK9-463: 16 shards each sign in twice at job start with no stagger. The
    // spec default is chosen for one browser signing in alone; inheriting it
    // here cost two whole shards of run 34394781017 before load even began.
    expect(AUTH_STATE_SIGN_IN_TIMEOUT_MS).toBeGreaterThan(DEFAULT_SIGN_IN_NAVIGATION_TIMEOUT_MS);
  });

  it('matches the navigation budget the load config already declares', () => {
    // Not a looser threshold invented for this fix — the same 45s the load
    // config sets for navigation and that createAuthState's own page.goto uses.
    expect(AUTH_STATE_SIGN_IN_TIMEOUT_MS).toBe(45_000);
  });
});
