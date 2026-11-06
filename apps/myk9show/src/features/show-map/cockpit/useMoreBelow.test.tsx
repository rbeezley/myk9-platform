import { act, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useMoreBelow } from './useMoreBelow';

// jsdom has no layout: each test sets the box's scroll geometry, and a stub ResizeObserver
// reports once on observe, as the real one does.
let observers: { callback: () => void }[] = [];
class StubResizeObserver {
  constructor(readonly callback: () => void) {
    observers.push(this);
  }
  observe() {
    this.callback();
  }
  disconnect() {}
}

function geometry(box: HTMLElement, { scrollHeight = 1000, clientHeight = 400, scrollTop = 0 }) {
  Object.defineProperty(box, 'scrollHeight', { configurable: true, value: scrollHeight });
  Object.defineProperty(box, 'clientHeight', { configurable: true, value: clientHeight });
  box.scrollTop = scrollTop;
}

function Box({ enabled, height }: { enabled: boolean; height: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const moreBelow = useMoreBelow(ref, enabled);
  return (
    <div
      ref={node => {
        ref.current = node;
        if (node) geometry(node, { scrollHeight: height });
      }}
      data-testid="box"
    >
      <span>{moreBelow ? 'more below' : 'all shown'}</span>
    </div>
  );
}

describe('useMoreBelow (MYK9-1727)', () => {
  const original = globalThis.ResizeObserver;
  beforeEach(() => {
    observers = [];
    globalThis.ResizeObserver = StubResizeObserver as unknown as typeof ResizeObserver;
  });
  afterEach(() => {
    globalThis.ResizeObserver = original;
  });

  it('says more is below while the content runs past the bottom, and not once scrolled to it', () => {
    render(<Box enabled height={1000} />);
    expect(screen.getByText('more below')).toBeInTheDocument();

    const box = screen.getByTestId('box');
    act(() => {
      box.scrollTop = 600;
      box.dispatchEvent(new Event('scroll'));
    });
    expect(screen.getByText('all shown')).toBeInTheDocument();
  });

  it('says nothing when the content fits', () => {
    render(<Box enabled height={400} />);
    expect(screen.getByText('all shown')).toBeInTheDocument();
  });

  it('says nothing while disabled, and does not observe', () => {
    render(<Box enabled={false} height={1000} />);
    expect(screen.getByText('all shown')).toBeInTheDocument();
    expect(observers).toHaveLength(0);
    expect(vi.isMockFunction(globalThis.ResizeObserver)).toBe(false);
  });
});
