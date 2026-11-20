import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { LifecycleTimeline } from '../LifecycleTimeline';
import { BANNED_COPY, SCENE_LINES, STORIES } from '../lifecycleStories';
import { firstFrameOfLine, lastFrameOfLine, unionRegion, windowOnRing } from '../sceneFrames';
import { RING_SCENE, RING_WINDOW_HEIGHT } from '../scenes/ringScene';
import regions from '../scenes/ringRegions.json';

vi.mock('../useTimelineProgress', () => ({
  useTimelineProgress: () => ({ reached: 4, isRevealed: () => true }),
}));

const publicDir = resolve(process.cwd(), 'public');
const { frames, phone } = RING_SCENE;
const space = phone!.space;

/** Width and height from a PNG's IHDR chunk. */
function pngSize(file: string) {
  const header = readFileSync(file).subarray(16, 24);
  return { width: header.readUInt32BE(0), height: header.readUInt32BE(4) };
}

describe('the ring scene', () => {
  it('is the judge’s phone alone, with the plan’s five lines', () => {
    expect(phone!.label).toBe('The judge’s phone');
    expect(space).toEqual({ width: 390, height: 844 });
    expect(regions.scale).toBe(2);
    for (const shot of Object.values(phone!.shots)) expect(shot.alt).not.toMatch(/tablet/i);
    expect(RING_SCENE.desk).toBeUndefined();
    expect(RING_SCENE.lines).toBe(SCENE_LINES['showday-ring']);
    expect(RING_SCENE.lines).toHaveLength(5);
  });

  it('gives every line at least one frame, in order', () => {
    const lines = frames.map(f => f.line);
    expect([...lines].sort((a, b) => a - b)).toEqual(lines);
    expect(new Set(lines)).toEqual(new Set([0, 1, 2, 3, 4]));
  });

  it('shows the offline header before any score is saved offline', () => {
    // After the first offline score the header reads "1 score not sent yet" (evidence Ring2).
    const offline = firstFrameOfLine(frames, 1);
    expect(frames[offline]!.phone!.shot).toBe('offline');
    expect(offline).toBeLessThan(frames.findIndex(f => f.phone!.shot === 'saved'));
  });

  it('rests every line on the capture its heading names, which is what reduced motion shows', () => {
    // Under reduced motion a line shows its last frame and nothing else (sceneState.ts).
    const resting = RING_SCENE.lines.map((line, i) => [
      line.head,
      frames[lastFrameOfLine(frames, i)]!.phone!.shot,
    ]);
    expect(resting).toEqual([
      ['The judge opens the ring’s classes', 'classes'],
      ['The signal drops', 'offline'],
      ['The judge times and scores the run', 'result'],
      ['The score is read back before it saves', 'confirm'],
      ['The signal returns', 'sent'],
    ]);
    // Two frames show `sent`; the one the last line rests on rings the Scores sent message.
    expect(frames[lastFrameOfLine(frames, 4)]!.phone!.ring).toEqual(
      regions.shots.sent.regions.toast
    );
  });

  it('rings the whole class card on the first line', () => {
    // The capture measures the card and, separately, its tap row (the class name and judge).
    // The whole card starts where the row starts and goes on below it, to the status line and
    // the card's controls; a ring on the row alone is the defect this replaced.
    const { card, row } = regions.shots.classes.regions;
    expect(frames[0]!.phone!.ring).toEqual(card);
    expect(card.x).toBeLessThanOrEqual(row.x);
    expect(card.x + card.w).toBeGreaterThanOrEqual(row.x + row.w);
    expect(card.y).toBeLessThanOrEqual(row.y);
    expect(card.y + card.h).toBeGreaterThanOrEqual(row.y + row.h + 40);
  });

  it('keeps the stopped time in view on the frame that rings the result', () => {
    const { timer, result } = regions.shots.result.regions;
    const view = frames.find(f => f.phone!.shot === 'result')!.phone!;
    expect(view.ring).toEqual(result);
    expect(view.camera).toEqual(
      windowOnRing(space, unionRegion(result, timer), RING_WINDOW_HEIGHT)
    );
    expect(timer.y).toBeGreaterThanOrEqual(view.camera.y);
    expect(timer.y + timer.h).toBeLessThanOrEqual(view.camera.y + view.camera.h);
    expect(unionRegion({ x: 10, y: 20, w: 30, h: 40 }, { x: 0, y: 50, w: 100, h: 50 })).toEqual({
      x: 0,
      y: 20,
      w: 100,
      h: 80,
    });
  });

  it('places a window by one rule: full width, inside the page, centred on the ring', () => {
    const page = { width: 390, height: 844 };
    // In the middle of the page the ring is centred.
    expect(windowOnRing(page, { x: 34, y: 338, w: 322, h: 189 }, 520)).toEqual({
      x: 0,
      y: 173,
      w: 390,
      h: 520,
    });
    // Near the top or the bottom the window stops at the page's edge.
    expect(windowOnRing(page, { x: 25, y: 157, w: 188, h: 58 }, 520).y).toBe(0);
    expect(windowOnRing(page, { x: 16, y: 775, w: 358, h: 54 }, 520).y).toBe(324);
    // A window taller than the page is the whole page.
    expect(windowOnRing(page, { x: 0, y: 400, w: 10, h: 10 }, 2000)).toEqual({
      x: 0,
      y: 0,
      w: 390,
      h: 844,
    });
  });

  it('shows every frame at the phone’s full width in a 3:4 window that holds its ring', () => {
    expect(RING_WINDOW_HEIGHT).toBe(520);
    for (const f of frames) {
      const { camera, ring, shot } = f.phone!;
      expect(phone!.shots[shot], shot).toBeDefined();
      expect(ring, shot).toBeDefined();
      // No zoom and no hand-picked camera: the window is what the rule gives for the ring, or
      // on the one frame about two things, for the ring and the stopped timer (tested above).
      if (shot !== 'result') {
        expect(camera, shot).toEqual(windowOnRing(space, ring!, RING_WINDOW_HEIGHT));
      }
      expect(camera.x, shot).toBe(0);
      expect(camera.h, shot).toBe(RING_WINDOW_HEIGHT);
      expect(camera.w, shot).toBe(space.width);
      expect(camera.y, shot).toBeGreaterThanOrEqual(0);
      expect(camera.y + camera.h, shot).toBeLessThanOrEqual(space.height);
      // The whole ring is inside the window, so nothing a line points at is cut off.
      expect(ring!.x, shot).toBeGreaterThanOrEqual(0);
      expect(ring!.x + ring!.w, shot).toBeLessThanOrEqual(space.width);
      expect(ring!.y, shot).toBeGreaterThanOrEqual(camera.y);
      expect(ring!.y + ring!.h, shot).toBeLessThanOrEqual(camera.y + camera.h);
    }
  });

  it('uses every capture, and each file is on disk at the size the data states', () => {
    const used = new Set(frames.map(f => f.phone!.shot));
    expect(used).toEqual(new Set(Object.keys(regions.shots)));
    for (const [name, shot] of Object.entries(phone!.shots)) {
      const file = resolve(publicDir, shot.src.slice(1));
      expect(existsSync(file), name).toBe(true);
      expect(pngSize(file), name).toEqual({ width: shot.width, height: shot.height });
      expect(shot.width / space.width).toBe(regions.scale);
    }
  });

  it('describes every capture, within the copy rules', () => {
    for (const shot of Object.values(phone!.shots)) {
      expect(shot.alt.length).toBeGreaterThan(20);
      for (const banned of BANNED_COPY) expect(shot.alt).not.toMatch(banned);
    }
  });
});

