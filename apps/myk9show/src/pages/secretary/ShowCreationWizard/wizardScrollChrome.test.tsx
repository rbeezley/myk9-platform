import { render } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  focusWithoutJump,
  useWizardScrollPadding,
  wizardScrollPaddingTop,
} from './wizardScrollChrome';

function Harness({ headerPx, stepsPx }: { headerPx: number; stepsPx: number }) {
  const stepsRef = useRef<HTMLDivElement>(null);
  useWizardScrollPadding(stepsRef);
  return (
    <div style={{ ['--show-wizard-header-height' as string]: `${headerPx}px` }}>
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

describe('wizard sticky chrome vs focus (MYK9-764)', () => {
  afterEach(() => {
    document.documentElement.style.scrollPaddingTop = '';
    vi.restoreAllMocks();
  });

  it('reserves the app chrome plus both wizard layers and a small gap', () => {
    expect(wizardScrollPaddingTop(77, 120)).toBe('calc(var(--app-top-inset, 3rem) + 205px)');
  });

  it('applies the measured heights to the document while mounted, and restores on unmount', () => {
    document.documentElement.style.scrollPaddingTop = '10px';
    const { unmount } = render(<Harness headerPx={77} stepsPx={120} />);

    expect(document.documentElement.style.scrollPaddingTop).toBe(
      'calc(var(--app-top-inset, 3rem) + 205px)'
    );
    unmount();
    expect(document.documentElement.style.scrollPaddingTop).toBe('10px');
  });

  it('focuses a control already on screen below the chrome without scrolling', () => {
    document.documentElement.style.scrollPaddingTop = '200px';
    const input = document.createElement('input');
    document.body.append(input);
    vi.spyOn(input, 'getBoundingClientRect').mockReturnValue({ top: 300, bottom: 340 } as DOMRect);
    const focus = vi.spyOn(input, 'focus');

    focusWithoutJump(input);

    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    input.remove();
  });

  it('lets the browser scroll a control that sits under the chrome into view', () => {
    document.documentElement.style.scrollPaddingTop = '200px';
    const input = document.createElement('input');
    document.body.append(input);
    vi.spyOn(input, 'getBoundingClientRect').mockReturnValue({ top: 120, bottom: 160 } as DOMRect);
    const focus = vi.spyOn(input, 'focus');

    focusWithoutJump(input);

    expect(focus).toHaveBeenCalledWith(undefined);
    input.remove();
  });
});
