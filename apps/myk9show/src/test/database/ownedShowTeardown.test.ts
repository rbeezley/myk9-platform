import { describe, expect, it, vi } from 'vitest';
import type { Page } from '@playwright/test';

import { createOwnedShowTeardown } from '../e2e/helpers/ownedShowTeardown';

describe('createOwnedShowTeardown', () => {
  it('deletes duplicate IDs once, continues after refusals, and retains only refused IDs', async () => {
    const teardown = createOwnedShowTeardown();
    teardown.track('show-owned-1');
    teardown.track('show-owned-2');
    teardown.track('show-owned-1');
    const deleteShow = vi.fn(async (showId: string) =>
      showId === 'show-owned-1' ? { error: new Error('blocked') } : {}
    );

    await expect(teardown.cleanup(deleteShow)).rejects.toThrow('show-owned-1');
    expect(deleteShow).toHaveBeenCalledTimes(2);
    expect(deleteShow).toHaveBeenCalledWith('show-owned-1');
    expect(deleteShow).toHaveBeenCalledWith('show-owned-2');
    expect(teardown.pending()).toEqual(['show-owned-1']);
  });

  it('reports every refusal and still removes IDs whose hard delete succeeds', async () => {
    const teardown = createOwnedShowTeardown();
    teardown.track('show-refused-1');
    teardown.track('show-refused-2');
    teardown.track('show-deleted');
    const deleteShow = vi.fn(async (showId: string) => {
      if (showId === 'show-refused-1') return { data: null, error: { message: 'retained' } };
      if (showId === 'show-refused-2') throw new Error('database unavailable');
      return { data: { id: showId }, error: null };
    });

    await expect(teardown.cleanup(deleteShow)).rejects.toThrow(
      /show-refused-1: retained; show-refused-2: database unavailable/
    );

    expect(deleteShow).toHaveBeenCalledTimes(3);
    expect(teardown.pending()).toEqual(['show-refused-1', 'show-refused-2']);
  });

  it('registers the show ID at the create boundary', async () => {
    const teardown = createOwnedShowTeardown();
    const page = {
      evaluate: vi.fn(async () => ({
        data: { id: 'show-created-at-boundary', name: 'Owned fixture' },
        error: null,
      })),
    } as unknown as Page;

    const result = await teardown.create(page, { name: 'Owned fixture' });

    expect(result.data?.id).toBe('show-created-at-boundary');
    expect(teardown.pending()).toEqual(['show-created-at-boundary']);
    expect(page.evaluate).toHaveBeenCalledTimes(1);
  });

  it('rejects an empty ID so teardown cannot silently broaden its scope', () => {
    const teardown = createOwnedShowTeardown();
    expect(() => teardown.track('')).toThrow('empty owned show id');
    expect(() => teardown.track('   ')).toThrow('empty owned show id');
  });

  it('uses the reviewed hard-delete service when given a Playwright page', async () => {
    const teardown = createOwnedShowTeardown();
    teardown.track('show-for-page-cleanup');
    const page = {
      evaluate: vi.fn(async () => ({ error: null })),
    } as unknown as Page;

    await teardown.cleanup(page);

    expect(page.evaluate).toHaveBeenCalledTimes(1);
    expect(teardown.pending()).toEqual([]);
  });

  it('keeps a soft-deleted show owned until hard cleanup succeeds', async () => {
    const teardown = createOwnedShowTeardown();
    const page = {
      evaluate: vi
        .fn()
        .mockResolvedValueOnce({ data: { id: 'soft-deleted-show' }, error: null })
        .mockResolvedValueOnce({ data: null, error: null })
        .mockResolvedValueOnce({ data: { id: 'soft-deleted-show' }, error: null }),
    } as unknown as Page;

    await teardown.create(page, { name: 'Soft-deleted fixture' });
    await page.evaluate(async () => ({ data: null, error: null }));

    expect(teardown.pending()).toEqual(['soft-deleted-show']);

    await teardown.cleanup(page);

    expect(teardown.pending()).toEqual([]);
    expect(page.evaluate).toHaveBeenCalledTimes(3);
  });
});
