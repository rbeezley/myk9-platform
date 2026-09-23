import type { Page } from '@playwright/test';

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
  const track = (showId: string) => {
    if (!showId.trim()) throw new Error('Cannot track an empty owned show id');
    ownedShowIds.add(showId);
    return showId;
  };

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

    pending() {
      return [...ownedShowIds];
    },

    async cleanup(target: OwnedShowDelete | Page) {
      const deleteShow: OwnedShowDelete =
        typeof target === 'function'
          ? target
          : showId =>
              target.evaluate(async id => {
                const { hardDeleteShow } = await import('/src/services/database/shows/index.ts');
                return hardDeleteShow(id);
              }, showId);
      const failures: string[] = [];
      for (const showId of [...ownedShowIds]) {
        try {
          const result = await deleteShow(showId);
          if (result && 'error' in result && result.error) {
            const errorMessage =
              result.error instanceof Error
                ? result.error.message
                : typeof result.error === 'object' &&
                    result.error !== null &&
                    'message' in result.error
                  ? String(result.error.message)
                  : String(result.error);
            failures.push(`${showId}: ${errorMessage}`);
            continue;
          }

          ownedShowIds.delete(showId);
        } catch (error) {
          failures.push(`${showId}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      if (failures.length > 0) {
        throw new Error(`Owned E2E show teardown failed: ${failures.join('; ')}`);
      }
    },
  };
}
