import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { ScreenshotExplainer } from '../ScreenshotExplainer';
import type { ExplainerStep, Shot } from '../lifecycleStories';

const shot: Shot = {
  src: '/landing/stages/j-04.png',
  alt: 'Judge scoresheet on a tablet',
  width: 768,
  height: 1024,
  shape: 'tablet',
};
const steps: ExplainerStep[] = [
  {
    x: 0,
    y: 0,
    w: 0,
    h: 0,
    caption: 'No signal at the venue',
    badge: { text: 'No signal', tone: 'amber' },
  },
  { x: 10, y: 20, w: 50, h: 10, caption: 'Time the search' },
  {
    x: 0,
    y: 0,
    w: 0,
    h: 0,
    caption: 'Back online, synced',
    badge: { text: 'Back online', tone: 'green' },
  },
];
let onScreen: ((e: Partial<IntersectionObserverEntry>[]) => void) | null = null;

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

describe('ScreenshotExplainer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'IntersectionObserver',
      vi.fn(function (this: unknown, cb: typeof onScreen) {
        onScreen = cb;
        return { observe: vi.fn(), unobserve: vi.fn(), disconnect: vi.fn() };
      })
    );
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const show = () => act(() => onScreen?.([{ isIntersecting: true }]));

  it('advances through the steps while on screen', () => {
    setReducedMotion(false);
    render(<ScreenshotExplainer shot={shot} steps={steps} intervalMs={1000} />);
    show();
    expect(screen.getByText('No signal at the venue')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByText('Time the search')).toBeInTheDocument();
    expect(screen.getByText('2 of 3')).toBeInTheDocument();
  });

  it('does not advance while off screen', () => {
    setReducedMotion(false);
    render(<ScreenshotExplainer shot={shot} steps={steps} intervalMs={1000} />);
    act(() => vi.advanceTimersByTime(5000));
    expect(screen.getByText('1 of 3')).toBeInTheDocument();
  });

  it('pauses while the tab is hidden and resumes when it returns', () => {
    setReducedMotion(false);
    let state: DocumentVisibilityState = 'visible';
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => state);
    const setTab = (next: DocumentVisibilityState) =>
      act(() => {
        state = next;
        document.dispatchEvent(new Event('visibilitychange'));
      });
    render(<ScreenshotExplainer shot={shot} steps={steps} intervalMs={1000} />);
    show();
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByText('2 of 3')).toBeInTheDocument();
    setTab('hidden');
    act(() => vi.advanceTimersByTime(5000));
    expect(screen.getByText('2 of 3')).toBeInTheDocument();
    setTab('visible');
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByText('3 of 3')).toBeInTheDocument();
  });

  it('stops on Pause and steps on Next', () => {
    setReducedMotion(false);
    render(<ScreenshotExplainer shot={shot} steps={steps} intervalMs={1000} />);
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    act(() => vi.advanceTimersByTime(5000));
    expect(screen.getByText('1 of 3')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Time the search')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
  });

  it('starts paused under reduced motion', () => {
    setReducedMotion(true);
    render(<ScreenshotExplainer shot={shot} steps={steps} intervalMs={1000} />);
    show();
    act(() => vi.advanceTimersByTime(5000));
    expect(screen.getByText('1 of 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
  });

  it('announces captions only when paused', () => {
    setReducedMotion(false);
    render(<ScreenshotExplainer shot={shot} steps={steps} intervalMs={1000} />);
    show();
    const caption = screen.getByText('No signal at the venue');
    expect(caption).toHaveAttribute('aria-live', 'off');
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(caption).toHaveAttribute('aria-live', 'polite');
  });

  it('shows exactly one highlight at a time, by opacity', () => {
    setReducedMotion(false);
    const { container } = render(
      <ScreenshotExplainer shot={shot} steps={steps} intervalMs={1000} />
    );
    const boxes = container.querySelectorAll('[data-explainer-box]');
    expect(boxes).toHaveLength(3);
    expect(Array.from(boxes).filter(b => b.getAttribute('data-active') === 'true')).toHaveLength(1);
  });

  it('renders the image with dimensions and lazy loading', () => {
    setReducedMotion(false);
    render(<ScreenshotExplainer shot={shot} steps={steps} />);
    const img = screen.getByRole('img', { name: shot.alt });
    expect(img).toHaveAttribute('loading', 'lazy');
    expect(img).toHaveAttribute('width', '768');
  });
});
