import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { LifecycleTimeline } from '../LifecycleTimeline';
import { BANNED_COPY, SCENE_LINES, STORIES } from '../lifecycleStories';
import { firstFrameOfLine, lastFrameOfLine, wholeScreen } from '../sceneFrames';
import { RING_SCENE } from '../scenes/ringScene';
import regions from '../scenes/ringRegions.json';

vi.mock('../useTimelineProgress', () => ({
  useTimelineProgress: () => ({ isRevealed: () => true }),
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

  it('shows every frame as the phone’s whole screen, with a whole ring on it', () => {
    for (const f of frames) {
      const { camera, ring, shot } = f.phone!;
      expect(phone!.shots[shot], shot).toBeDefined();
      expect(ring, shot).toBeDefined();
      // No zoom and no crop: the camera is the full 390x844 space.
      expect(camera, shot).toEqual(wholeScreen(space));
      expect(ring!.x, shot).toBeGreaterThanOrEqual(0);
      expect(ring!.x + ring!.w, shot).toBeLessThanOrEqual(space.width);
      expect(ring!.y, shot).toBeGreaterThanOrEqual(0);
      expect(ring!.y + ring!.h, shot).toBeLessThanOrEqual(space.height);
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
    container.querySelector(`#showday .lc-scene[data-side="${side}"] .tl-scene`);

  it('plays on the club’s show-day step, as a band under the practice scoresheet', () => {
    const { container } = render(<LifecycleTimeline audience="club" onAudienceChange={vi.fn()} />);
    const scene = sceneIn(container, 'main');
    expect(scene).not.toBeNull();
    expect(scene).toHaveAttribute('data-solo', 'true');
    const demo = container.querySelector('#showday .lc-demo');
    expect(demo).not.toBeNull();
    expect(demo!.compareDocumentPosition(scene!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(demo!.closest('.lc-main')).not.toBeNull();
    // The Entries open scene plays on the step above it and the Results scene on the step below;
    // the ring scene is the one that is solo.
    expect(container.querySelectorAll('.tl-scene')).toHaveLength(3);
    expect(container.querySelectorAll('.tl-scene[data-solo="true"]')).toHaveLength(1);
    expect(screen.getByRole('button', { name: /Signal drops/ })).toBeInTheDocument();
  });

  it('names each walkthrough so a screen reader can tell them apart', () => {
    render(<LifecycleTimeline audience="club" onAudienceChange={vi.fn()} />);
    const names = screen
      .getAllByRole('region', { name: /walkthrough/i })
      .map(r => r.getAttribute('aria-label'));
    expect(names).toEqual([
      'Entries walkthrough',
      'Show day ring walkthrough',
      'Results walkthrough',
    ]);
  });

  it('plays on the exhibitor’s meanwhile side, where the judge’s still was', () => {
    const { container } = render(
      <LifecycleTimeline audience="exhibitor" onAudienceChange={vi.fn()} />
    );
    expect(sceneIn(container, 'meanwhile')).not.toBeNull();
    // Plus the Entries open and Results scenes, each on its own step's main side.
    expect(container.querySelectorAll('.tl-scene')).toHaveLength(3);
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
    fireEvent.click(screen.getByRole('button', { name: /Reads it back/ }));
    expect(container.querySelector('#showday .tl-scene-shot[data-on="true"]')).toHaveAttribute(
      'data-shot',
      'confirm'
    );
  });
});
