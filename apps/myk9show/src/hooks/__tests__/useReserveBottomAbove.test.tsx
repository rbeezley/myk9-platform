/**
 * MYK9-1217: the toast stack must end above a block that sits some way up a scrolling pane.
 * Mounts a real component, since a store-only test passes even when nothing registers.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render } from '@/test/utils/testUtils';
import { TOAST_ZONE_PX } from '@/components/layout/toastGeometry';
import { useReserveBottomAbove } from '../useReserveBottomAbove';
import { useActionBarStore, selectReservedBottom } from '@/store/actionBarStore';

const reserved = () => selectReservedBottom(useActionBarStore.getState());

let blockTop = 0;
const originalRect = HTMLElement.prototype.getBoundingClientRect;
const originalInnerHeight = window.innerHeight;

class FakeResizeObserver {
  static instances: FakeResizeObserver[] = [];
  constructor(public callback: () => void) {
    FakeResizeObserver.instances.push(this);
  }
  observe() {}
  disconnect() {}
}

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
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: originalInnerHeight,
    });
    vi.unstubAllGlobals();
  });

  it('reserves exactly the overlap while the block top is inside the toast zone, and releases on unmount', () => {
    blockTop = 720 - 220;
    const { unmount } = render(<Block enabled />);
    expect(reserved()).toBe(220);
    unmount();
    expect(reserved()).toBe(0);
  });

  it('follows the block as the pane scrolls into the zone, and out of it', async () => {
    blockTop = 300;
    render(<Block enabled />);
    expect(reserved()).toBe(0);
    blockTop = 500;
    fireEvent.scroll(document.body);
    await flushFrame();
    expect(reserved()).toBe(220);
    blockTop = 100;
    fireEvent.scroll(document.body);
    await flushFrame();
    expect(reserved()).toBe(0);
  });

  it('recomputes on resize and on the observer, and stops listening once detached', async () => {
    FakeResizeObserver.instances = [];
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    blockTop = 500;
    const { unmount } = render(<Block enabled />);
    expect(reserved()).toBe(220);

    blockTop = 600;
    fireEvent(window, new Event('resize'));
    await flushFrame();
    expect(reserved()).toBe(120);

    blockTop = 480;
    act(() => FakeResizeObserver.instances.forEach(o => o.callback()));
    await flushFrame();
    expect(reserved()).toBe(240);

    unmount();
    expect(reserved()).toBe(0);
    blockTop = 500;
    fireEvent.scroll(document.body);
    fireEvent(window, new Event('resize'));
    await flushFrame();
    expect(reserved()).toBe(0);
  });

  it('reserves nothing for a block scrolled near the top of the viewport (MYK9-1217)', () => {
    blockTop = 40;
    render(<Block enabled />);
    expect(reserved()).toBe(0);
  });

  it('reserves nothing for a block below the fold', () => {
    blockTop = 900;
    render(<Block enabled />);
    expect(reserved()).toBe(0);
  });

  it.each([-50, 0, 40, 200, 459, 460, 461, 500, 719, 720, 721, 900])(
    'never reserves more than the toast zone (block top %i)',
    top => {
      blockTop = top;
      render(<Block enabled />);
      const overlap = 720 - top;
      expect(reserved()).toBeLessThanOrEqual(TOAST_ZONE_PX);
      expect(reserved()).toBe(overlap > 0 && overlap <= TOAST_ZONE_PX ? overlap : 0);
    }
  );

  it('reserves nothing while disabled, and registers when it becomes enabled', () => {
    blockTop = 500;
    const { rerender } = render(<Block enabled={false} />);
    expect(reserved()).toBe(0);
    rerender(<Block enabled />);
    expect(reserved()).toBe(220);
    rerender(<Block enabled={false} />);
    expect(reserved()).toBe(0);
  });
});
