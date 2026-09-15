/**
 * `DogStatusDialog` is now reachable from inside the Edit Dog SlideOverPanel, so
 * it has to join the shared open-overlay stack (MYK9-523). Without membership
 * the panel behind it is still `isTopmostOverlay`, and one Escape closes the
 * panel — discarding the user's unsaved edits — instead of the dialog.
 *
 * Asserted against the stack rather than a keypress because `SlideOverPanel`'s
 * Escape handler consults exactly this predicate.
 */
import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import { render } from '@/test/utils/testUtils';
import {
  isTopmostOverlay,
  openOverlayCount,
  popOpenOverlay,
  pushOpenOverlay,
} from '@/lib/overlayStack';
import DogStatusDialog from '../DogStatusDialog';

const panelId = Symbol('standin-slide-over-panel');

function renderDialog(open: boolean) {
  return render(
    <DogStatusDialog
      open={open}
      onOpenChange={() => {}}
      dogName="Maple"
      currentStatus="active"
      onSave={vi.fn()}
    />
  );
}

describe('DogStatusDialog overlay-stack membership', () => {
  beforeEach(() => {
    popOpenOverlay(panelId);
  });

  // `overlayStack` is module-scope mutable state shared with every other file in
  // the run, so this stand-in must never outlive its own test.
  afterEach(() => {
    popOpenOverlay(panelId);
  });

  it('takes the top of the stack from a panel that opened first', () => {
    pushOpenOverlay(panelId);
    expect(isTopmostOverlay(panelId)).toBe(true);

    renderDialog(true);

    expect(openOverlayCount()).toBe(2);
    expect(isTopmostOverlay(panelId)).toBe(false);
  });

  it('gives the top back to the panel when it closes', () => {
    pushOpenOverlay(panelId);
    const { unmount } = renderDialog(true);
    expect(isTopmostOverlay(panelId)).toBe(false);

    unmount();

    expect(isTopmostOverlay(panelId)).toBe(true);
  });

  it('claims nothing while closed', () => {
    pushOpenOverlay(panelId);
    renderDialog(false);
    expect(openOverlayCount()).toBe(1);
    expect(isTopmostOverlay(panelId)).toBe(true);
  });
});
