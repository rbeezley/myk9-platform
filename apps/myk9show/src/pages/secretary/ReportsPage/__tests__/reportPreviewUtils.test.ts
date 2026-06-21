import type { RefObject } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { printIframe } from '../reportPreviewUtils';

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
