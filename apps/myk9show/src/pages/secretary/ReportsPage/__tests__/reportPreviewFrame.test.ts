import { describe, expect, it, vi } from 'vitest';
import {
  isDisplayingPdf,
  releasePdfFrame,
  writeMarkupIntoFrame,
} from '../reportPreviewFrame';

/**
 * Regression guard for the wrong-document print bug.
 *
 * Check-in Sheet and Scoresheet render a PDF into the preview frame via a blob
 * URL; every other report writes HTML through `contentDocument`. While the PDF
 * is loaded the frame belongs to the PDF viewer, so a markup write silently did
 * nothing and the PREVIOUS report stayed on screen. `handlePrint` prints that
 * same frame, so selecting "Trial Secretary Report" and pressing Print produced
 * the Scoresheet.
 */
function makeFrame(src: string | null) {
  const doc = { open: vi.fn(), write: vi.fn(), close: vi.fn(), body: { scrollHeight: 42 } };
  const listeners: Record<string, Array<() => void>> = {};
  const frame = {
    _src: src,
    getAttribute: (name: string) => (name === 'src' ? frame._src : null),
    set src(value: string) {
      frame._src = value;
      // Assigning src reloads the frame; fire load like the browser would.
      (listeners.load ?? []).forEach(fn => fn());
    },
    get src() {
      return frame._src ?? '';
    },
    contentDocument: doc,
    addEventListener: (event: string, fn: () => void) => {
      (listeners[event] ??= []).push(fn);
    },
    removeEventListener: (event: string, fn: () => void) => {
      listeners[event] = (listeners[event] ?? []).filter(f => f !== fn);
    },
    style: {} as CSSStyleDeclaration,
  };
  return { frame: frame as unknown as HTMLIFrameElement, doc };
}

describe('report preview frame ownership', () => {
  it('recognises a frame that is displaying a PDF blob', () => {
    expect(isDisplayingPdf(makeFrame('blob:http://localhost/abc').frame)).toBe(true);
    expect(isDisplayingPdf(makeFrame('about:blank').frame)).toBe(false);
    expect(isDisplayingPdf(makeFrame(null).frame)).toBe(false);
  });

  it('writes markup directly when no PDF is loaded', () => {
    const { frame, doc } = makeFrame('about:blank');
    writeMarkupIntoFrame(frame, '<p>catalog</p>', () => {});
    expect(doc.write).toHaveBeenCalledWith('<p>catalog</p>');
  });

  it('releases the PDF frame before writing markup into it', () => {
    const { frame, doc } = makeFrame('blob:http://localhost/scoresheet');
    writeMarkupIntoFrame(frame, '<p>trial secretary report</p>', () => {});

    // The blob must be dropped, otherwise the PDF viewer keeps the frame and
    // the write below would land on a document that is never displayed.
    expect(frame.getAttribute('src')).toBe('about:blank');
    expect(doc.write).toHaveBeenCalledWith('<p>trial secretary report</p>');
  });

  it('clears a stale PDF when the next report renders no PDF of its own', () => {
    const { frame } = makeFrame('blob:http://localhost/checkin');
    releasePdfFrame(frame);
    expect(frame.getAttribute('src')).toBe('about:blank');
  });

  it('leaves a non-PDF frame alone', () => {
    const { frame } = makeFrame('about:blank');
    releasePdfFrame(frame);
    expect(frame.getAttribute('src')).toBe('about:blank');
  });
});
