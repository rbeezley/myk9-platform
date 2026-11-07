import { describe, expect, it, vi } from 'vitest';
import type { Entry } from '@myk9/ringside';
import { createRunOrderUpdater } from './runOrderUpdater';

const entries = [{ id: 'e1' }, { id: 'e2' }] as unknown as Entry[];

describe('createRunOrderUpdater (MYK9-1734)', () => {
  it('re-reads the list only after the save, and finishes only once the re-read has', async () => {
    const calls: string[] = [];
    let finishReread = () => {};
    const persist = vi.fn(async () => {
      calls.push('persist');
    });
    const reread = vi.fn(
      () =>
        new Promise<void>(resolve => {
          calls.push('reread');
          finishReread = resolve;
        })
    );

    let done = false;
    const run = createRunOrderUpdater(reread, persist)(entries, entries).then(() => {
      done = true;
    });
    await vi.waitFor(() => expect(calls).toEqual(['persist', 'reread']));
    // The drag hook starts its guard timer when this resolves, so it must wait for the re-read.
    expect(done).toBe(false);
    finishReread();
    await run;
    expect(done).toBe(true);
    expect(persist).toHaveBeenCalledWith(entries, entries);
  });

  it('does not re-read when the save fails, so the drag hook reports the error', async () => {
    const reread = vi.fn(async () => {});
    const persist = vi.fn(async () => {
      throw new Error('queue full');
    });

    await expect(createRunOrderUpdater(reread, persist)(entries, entries)).rejects.toThrow(
      'queue full'
    );
    expect(reread).not.toHaveBeenCalled();
  });
});
