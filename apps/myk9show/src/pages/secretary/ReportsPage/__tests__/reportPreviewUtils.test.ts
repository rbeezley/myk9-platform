import type { RefObject } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { printIframe, printIframeAndWait } from '../reportPreviewUtils';

function iframeRef(innerHTML: string | null, print = vi.fn()): RefObject<HTMLIFrameElement | null> {
  if (innerHTML === null) return { current: null };
  return {
    current: {
      contentDocument: { body: { innerHTML } },
      contentWindow: { print },
    } as unknown as HTMLIFrameElement,
  };
}

describe('printIframe', () => {
  it('returns false and does not print when the ref is empty', () => {
    expect(printIframe(iframeRef(null))).toBe(false);
  });

  it('returns false and does not print when the preview body has not rendered', () => {
    const print = vi.fn();
    // Regression guard: a blank preview must report failure so the caller can
    // tell the secretary the report is still loading, instead of a silent no-op.
    expect(printIframe(iframeRef('', print))).toBe(false);
    expect(print).not.toHaveBeenCalled();
  });

  it('prints and returns true once the preview has content', () => {
    const print = vi.fn();
    expect(printIframe(iframeRef('<h1>Catalog</h1>', print))).toBe(true);
    expect(print).toHaveBeenCalledOnce();
  });
});

describe('printIframeAndWait', () => {
  function realFrame(innerHTML: string, print: () => void) {
    const listeners = new Map<string, Set<() => void>>();
    const contentWindow = {
      print,
      addEventListener: (type: string, fn: () => void) => {
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type)!.add(fn);
      },
      removeEventListener: (type: string, fn: () => void) => listeners.get(type)?.delete(fn),
    };
    const ref = {
      current: {
        contentDocument: { body: { innerHTML } },
        contentWindow,
      } as unknown as HTMLIFrameElement,
    };
    return { ref, fire: () => listeners.get('afterprint')?.forEach(fn => fn()) };
  }
  async function pending(promise: Promise<boolean>) {
    let value: boolean | undefined;
    void promise.then(v => {
      value = v;
    });
    await Promise.resolve();
    await Promise.resolve();
    return value === undefined;
  }

  it('resolves false without waiting when there is nothing to print', async () => {
    const { ref } = realFrame('', vi.fn());
    await expect(printIframeAndWait(ref)).resolves.toBe(false);
  });

  it('stays pending after a quick print() call until the dialog closes (afterprint on the frame)', async () => {
    const { ref, fire } = realFrame('<h1>Sheet</h1>', vi.fn());
    const done = printIframeAndWait(ref);
    expect(await pending(done)).toBe(true);
    fire();
    await expect(done).resolves.toBe(true);
  });

  it('resolves on afterprint fired during the print call', async () => {
    const holder: { fire: () => void } = { fire: () => {} };
    const { ref, fire } = realFrame('<h1>Sheet</h1>', () => holder.fire());
    holder.fire = fire;
    await expect(printIframeAndWait(ref)).resolves.toBe(true);
  });

  it('resolves when print() blocked on the dialog and then returned', async () => {
    const now = vi.spyOn(performance, 'now');
    now.mockReturnValueOnce(0).mockReturnValueOnce(4000);
    const { ref } = realFrame('<h1>Sheet</h1>', vi.fn());
    await expect(printIframeAndWait(ref)).resolves.toBe(true);
    now.mockRestore();
  });

  it('resolves when the window regains focus after the dialog', async () => {
    const { ref } = realFrame('<h1>Sheet</h1>', vi.fn());
    const done = printIframeAndWait(ref);
    expect(await pending(done)).toBe(true);
    window.dispatchEvent(new Event('focus'));
    await expect(done).resolves.toBe(true);
  });

  it('resolves once even when several signals arrive', async () => {
    const { ref, fire } = realFrame('<h1>Sheet</h1>', vi.fn());
    const done = printIframeAndWait(ref);
    fire();
    window.dispatchEvent(new Event('focus'));
    window.dispatchEvent(new Event('afterprint'));
    await expect(done).resolves.toBe(true);
  });
});
