import { render } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
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

  it('leaves a clicked control where the secretary clicked it', () => {
    document.documentElement.style.scrollPaddingTop = '48px';
    const clicked = mountInput({ top: 150, bottom: 190 }, '200px');
    vi.spyOn(clicked.input, 'matches').mockReturnValue(false); // not :focus-visible
    revealFocusedBelowChrome({ target: clicked.input });
    expect(clicked.scrollIntoView).not.toHaveBeenCalled();
  });

  it('does not treat a control inside the placement gap as obscured', () => {
    document.documentElement.style.scrollPaddingTop = '48px';
    // Reserved 248px; 244 is inside the 8px gap below the chrome, not under it.
    const inGap = mountInput({ top: 244, bottom: 284 }, '200px');
    vi.spyOn(inGap.input, 'matches').mockImplementation(sel => sel === ':focus-visible');
    revealFocusedBelowChrome({ target: inGap.input });
    expect(inGap.scrollIntoView).not.toHaveBeenCalled();
  });
});
