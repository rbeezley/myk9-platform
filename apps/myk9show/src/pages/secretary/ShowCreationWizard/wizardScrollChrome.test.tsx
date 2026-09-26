import { render } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  focusStepEntry,
  STEP_ENTRY_FOCUS_DELAY_MS,
  useStepEntryFocus,
  focusWithoutJump,
  revealFocusedBelowChrome,
  useWizardChromeHeight,
  wizardChromeHeightPx,
} from './wizardScrollChrome';

function Harness({ headerPx, stepsPx }: { headerPx: number; stepsPx: number }) {
  const stepsRef = useRef<HTMLDivElement>(null);
  useWizardChromeHeight(stepsRef);
  return (
    <div
      data-testid="publisher"
      style={{ ['--show-wizard-header-height' as string]: `${headerPx}px` }}
    >
      <div>
        <div
          ref={node => {
            stepsRef.current = node;
            if (node) Object.defineProperty(node, 'offsetHeight', { value: stepsPx });
          }}
        />
      </div>
    </div>
  );
}

let mounted: HTMLInputElement[] = [];

/** An input at `rect`, with its own scroll margin, and spies on how it moves. */
function mountInput(rect: { top: number; bottom: number }, scrollMarginTop = '') {
  const input = document.createElement('input');
  input.style.scrollMarginTop = scrollMarginTop;
  document.body.append(input);
  mounted.push(input);
  vi.spyOn(input, 'getBoundingClientRect').mockReturnValue(rect as DOMRect);
  input.scrollIntoView = vi.fn();
  const focus = vi.spyOn(input, 'focus');
  return { input, focus, scrollIntoView: input.scrollIntoView as ReturnType<typeof vi.fn> };
}

