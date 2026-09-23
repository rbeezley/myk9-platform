import type { Page, Response } from '@playwright/test';

export type OwnedShowDelete = (
  showId: string
) => Promise<{ data?: unknown; error?: unknown } | void>;
export type OwnedShowData = Record<string, unknown>;

/**
 * Creates and tracks only show IDs owned by the current E2E test, then removes
 * each one through the hard-delete path. Call cleanup from afterEach so a
 * failed assertion cannot leave a published fixture in the shared target.
 */
export function createOwnedShowTeardown() {
  const ownedShowIds = new Set<string>();
  const observedParses = new Set<Promise<void>>();
  const observedErrors: unknown[] = [];
  let detachObserver: (() => void) | undefined;
  const track = (showId: string) => {
    if (!showId.trim()) throw new Error('Cannot track an empty owned show id');
    ownedShowIds.add(showId);
    return showId;
  };
  const trackReturnedIds = (body: unknown) => {
    for (const row of Array.isArray(body) ? body : [body]) {
      if (
        row &&
        typeof row === 'object' &&
        'id' in row &&
        typeof row.id === 'string' &&
        row.id.trim()
      ) {
        track(row.id);
      }
    }
  };
  const waitForObservedParses = async () => {
    while (observedParses.size > 0) {
      await Promise.all([...observedParses]);
    }
  };
  const formatError = (error: unknown) => (error instanceof Error ? error.message : String(error));

  return {
    async create(page: Page, showData: OwnedShowData) {
      const result = await page.evaluate(async data => {
        const { createShow } = await import('/src/services/database/shows/index.ts');
        return createShow(data as Parameters<typeof createShow>[0]);
      }, showData);

      if (result.data?.id) track(result.data.id);
      return result;
    },

    track,

    attachShowCreateObserver(page: Page) {
      detachObserver?.();
      let attached = true;
      const onResponse = (response: Response) => {
        try {
          if (
            response.request().method() !== 'POST' ||
            !new URL(response.url()).pathname.endsWith('/rest/v1/shows') ||
            !response.ok()
          ) {
            return;
          }

          const parse = Promise.resolve()
            .then(() => response.json())
            .then(trackReturnedIds)
            .catch(error => {
              observedErrors.push(error);
            });
          observedParses.add(parse);
          void parse.finally(() => observedParses.delete(parse));
        } catch (error) {
          observedErrors.push(error);
        }
      };
      const detach = () => {
        if (!attached) return;
        attached = false;
        page.off('response', onResponse);
        if (detachObserver === detach) detachObserver = undefined;
      };

      page.on('response', onResponse);
      detachObserver = detach;
      return detach;
    },

    async awaitObservedCreates() {
      await waitForObservedParses();
      if (observedErrors.length > 0) {
        throw new Error(
          `Owned E2E show create response parsing failed: ${observedErrors.map(formatError).join('; ')}`
        );
      }
    },

    pending() {
      return [...ownedShowIds];
    },

    async cleanup(target: OwnedShowDelete | Page) {
      detachObserver?.();
      await waitForObservedParses();
      const deleteShow: OwnedShowDelete =
        typeof target === 'function'
          ? target
          : showId =>
              target.evaluate(async id => {
                const { hardDeleteShow } = await import('/src/services/database/shows/index.ts');
                return hardDeleteShow(id);
              }, showId);
      const failures = observedErrors
        .splice(0)
        .map(error => `show create response parse failed: ${formatError(error)}`);
      for (const showId of [...ownedShowIds]) {
        try {
          const result = await deleteShow(showId);
          if (result && 'error' in result && result.error) {
            const errorMessage =
              typeof result.error === 'object' && result.error !== null && 'message' in result.error
                ? String(result.error.message)
                : formatError(result.error);
            failures.push(`${showId}: ${errorMessage}`);
            continue;
          }

          ownedShowIds.delete(showId);
        } catch (error) {
          failures.push(`${showId}: ${formatError(error)}`);
        }
      }

      if (failures.length > 0) {
        throw new Error(`Owned E2E show teardown failed: ${failures.join('; ')}`);
      }
    },
  };
}
