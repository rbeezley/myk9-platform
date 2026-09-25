import { render } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  focusWithoutJump,
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

function mountInput(rect: { top: number; bottom: number }, scrollMarginTop = '') {
  const input = document.createElement('input');
  input.style.scrollMarginTop = scrollMarginTop;
  document.body.append(input);
  const rectSpy = vi.spyOn(input, 'getBoundingClientRect').mockReturnValue(rect as DOMRect);
  const focus = vi.spyOn(input, 'focus');
  return {
    focus,
    cleanup: () => {
      rectSpy.mockRestore();
      focus.mockRestore();
      input.remove();
    },
  };
}

describe('wizard sticky chrome vs focus (MYK9-764)', () => {
  afterEach(() => {
    document.documentElement.style.scrollPaddingTop = '';
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
    const { focus, cleanup } = mountInput({ top: 300, bottom: 340 }, '200px');
    focusWithoutJump(document.querySelector('input') as HTMLElement);
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    cleanup();
  });

  it('lets the browser scroll a control under the chrome into view (padding + its own margin)', () => {
    document.documentElement.style.scrollPaddingTop = '48px';
    // 220 clears the 48px padding alone, but not padding + the 200px margin.
    const { focus, cleanup } = mountInput({ top: 220, bottom: 260 }, '200px');
    focusWithoutJump(document.querySelector('input') as HTMLElement);
    expect(focus).toHaveBeenCalledWith(undefined);
    cleanup();
  });

  it('lets the browser scroll a control below the fold into view', () => {
    const { focus, cleanup } = mountInput({ top: 700, bottom: 800 });
    focusWithoutJump(document.querySelector('input') as HTMLElement);
    expect(focus).toHaveBeenCalledWith(undefined);
    cleanup();
  });
});
