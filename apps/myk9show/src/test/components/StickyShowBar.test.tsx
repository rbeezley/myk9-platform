import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { StickyShowBar } from '@/components/exhibitor/StickyShowBar';
import type { ShowDayClass } from '@/types/show-day-types';

function makeClass(overrides: Partial<ShowDayClass> = {}): ShowDayClass {
  return {
    classId: 'class-1',
    className: 'Container Novice A',
    element: 'Container',
    level: 'Novice',
    dogCallName: 'Storm',
    dogId: 'dog-1',
    armband: '160',
    entryId: 'entry-1',
    totalEntries: 12,
    scoredEntries: 5,
    currentDogInRing: null,
    myRunningOrder: 8,
    estimatedTimeMinutes: 20,
    entryStatus: 'checked-in',
    isScored: false,
    resultStatus: null,
    classStatus: 'in-progress',
    showId: 'show-1',
    showName: 'AKC Scent Work',
    trialDate: '2026-03-09',
    ...overrides,
  };
}

// Mock IntersectionObserver
let observerCallback: IntersectionObserverCallback;
const mockObserve = vi.fn();
const mockDisconnect = vi.fn();

class MockIntersectionObserver {
  constructor(callback: IntersectionObserverCallback) {
    observerCallback = callback;
  }
  observe = mockObserve;
  disconnect = mockDisconnect;
  unobserve = vi.fn();
}

beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
  mockObserve.mockClear();
  mockDisconnect.mockClear();
});

describe('StickyShowBar', () => {
  it('does not render when hero is visible (intersecting)', () => {
    const heroRef = createRef<HTMLDivElement>();
    const div = document.createElement('div');
    Object.defineProperty(heroRef, 'current', { value: div, writable: true });

    render(<StickyShowBar nextUp={makeClass()} heroRef={heroRef} />);

    // Simulate hero being visible
    act(() => {
      observerCallback(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver
      );
    });

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders when hero scrolls off-screen (not intersecting)', () => {
    const heroRef = createRef<HTMLDivElement>();
    const div = document.createElement('div');
    Object.defineProperty(heroRef, 'current', { value: div, writable: true });

    render(<StickyShowBar nextUp={makeClass()} heroRef={heroRef} />);

    act(() => {
      observerCallback(
        [{ isIntersecting: false } as IntersectionObserverEntry],
        {} as IntersectionObserver
      );
    });

    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('shows class name and estimated time', () => {
    const heroRef = createRef<HTMLDivElement>();
    const div = document.createElement('div');
    Object.defineProperty(heroRef, 'current', { value: div, writable: true });

    render(<StickyShowBar nextUp={makeClass()} heroRef={heroRef} />);

    act(() => {
      observerCallback(
        [{ isIntersecting: false } as IntersectionObserverEntry],
        {} as IntersectionObserver
      );
    });

    expect(screen.getByText('Container Novice')).toBeInTheDocument();
    expect(screen.getByText('~20m')).toBeInTheDocument();
  });

  it('does not render when nextUp is null', () => {
    const heroRef = createRef<HTMLDivElement>();
    const div = document.createElement('div');
    Object.defineProperty(heroRef, 'current', { value: div, writable: true });

    render(<StickyShowBar nextUp={null} heroRef={heroRef} />);

    act(() => {
      observerCallback(
        [{ isIntersecting: false } as IntersectionObserverEntry],
        {} as IntersectionObserver
      );
    });

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('calls onTap when clicked', async () => {
    const user = userEvent.setup();
    const heroRef = createRef<HTMLDivElement>();
    const div = document.createElement('div');
    Object.defineProperty(heroRef, 'current', { value: div, writable: true });
    const onTap = vi.fn();

    render(<StickyShowBar nextUp={makeClass()} heroRef={heroRef} onTap={onTap} />);

    act(() => {
      observerCallback(
        [{ isIntersecting: false } as IntersectionObserverEntry],
        {} as IntersectionObserver
      );
    });

    await user.click(screen.getByRole('button'));
    expect(onTap).toHaveBeenCalled();
  });

  it('scrolls to hero when clicked without onTap', async () => {
    const user = userEvent.setup();
    const heroRef = createRef<HTMLDivElement>();
    const div = document.createElement('div');
    div.scrollIntoView = vi.fn();
    Object.defineProperty(heroRef, 'current', { value: div, writable: true });

    render(<StickyShowBar nextUp={makeClass()} heroRef={heroRef} />);

    act(() => {
      observerCallback(
        [{ isIntersecting: false } as IntersectionObserverEntry],
        {} as IntersectionObserver
      );
    });

    await user.click(screen.getByRole('button'));
    expect(div.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth' });
  });

  it('has lg:hidden class for desktop hiding', () => {
    const heroRef = createRef<HTMLDivElement>();
    const div = document.createElement('div');
    Object.defineProperty(heroRef, 'current', { value: div, writable: true });

    render(<StickyShowBar nextUp={makeClass()} heroRef={heroRef} />);

    act(() => {
      observerCallback(
        [{ isIntersecting: false } as IntersectionObserverEntry],
        {} as IntersectionObserver
      );
    });

    expect(screen.getByRole('button').className).toContain('lg:hidden');
  });

  it('disconnects observer on unmount', () => {
    const heroRef = createRef<HTMLDivElement>();
    const div = document.createElement('div');
    Object.defineProperty(heroRef, 'current', { value: div, writable: true });

    const { unmount } = render(<StickyShowBar nextUp={makeClass()} heroRef={heroRef} />);
    unmount();
    expect(mockDisconnect).toHaveBeenCalled();
  });
});
