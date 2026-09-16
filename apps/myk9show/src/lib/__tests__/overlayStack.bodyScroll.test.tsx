/**
 * The body-scroll lock's invariants, asserted where they now LIVE. They used to
 * be inlined in `SlideOverPanel`, and moving them here is what let a dialog
 * registered above a closing panel strand `overflow: hidden` forever.
 *
 * Two properties, and the ownership one is easy to lose: release only what this
 * module locked. React runs an effect's previous cleanup before the next effect
 * body, so the release also fires on `open: false -> true` against an empty
 * stack — without ownership that writes the body style on the way IN, on
 * surfaces that never lock at all.
 */
import { describe, expect, it, vi, afterEach } from 'vitest';
import { render } from '@/test/utils/testUtils';
import {
  lockBodyScroll,
  openOverlayCount,
  popOpenOverlay,
  pushOpenOverlay,
  releaseBodyScrollIfNoOverlays,
} from '../overlayStack';
import SlideOverPanel from '@/components/panels/SlideOverPanel';
import { CommonDialog } from '@/components/common/CommonDialog';

afterEach(() => {
  document.body.style.overflow = '';
});

describe('overlayStack body-scroll lock', () => {
  it('clears the inline declaration rather than writing a value that outranks CSS', () => {
    const id = Symbol('panel');
    pushOpenOverlay(id);
    lockBodyScroll();
    expect(document.body.style.overflow).toBe('hidden');

    popOpenOverlay(id);
    releaseBodyScrollIfNoOverlays();

    // `unset` would be an inline declaration beating every author stylesheet.
    expect(document.body.getAttribute('style') ?? '').not.toContain('overflow');
  });

  it('leaves a lock this module did not take alone', () => {
    document.body.style.overflow = 'scroll';

    const id = Symbol('dialog');
    pushOpenOverlay(id);
    popOpenOverlay(id);
    releaseBodyScrollIfNoOverlays();

    expect(document.body.style.overflow).toBe('scroll');
  });

  // A surface that registers in the stack without locking must not stamp the
  // body on its way in — the release fires before the push on every open.
  it('does not touch the body style when a non-locking overlay opens over nothing', () => {
    document.body.style.overflow = 'scroll';

    const { rerender } = render(
      <CommonDialog open={false} onClose={() => {}} title="Status">
        <p>body</p>
      </CommonDialog>
    );
    rerender(
      <CommonDialog open onClose={() => {}} title="Status">
        <p>body</p>
      </CommonDialog>
    );

    expect(document.body.style.overflow).toBe('scroll');
  });

  it('keeps the lock while a nested panel closes and releases once none remain', () => {
    function Panels({ inner }: { inner: boolean }) {
      return (
        <SlideOverPanel open onClose={() => {}} title="Outer">
          <SlideOverPanel open={inner} onClose={() => {}} title="Inner">
            <p>inner</p>
          </SlideOverPanel>
        </SlideOverPanel>
      );
    }
    const { rerender, unmount } = render(<Panels inner />);
    expect(document.body.style.overflow).toBe('hidden');

    rerender(<Panels inner={false} />);
    expect(document.body.style.overflow).toBe('hidden');

    unmount();
    expect(openOverlayCount()).toBe(0);
    expect(document.body.style.overflow).toBe('');
  });

  it('is idempotent when a second locking overlay opens', () => {
    const a = Symbol('a');
    const b = Symbol('b');
    pushOpenOverlay(a);
    lockBodyScroll();
    pushOpenOverlay(b);
    lockBodyScroll();
    expect(document.body.style.overflow).toBe('hidden');

    popOpenOverlay(b);
    releaseBodyScrollIfNoOverlays();
    expect(document.body.style.overflow).toBe('hidden');

    popOpenOverlay(a);
    releaseBodyScrollIfNoOverlays();
    expect(document.body.style.overflow).toBe('');
  });

  it('survives a StrictMode double-invoked open without losing the lock', () => {
    const { unmount } = render(
      <SlideOverPanel open onClose={vi.fn()} title="Edit">
        <p>body</p>
      </SlideOverPanel>
    );
    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(document.body.style.overflow).toBe('');
  });
});
