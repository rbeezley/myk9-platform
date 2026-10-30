import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { StaggeredGrid } from './StaggeredGrid';

// jsdom has no IntersectionObserver, which framer's whileInView needs. This
// stand-in reports every observed element as on screen, so the assertions
// below test the state framer leaves on each card, not the observer.
class AlwaysVisibleObserver {
  constructor(private readonly callback: IntersectionObserverCallback) {}
  observe(target: Element) {
    this.callback(
      [{ isIntersecting: true, intersectionRatio: 1, target } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver
    );
  }
  unobserve() {}
  disconnect() {}
}

function Grid({ ids }: { ids: string[] }) {
  return (
    <StaggeredGrid>
      {ids.map(id => (
        <div key={id} data-testid={`card-${id}`}>
          {id}
        </div>
      ))}
    </StaggeredGrid>
  );
}

const wrapperOf = (id: string) => screen.getByTestId(`card-${id}`).parentElement as HTMLElement;

describe('StaggeredGrid', () => {
  beforeEach(() => {
    vi.stubGlobal('IntersectionObserver', AlwaysVisibleObserver);
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
      })
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows every card, including ones added after the first render', async () => {
    const { rerender } = render(<Grid ids={['a']} />);
    await vi.waitFor(() => expect(wrapperOf('a').style.opacity).toBe('1'));

    rerender(<Grid ids={['a', 'b', 'c', 'd']} />);
    for (const id of ['b', 'c', 'd']) {
      await vi.waitFor(() => expect(wrapperOf(id).style.opacity).toBe('1'));
    }
    expect(wrapperOf('a').style.opacity).toBe('1');
  });

  it('keeps a card mounted when the list is reordered or filtered', async () => {
    const { rerender } = render(<Grid ids={['a', 'b']} />);
    await vi.waitFor(() => expect(wrapperOf('b').style.opacity).toBe('1'));
    const before = wrapperOf('b');

    rerender(<Grid ids={['b', 'c']} />);
    await vi.waitFor(() => expect(wrapperOf('c').style.opacity).toBe('1'));
    expect(wrapperOf('b')).toBe(before);
  });
});
