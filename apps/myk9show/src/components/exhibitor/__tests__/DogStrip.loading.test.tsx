import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@/test/utils/testUtils';
import { DogStrip } from '../DogStrip';

const titleProgress = vi.hoisted(() =>
  vi.fn(() => ({
    earnedAbbreviations: ['SWN'],
    isLoading: false,
  }))
);
vi.mock('@/hooks/useTitleProgress', () => ({ useTitleProgress: titleProgress }));

const observers = new Map<Element, (visible: boolean) => void>();
const disconnect = vi.fn();

beforeEach(() => {
  titleProgress.mockClear();
  observers.clear();
  disconnect.mockClear();
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(private callback: IntersectionObserverCallback) {}
      observe(target: Element) {
        observers.set(target, visible =>
          this.callback(
            [{ target, isIntersecting: visible } as IntersectionObserverEntry],
            this as unknown as IntersectionObserver
          )
        );
      }
      unobserve(target: Element) {
        observers.delete(target);
      }
      disconnect() {
        disconnect();
      }
    }
  );
});
afterEach(() => vi.unstubAllGlobals());

const dogs = Array.from({ length: 252 }, (_, i) => ({ id: `dog-${i}`, call_name: `Dog ${i}` }));

describe('MYK9-289 dog rail title loading', () => {
  it('does not start 252 title queries before cards are visible', () => {
    render(<DogStrip dogs={dogs} />);
    expect(titleProgress).not.toHaveBeenCalled();
    expect(screen.getAllByText(/^Dog \d+$/)).toHaveLength(252);
  });

  it('loads only intersecting cards and retains their titles after scrolling away', () => {
    render(<DogStrip dogs={dogs.filter((_, index) => index === 0 || index === 251)} />);
    const first = screen.getByRole('button', { name: /Dog 0 No upcoming classes/ });
    act(() => observers.get(first)?.(true));
    expect(titleProgress).toHaveBeenCalledWith('dog-0');
    expect(titleProgress).toHaveBeenCalledTimes(1);
    expect(screen.getByText('SWN')).toBeInTheDocument();
    act(() => observers.get(first)?.(false));
    expect(screen.getByText('SWN')).toBeInTheDocument();
    const last = screen.getByRole('button', { name: /Dog 251 No upcoming classes/ });
    act(() => observers.get(last)?.(true));
    expect(titleProgress).toHaveBeenLastCalledWith('dog-251');
    expect(screen.getAllByText('SWN')).toHaveLength(2);
  });

  it('loads titles on keyboard focus and disconnects observers on unmount', () => {
    const { unmount } = render(<DogStrip dogs={dogs.slice(0, 1)} />);
    act(() => screen.getByRole('button', { name: /Dog 0 No upcoming classes/ }).focus());
    expect(titleProgress).toHaveBeenCalledWith('dog-0');
    unmount();
    expect(disconnect).toHaveBeenCalled();
  });
});
