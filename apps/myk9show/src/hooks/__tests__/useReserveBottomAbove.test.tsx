/**
 * MYK9-1217: the toast stack must end above a block that sits some way up a scrolling pane.
 * Mounts a real component, since a store-only test passes even when nothing registers.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, fireEvent, render } from '@testing-library/react';
import { useReserveBottomAbove } from '../useReserveBottomAbove';
import { useActionBarStore, selectReservedBottom } from '@/store/actionBarStore';

const reserved = () => selectReservedBottom(useActionBarStore.getState());

let blockTop = 0;
const originalRect = HTMLElement.prototype.getBoundingClientRect;

function Block({ enabled }: { enabled: boolean }) {
  const ref = useReserveBottomAbove<HTMLDivElement>(enabled);
  return <div ref={ref}>paperwork</div>;
}

async function flushFrame() {
  await act(async () => {
    await new Promise(resolve => window.requestAnimationFrame(() => resolve(null)));
  });
}

describe('useReserveBottomAbove', () => {
  beforeEach(() => {
    blockTop = 500;
    useActionBarStore.setState({ heights: {} });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 720 });
    HTMLElement.prototype.getBoundingClientRect = () =>
      ({
        top: blockTop,
        height: 100,
        width: 100,
        left: 0,
        right: 0,
        bottom: 0,
        x: 0,
        y: 0,
      }) as DOMRect;
  });

  afterEach(() => {
    HTMLElement.prototype.getBoundingClientRect = originalRect;
  });

  it('reserves the distance from the viewport bottom up to the block top, and releases on unmount', () => {
    const { unmount } = render(<Block enabled />);
    expect(reserved()).toBe(220);
    unmount();
    expect(reserved()).toBe(0);
  });

  it('follows the block as the pane scrolls', async () => {
    render(<Block enabled />);
    blockTop = 300;
    fireEvent.scroll(document.body);
    await flushFrame();
    expect(reserved()).toBe(420);
  });

  it('reserves nothing for a block below the fold', () => {
    blockTop = 900;
    render(<Block enabled />);
    expect(reserved()).toBe(0);
  });

  it('reserves nothing while disabled, and registers when it becomes enabled', () => {
    const { rerender } = render(<Block enabled={false} />);
    expect(reserved()).toBe(0);
    rerender(<Block enabled />);
    expect(reserved()).toBe(220);
    rerender(<Block enabled={false} />);
    expect(reserved()).toBe(0);
  });
});
