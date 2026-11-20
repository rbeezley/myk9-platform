import { act, fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { TimelineScene } from '../TimelineScene';
import { SCENE_LINES } from '../lifecycleStories';
import type { TimelineSceneData } from '../sceneFrames';
import { STAND_IN_ENTRIES_SCENE as scene } from './sceneStandIn';

let onScreen: ((e: Partial<IntersectionObserverEntry>[]) => void) | null = null;

const setReducedMotion = (reduce: boolean) =>
  vi.spyOn(window, 'matchMedia').mockImplementation(
    q =>
      ({
        matches: reduce && (q ?? '').includes('reduce'),
        media: q,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }) as MediaQueryList
  );

const lines = () => within(screen.getByRole('list')).getAllByRole('button');
const currentLine = () => lines().findIndex(b => b.getAttribute('aria-current') === 'step');
const shotOn = (kind: 'desk' | 'phone') =>
  document
    .querySelector(`.tl-scene-frame[data-kind="${kind}"] img[data-on="true"]`)
    ?.getAttribute('data-shot');
const show = () => act(() => onScreen?.([{ isIntersecting: true }]));
const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms));

describe('TimelineScene', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setReducedMotion(false);
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

  it('is complete at rest: the first frame shows both devices and every real line', () => {
    render(<TimelineScene scene={scene} lead="desk" />);
    expect(lines().map(b => b.textContent)).toEqual(
      SCENE_LINES.entries.map((l, i) => `${i + 1}\u2713${l.head}${l.text}`)
    );
    expect(currentLine()).toBe(0);
    expect(shotOn('desk')).toBe('before');
    expect(shotOn('phone')).toBe('dogs');
    expect(screen.getAllByRole('img')).toHaveLength(2);
  });

  it("aims each device's camera and ring at the frame, in percentages", () => {
    render(<TimelineScene scene={scene} lead="desk" />);
    const phoneShot = document.querySelector<HTMLElement>(
      '.tl-scene-frame[data-kind="phone"] img[data-shot="dogs"]'
    )!;
    // Camera {15, 204, 360, 640} on a 390x844 page.
    expect(phoneShot.style.width).toBe('108.333%');
    expect(phoneShot.style.left).toBe('-4.167%');
    expect(phoneShot.style.top).toBe('-31.875%');
    const ring = document.querySelector<HTMLElement>(
      '.tl-scene-frame[data-kind="phone"] .tl-scene-ring'
    )!;
    expect(ring).toHaveAttribute('data-on', 'true');
    expect(ring.style.width).toBe('95%');
  });

  it('hides the captures that are not showing from assistive technology', () => {
    render(<TimelineScene scene={scene} lead="desk" />);
    const hidden = document.querySelectorAll('.tl-scene-shot[aria-hidden="true"]');
    expect(hidden).toHaveLength(4);
  });

  it('plays itself only while in view', () => {
    render(<TimelineScene scene={scene} lead="desk" />);
    advance(20000);
    expect(currentLine()).toBe(0);
    show();
    advance(4000);
    expect(currentLine()).toBe(1);
    expect(shotOn('desk')).toBe('before');
    act(() => onScreen?.([{ isIntersecting: false }]));
    advance(20000);
    expect(currentLine()).toBe(1);
  });

  it('does not play while the tab is hidden', () => {
    let state: DocumentVisibilityState = 'visible';
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => state);
    render(<TimelineScene scene={scene} lead="desk" />);
    show();
    act(() => {
      state = 'hidden';
      document.dispatchEvent(new Event('visibilitychange'));
    });
    advance(20000);
    expect(currentLine()).toBe(0);
    act(() => {
      state = 'visible';
      document.dispatchEvent(new Event('visibilitychange'));
    });
    advance(4000);
    expect(currentLine()).toBe(1);
  });

  it('pauses, announces where it paused, and plays again', async () => {
    render(<TimelineScene scene={scene} lead="desk" />);
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    advance(30000);
    expect(currentLine()).toBe(0);
    expect(screen.getByRole('status')).toHaveTextContent('Paused on line 1 of 5');
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    advance(4000);
    expect(currentLine()).toBe(1);
  });

  it('jumps to a line when its number is pressed, and the circles reflect it', () => {
    render(<TimelineScene scene={scene} lead="desk" />);
    show();
    fireEvent.click(lines()[3]!);
    expect(currentLine()).toBe(3);
    expect(shotOn('desk')).toBe('review');
    expect(lines().map(b => b.getAttribute('data-done'))).toEqual([
      'true',
      'true',
      'true',
      'false',
      'false',
    ]);
    // Still playing from there.
    advance(4200);
    expect(currentLine()).toBe(4);
  });

  it('loops from the last frame back to the first', () => {
    render(<TimelineScene scene={scene} lead="desk" />);
    show();
    advance(4000 + 3000 + 3800 + 4200 + 3400 + 4600);
    expect(currentLine()).toBe(0);
  });

  it('draws the current circle as time passes', () => {
    render(<TimelineScene scene={scene} lead="desk" />);
    show();
    advance(2000);
    const prog = lines()[0]!.querySelector<SVGCircleElement>('.tl-scene-prog')!;
    expect(prog.style.strokeDashoffset).toBe('50');
  });

  it('is operable from the keyboard', async () => {
    vi.useRealTimers();
    const user = userEvent.setup();
    render(<TimelineScene scene={scene} lead="desk" />);
    show();
    await user.tab();
    expect(lines()[0]).toHaveFocus();
    await user.tab();
    await user.keyboard('{Enter}');
    expect(currentLine()).toBe(1);
    await user.tab();
    await user.tab();
    await user.tab();
    await user.tab();
    const pause = screen.getByRole('button', { name: 'Pause' });
    expect(pause).toHaveFocus();
    await user.keyboard(' ');
    expect(screen.getByRole('button', { name: 'Play' })).toHaveFocus();
  });

  it('marks the lead device for the audience, desk for clubs and phone for exhibitors', () => {
    const { rerender } = render(<TimelineScene scene={scene} lead="desk" />);
    expect(document.querySelector('.tl-scene')).toHaveAttribute('data-lead', 'desk');
    rerender(<TimelineScene scene={scene} lead="phone" />);
    expect(document.querySelector('.tl-scene')).toHaveAttribute('data-lead', 'phone');
  });

  it('dims the device that is not the subject of the frame', () => {
    render(<TimelineScene scene={scene} lead="desk" />);
    const dim = (k: string) =>
      document.querySelector(`.tl-scene-device[data-kind="${k}"]`)?.getAttribute('data-dim');
    expect([dim('desk'), dim('phone')]).toEqual(['true', 'false']);
    fireEvent.click(lines()[3]!);
    expect([dim('desk'), dim('phone')]).toEqual(['false', 'true']);
  });

  describe('reduced motion', () => {
    beforeEach(() => {
      setReducedMotion(true);
    });

    it('shows the finished frame, offers no Pause, and does not move', () => {
      render(<TimelineScene scene={scene} lead="desk" />);
      show();
      advance(60000);
      expect(currentLine()).toBe(4);
      expect(shotOn('desk')).toBe('accepted');
      expect(shotOn('phone')).toBe('accepted');
      expect(screen.queryByRole('button', { name: /Pause|Play/ })).not.toBeInTheDocument();
    });

    it("shows the line's last frame when a line is pressed", () => {
      render(<TimelineScene scene={scene} lead="desk" />);
      fireEvent.click(lines()[2]!);
      expect(currentLine()).toBe(2);
      expect(shotOn('phone')).toBe('pending');
      advance(60000);
      expect(currentLine()).toBe(2);
    });
  });

  describe('step-through mode', () => {
    it('does not advance by itself, in view or not', () => {
      render(<TimelineScene scene={scene} lead="desk" mode="step" />);
      show();
      advance(120000);
      expect(currentLine()).toBe(0);
      expect(screen.queryByRole('button', { name: /Pause|Play/ })).not.toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveTextContent('Step 1 of 5');
    });

    it('moves one numbered line with Next and Back, and stops at the ends', () => {
      render(<TimelineScene scene={scene} lead="desk" mode="step" />);
      show();
      const next = screen.getByRole('button', { name: 'Next' });
      const back = screen.getByRole('button', { name: 'Back' });
      expect(back).toHaveAttribute('aria-disabled', 'true');
      fireEvent.click(back);
      expect(currentLine()).toBe(0);
      fireEvent.click(next);
      expect(currentLine()).toBe(1);
      advance(120000);
      expect(currentLine()).toBe(1);
      fireEvent.click(back);
      expect(currentLine()).toBe(0);
      for (let i = 0; i < 10; i++) fireEvent.click(next);
      expect(currentLine()).toBe(4);
      expect(next).toHaveAttribute('aria-disabled', 'true');
      expect(screen.getByRole('status')).toHaveTextContent('Step 5 of 5');
    });

    it('plays a line with several frames through to its end, then waits', () => {
      render(<TimelineScene scene={scene} lead="desk" mode="step" />);
      show();
      fireEvent.click(lines()[3]!);
      fireEvent.click(screen.getByRole('button', { name: 'Next' }));
      // Line 5 owns two frames: the form under review, then accepted.
      expect(currentLine()).toBe(4);
      expect(shotOn('desk')).toBe('review');
      advance(3400);
      expect(shotOn('desk')).toBe('accepted');
      advance(120000);
      expect(currentLine()).toBe(4);
      expect(shotOn('desk')).toBe('accepted');
      // Back replays the line before from its start.
      fireEvent.click(screen.getByRole('button', { name: 'Back' }));
      expect(currentLine()).toBe(3);
      expect(shotOn('desk')).toBe('review');
    });

    it('jumps to a pressed line and stays there', () => {
      render(<TimelineScene scene={scene} lead="desk" mode="step" />);
      show();
      fireEvent.click(lines()[2]!);
      advance(120000);
      expect(currentLine()).toBe(2);
    });

    it("shows the reduced-motion reader each line's finished frame, with no play-through", () => {
      setReducedMotion(true);
      render(<TimelineScene scene={scene} lead="desk" mode="step" />);
      show();
      expect(currentLine()).toBe(0);
      fireEvent.click(screen.getByRole('button', { name: 'Next' }));
      expect(currentLine()).toBe(1);
      fireEvent.click(lines()[3]!);
      fireEvent.click(screen.getByRole('button', { name: 'Next' }));
      expect(currentLine()).toBe(4);
      expect(shotOn('desk')).toBe('accepted');
    });
  });

  describe('one device', () => {
    const solo: TimelineSceneData = {
      id: scene.id,
      name: scene.name,
      lines: scene.lines,
      frames: scene.frames,
      phone: scene.phone,
    };

    it('shows the one device alone and never dims it', () => {
      render(<TimelineScene scene={solo} lead="phone" />);
      expect(document.querySelector('.tl-scene')).toHaveAttribute('data-solo', 'true');
      const devices = document.querySelectorAll('.tl-scene-device');
      expect(devices).toHaveLength(1);
      expect(devices[0]).toHaveAttribute('data-kind', 'phone');
      // Line 4's frame is about the desk, which this scene does not have.
      fireEvent.click(lines()[3]!);
      expect(devices[0]).toHaveAttribute('data-dim', 'false');
      expect(screen.getAllByRole('img')).toHaveLength(1);
    });

    it('does not mark a two-device scene as solo', () => {
      render(<TimelineScene scene={scene} lead="desk" />);
      expect(document.querySelector('.tl-scene')).not.toHaveAttribute('data-solo');
    });
  });

  it('renders nothing for a scene with no frames', () => {
    const { container } = render(<TimelineScene scene={{ ...scene, frames: [] }} lead="desk" />);
    expect(container).toBeEmptyDOMElement();
  });
});
