import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { NIGHT_BEFORE_CHECKS, NightBeforeCard } from '../NightBeforeCard';

const setReducedMotion = (reduce: boolean) =>
  vi.spyOn(window, 'matchMedia').mockImplementation(
    q =>
      ({
        matches: reduce && q.includes('reduce'),
        media: q,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }) as MediaQueryList
  );

describe('NightBeforeCard', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('lists only checks the app really makes today (D11 honesty rule)', () => {
    expect(NIGHT_BEFORE_CHECKS.map(c => c.signal)).toEqual([
      'show-details-missing',
      'no-classes',
      'judges-missing',
      'show-not-visible',
      'exhibitor-materials-unpublished',
    ]);
    for (const c of NIGHT_BEFORE_CHECKS) expect(c.label).not.toMatch(/offline|reconcil|print/i);
  });

  it('does not tick until its step is revealed', () => {
    setReducedMotion(false);
    render(<NightBeforeCard active={false} stepMs={100} />);
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByText('0 of 5 checked')).toBeInTheDocument();
  });

  it('ticks each check green and ends with the all-clear line', () => {
    setReducedMotion(false);
    render(<NightBeforeCard active stepMs={100} />);
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(screen.getByText('2 of 5 checked')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByText('All set')).toBeInTheDocument();
    expect(screen.getByText('Everything is handled. See you at the ring.')).toBeVisible();
  });

  it('replays from the start and ticks again', () => {
    setReducedMotion(false);
    render(<NightBeforeCard active stepMs={100} />);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByText('All set')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Replay' }));
    expect(screen.getByText('0 of 5 checked')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(screen.getByText('2 of 5 checked')).toBeInTheDocument();
  });

  it('shows every check done under reduced motion', () => {
    setReducedMotion(true);
    render(<NightBeforeCard active={false} />);
    expect(screen.getByText('All set')).toBeInTheDocument();
  });
});