describe('wizard sticky chrome vs focus (MYK9-764)', () => {
  afterEach(() => {
    document.documentElement.style.scrollPaddingTop = '';
    for (const input of mounted) input.remove();
    mounted = [];
  });

  it('measures the header, the step indicator and a small gap', () => {
    expect(wizardChromeHeightPx(77, 120)).toBe(205);
  });

  it('publishes the chrome height on the header-height publisher while mounted, and removes it on unmount', () => {
    const { getByTestId, unmount } = render(<Harness headerPx={77} stepsPx={120} />);
    const publisher = getByTestId('publisher');

    expect(publisher.style.getPropertyValue('--show-wizard-chrome-height')).toBe('205px');
    // The document itself is never touched: its padding would cover the
    // chrome's own buttons.
    expect(document.documentElement.style.scrollPaddingTop).toBe('');
    unmount();
    expect(publisher.style.getPropertyValue('--show-wizard-chrome-height')).toBe('');
  });

  it('focuses a control already on screen below the chrome without scrolling', () => {
    document.documentElement.style.scrollPaddingTop = '48px';
    const { input, focus, scrollIntoView } = mountInput({ top: 300, bottom: 340 }, '200px');
    focusWithoutJump(input);
    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
  });

  it('reveals a control under the chrome with a margin-honouring scroll, then focuses without one', () => {
    document.documentElement.style.scrollPaddingTop = '48px';
    // 220 clears the 48px padding alone, but not padding + the 200px margin.
    const { input, focus, scrollIntoView } = mountInput({ top: 220, bottom: 260 }, '200px');
    focusWithoutJump(input);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
  });

  it('does not move the page for a control whose bottom edge overflows the fold by a sub-pixel', () => {
    // Measured at 390x600: mount focus lands on "Select a past show to clone",
    // whose bottom sits at 600.5. Revealing that half pixel scrolled the page
    // by 1px (MYK9-764, the flaking "stays pinned at 390" regression test).
    const { input, focus, scrollIntoView } = mountInput({
      top: window.innerHeight - 66,
      bottom: window.innerHeight + 0.5,
    });
    focusWithoutJump(input);
    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
  });

  it('reveals a control below the fold the same way', () => {
    const { input, scrollIntoView } = mountInput({ top: 700, bottom: 800 });
    focusWithoutJump(input);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
  });

  it('re-reveals a keyboard-focused control the browser left under the chrome', () => {
    document.documentElement.style.scrollPaddingTop = '48px';
    const under = mountInput({ top: 150, bottom: 190 }, '200px');
    vi.spyOn(under.input, 'matches').mockImplementation(sel => sel === ':focus-visible');
    revealFocusedBelowChrome({ target: under.input });
    expect(under.scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });

    const clear = mountInput({ top: 400, bottom: 440 }, '200px');
    vi.spyOn(clear.input, 'matches').mockImplementation(sel => sel === ':focus-visible');
    revealFocusedBelowChrome({ target: clear.input });
    expect(clear.scrollIntoView).not.toHaveBeenCalled();
  });

  it('leaves a clicked (not :focus-visible) control where the secretary clicked it', () => {
    document.documentElement.style.scrollPaddingTop = '48px';
    const clicked = mountInput({ top: 150, bottom: 190 }, '200px');
    vi.spyOn(clicked.input, 'matches').mockReturnValue(false); // e.g. a clicked button
    revealFocusedBelowChrome({ target: clicked.input });
    expect(clicked.scrollIntoView).not.toHaveBeenCalled();
  });

  it('tolerates half the placement gap, no more', () => {
    document.documentElement.style.scrollPaddingTop = '48px';
    // Reserved 248px; half the 8px gap is tolerated.
    const inside = mountInput({ top: 244, bottom: 284 }, '200px');
    vi.spyOn(inside.input, 'matches').mockImplementation(sel => sel === ':focus-visible');
    revealFocusedBelowChrome({ target: inside.input });
    expect(inside.scrollIntoView).not.toHaveBeenCalled();

    const beyond = mountInput({ top: 243, bottom: 283 }, '200px');
    vi.spyOn(beyond.input, 'matches').mockImplementation(sel => sel === ':focus-visible');
    revealFocusedBelowChrome({ target: beyond.input });
    expect(beyond.scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
  });

  it('ignores focus inside a portalled overlay that bubbled up to the form', () => {
    document.documentElement.style.scrollPaddingTop = '48px';
    const form = document.createElement('div');
    document.body.append(form);
    const overlayItem = mountInput({ top: 10, bottom: 50 });
    vi.spyOn(overlayItem.input, 'matches').mockImplementation(sel => sel === ':focus-visible');
    revealFocusedBelowChrome({ target: overlayItem.input, currentTarget: form });
    expect(overlayItem.scrollIntoView).not.toHaveBeenCalled();
    form.remove();
  });

  describe('focusStepEntry (the delayed step-entry focus)', () => {
    /** A step content with one on-screen control, clear of any chrome. */
    function mountStep() {
      const content = document.createElement('div');
      document.body.append(content);
      const first = document.createElement('input');
      content.append(first);
      vi.spyOn(first, 'getBoundingClientRect').mockReturnValue({
        top: 400,
        bottom: 440,
      } as DOMRect);
      first.scrollIntoView = vi.fn();
      const focus = vi.spyOn(first, 'focus');
      return { content, first, focus };
    }

    afterEach(() => {
      document.body.replaceChildren();
      Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
    });

    it("focuses the step's first control when nothing has moved", () => {
      const { content, focus } = mountStep();
      focusStepEntry(content, 0);
      expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    });

    it('leaves a page the secretary scrolled in the meantime alone', () => {
      const { content, first, focus } = mountStep();
      Object.defineProperty(window, 'scrollY', { value: 969, configurable: true });
      focusStepEntry(content, 0);
      expect(focus).not.toHaveBeenCalled();
      expect(first.scrollIntoView).not.toHaveBeenCalled();
    });

    it('does not take focus from a field the secretary already chose', () => {
      const { content, focus } = mountStep();
      const chosen = document.createElement('input');
      content.append(chosen);
      chosen.focus();
      focus.mockClear();
      focusStepEntry(content, 0);
      expect(focus).not.toHaveBeenCalled();
      expect(document.activeElement).toBe(chosen);
    });

    it.each(['dialog', 'alertdialog', 'listbox', 'menu'])(
      'does not take focus out of an open %s',
      role => {
        const { content, focus } = mountStep();
        const overlay = document.createElement('div');
        overlay.setAttribute('role', role);
        const inOverlay = document.createElement('button');
        overlay.append(inOverlay);
        document.body.append(overlay);
        inOverlay.focus();
        focusStepEntry(content, 0);
        expect(focus).not.toHaveBeenCalled();
        expect(document.activeElement).toBe(inOverlay);
      }
    );
  });

  describe('useStepEntryFocus (the page wiring)', () => {
    function StepHarness({ step }: { step: number }) {
      const ref = useRef<HTMLDivElement>(null);
      useStepEntryFocus(ref, step);
      return (
        <div ref={ref}>
          <input aria-label={`step ${step} first`} key={step} />
        </div>
      );
    }

    function placeClear() {
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
        top: 400,
        bottom: 440,
      } as DOMRect);
    }

    afterEach(() => {
      vi.useRealTimers();
      vi.restoreAllMocks();
      Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
    });

    it('focuses the first control after the delay, not before', () => {
      vi.useFakeTimers();
      placeClear();
      const { getByLabelText } = render(<StepHarness step={1} />);
      vi.advanceTimersByTime(STEP_ENTRY_FOCUS_DELAY_MS - 1);
      expect(document.activeElement).not.toBe(getByLabelText('step 1 first'));
      vi.advanceTimersByTime(1);
      expect(document.activeElement).toBe(getByLabelText('step 1 first'));
    });

    it('measures the scroll from when the step started, so a scroll during the delay skips it', () => {
      vi.useFakeTimers();
      placeClear();
      const { getByLabelText } = render(<StepHarness step={1} />);
      Object.defineProperty(window, 'scrollY', { value: 969, configurable: true });
      vi.advanceTimersByTime(STEP_ENTRY_FOCUS_DELAY_MS);
      expect(document.activeElement).not.toBe(getByLabelText('step 1 first'));
    });

    it("moves focus to the new step's first control on a step change", () => {
      vi.useFakeTimers();
      placeClear();
      const { getByLabelText, rerender } = render(<StepHarness step={1} />);
      vi.advanceTimersByTime(STEP_ENTRY_FOCUS_DELAY_MS);
      // Parked at the footer's Next, scrolled down, then Next is pressed.
      Object.defineProperty(window, 'scrollY', { value: 1200, configurable: true });
      const next = document.createElement('button');
      document.body.append(next);
      next.focus();
      rerender(<StepHarness step={2} />);
      vi.advanceTimersByTime(STEP_ENTRY_FOCUS_DELAY_MS);
      expect(document.activeElement).toBe(getByLabelText('step 2 first'));
      next.remove();
    });
  });
});
