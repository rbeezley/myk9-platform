import { vi } from 'vitest';
import { usePageEditTargetStore } from '@/features/actions/pageEditTarget';

/**
 * Captures what a CSV download would have contained (jsdom's Blob has no `text()`), without
 * touching the real download path. Call `restore` in `afterEach`.
 */
export function captureCsvDownload() {
  const parts: string[] = [];
  // The download defers its URL revoke by 100ms; drop just that timer so none outlives the test
  // (other timers, such as user-event's, stay real).
  const realSetTimeout = globalThis.setTimeout;
  const timers = vi
    .spyOn(globalThis, 'setTimeout')
    .mockImplementation(((handler: TimerHandler, ms?: number, ...args: unknown[]) =>
      ms === 100 ? 0 : realSetTimeout(handler, ms, ...args)) as typeof setTimeout);
  vi.stubGlobal(
    'Blob',
    class {
      constructor(chunks: string[]) {
        parts.push(...chunks);
      }
    }
  );
  const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:csv');
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  return {
    csv: () => parts.join(''),
    restore: () => {
      timers.mockRestore();
      vi.unstubAllGlobals();
      create.mockRestore();
      revoke.mockRestore();
      click.mockRestore();
    },
  };
}

/** The header Actions menu's page exports, as the list registered them. */
export function registeredPageExports() {
  return usePageEditTargetStore.getState().exports;
}

export function resetPageExports() {
  usePageEditTargetStore.setState({ exports: [] });
}