describe('the ring scene on the page', () => {
  const sceneIn = (container: HTMLElement, side: string) =>
    container.querySelector(`#showday .${side} .tl-scene`);

  it('plays on the club’s show-day step, above the practice scoresheet', () => {
    const { container } = render(<LifecycleTimeline audience="club" onAudienceChange={vi.fn()} />);
    const scene = sceneIn(container, 'lc-main');
    expect(scene).not.toBeNull();
    expect(scene).toHaveAttribute('data-solo', 'true');
    const demo = container.querySelector('#showday .lc-demo');
    expect(demo).not.toBeNull();
    expect(scene!.compareDocumentPosition(demo!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // The Entries open scene plays on the step above it; the ring scene is the one that is solo.
    expect(container.querySelectorAll('.tl-scene')).toHaveLength(2);
    expect(container.querySelectorAll('.tl-scene[data-solo="true"]')).toHaveLength(1);
    expect(screen.getByRole('button', { name: /The signal drops/ })).toBeInTheDocument();
  });

  it('plays on the exhibitor’s meanwhile side, where the judge’s still was', () => {
    const { container } = render(
      <LifecycleTimeline audience="exhibitor" onAudienceChange={vi.fn()} />
    );
    expect(sceneIn(container, 'lc-meanwhile')).not.toBeNull();
    // Plus the Entries open scene, on its own step's main side.
    expect(container.querySelectorAll('.tl-scene')).toHaveLength(2);
    const showday = STORIES.exhibitor.find(s => s.id === 'showday')!;
    expect(showday).not.toHaveProperty('meanwhileShot');
  });

  it('renders no screenshot on the meanwhile side of any step, in either story (MYK9-2295)', () => {
    for (const audience of ['club', 'exhibitor'] as const) {
      const { container, unmount } = render(
        <LifecycleTimeline audience={audience} onAudienceChange={vi.fn()} />
      );
      expect(container.querySelectorAll('.lc-meanwhile')).toHaveLength(6);
      expect(container.querySelectorAll('.lc-meanwhile img:not(.tl-scene img)')).toHaveLength(0);
      unmount();
    }
  });

  it('jumps to a line’s capture when the line is pressed', () => {
    const { container } = render(<LifecycleTimeline audience="club" onAudienceChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /The score is read back/ }));
    expect(container.querySelector('#showday .tl-scene-shot[data-on="true"]')).toHaveAttribute(
      'data-shot',
      'confirm'
    );
  });
});
