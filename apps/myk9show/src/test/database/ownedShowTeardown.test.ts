import { describe, expect, it, vi } from 'vitest';
import type { Page } from '@playwright/test';

import { createOwnedShowTeardown } from '../e2e/helpers/ownedShowTeardown';

describe('createOwnedShowTeardown', () => {
  function createResponsePage() {
    type Listener = (response: unknown) => void;
    const listeners = new Set<Listener>();
    const page = {
      on: vi.fn((_event: string, listener: Listener) => listeners.add(listener)),
      off: vi.fn((_event: string, listener: Listener) => listeners.delete(listener)),
    } as unknown as Page;

    return {
      page,
      emitResponse(response: {
        method?: string;
        url?: string;
        ok?: boolean;
        json: () => Promise<unknown>;
      }) {
        const playwrightResponse = {
          request: () => ({ method: () => response.method ?? 'POST' }),
          url: () => response.url ?? 'https://example.test/rest/v1/shows',
          ok: () => response.ok ?? true,
          json: response.json,
        };
        for (const listener of listeners) listener(playwrightResponse);
      },
      listenerCount: () => listeners.size,
    };
  }

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

  it('tracks the successful GUI create response before later navigation assertions', async () => {
    const teardown = createOwnedShowTeardown();
    const responsePage = createResponsePage();
    teardown.attachShowCreateObserver(responsePage.page);
    responsePage.emitResponse({ json: async () => ({ id: 'gui-created-before-navigation' }) });

    // The following navigation assertion may fail; response observation already owns the ID.
    await teardown.awaitObservedCreates();

    expect(teardown.pending()).toEqual(['gui-created-before-navigation']);
  });

  it('accepts PostgREST array responses and de-duplicates repeated successful responses', async () => {
    const teardown = createOwnedShowTeardown();
    const responsePage = createResponsePage();
    teardown.attachShowCreateObserver(responsePage.page);
    responsePage.emitResponse({
      json: async () => [{ id: 'gui-created-1' }, { id: 'gui-created-2' }],
    });
    responsePage.emitResponse({ json: async () => ({ id: 'gui-created-1' }) });

    await teardown.awaitObservedCreates();

    expect(teardown.pending()).toEqual(['gui-created-1', 'gui-created-2']);
  });

  it('ignores unsuccessful responses, non-POST requests, and unrelated tables', async () => {
    const teardown = createOwnedShowTeardown();
    const responsePage = createResponsePage();
    teardown.attachShowCreateObserver(responsePage.page);
    responsePage.emitResponse({ ok: false, json: async () => ({ id: 'failed-show' }) });
    responsePage.emitResponse({ method: 'GET', json: async () => ({ id: 'read-show' }) });
    responsePage.emitResponse({
      url: 'https://example.test/rest/v1/trials',
      json: async () => ({ id: 'trial-id' }),
    });

    await teardown.awaitObservedCreates();

    expect(teardown.pending()).toEqual([]);
  });

  it('ignores a successful response whose decoded JSON has no valid show ID', async () => {
    const teardown = createOwnedShowTeardown();
    const responsePage = createResponsePage();
    teardown.attachShowCreateObserver(responsePage.page);
    responsePage.emitResponse({ json: async () => ({ id: 42 }) });
    responsePage.emitResponse({ json: async () => 'not a PostgREST row' });
    responsePage.emitResponse({ json: async () => ({ id: '   ' }) });

    await teardown.awaitObservedCreates();

    expect(teardown.pending()).toEqual([]);
  });

  it('waits for response parsing before cleanup snapshots IDs', async () => {
    const teardown = createOwnedShowTeardown();
    const responsePage = createResponsePage();
    let resolveBody!: (body: unknown) => void;
    teardown.attachShowCreateObserver(responsePage.page);
    responsePage.emitResponse({
      json: () => new Promise(resolve => (resolveBody = resolve)),
    });
    const deleteShow = vi.fn(async () => ({}));

    const cleanup = teardown.cleanup(deleteShow);
    await Promise.resolve();
    expect(deleteShow).not.toHaveBeenCalled();
    resolveBody({ id: 'parsed-before-cleanup-snapshot' });
    await cleanup;

    expect(deleteShow).toHaveBeenCalledWith('parsed-before-cleanup-snapshot');
    expect(responsePage.listenerCount()).toBe(0);
  });

  it('reports rejected response parsing after attempting every known ID', async () => {
    const teardown = createOwnedShowTeardown();
    const responsePage = createResponsePage();
    teardown.track('known-show');
    teardown.attachShowCreateObserver(responsePage.page);
    responsePage.emitResponse({
      json: async () => Promise.reject(new SyntaxError('malformed JSON response')),
    });
    responsePage.emitResponse({
      json: async () => Promise.reject(new Error('response body unavailable')),
    });
    const deleteShow = vi.fn(async () => ({ error: new Error('delete refused') }));

    await expect(teardown.cleanup(deleteShow)).rejects.toThrow(
      /malformed JSON response.*response body unavailable.*known-show: delete refused/
    );

    expect(deleteShow).toHaveBeenCalledTimes(1);
    expect(deleteShow).toHaveBeenCalledWith('known-show');
    expect(responsePage.listenerCount()).toBe(0);
  });
});
