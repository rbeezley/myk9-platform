import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { LifecycleTimeline } from '../LifecycleTimeline';
import { BANNED_COPY, SCENE_LINES, STORIES } from '../lifecycleStories';
import { firstFrameOfLine } from '../sceneFrames';
import { RING_SCENE } from '../scenes/ringScene';
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
  it('is the judge’s tablet alone, with the plan’s five lines', () => {
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

  it('shows the whole tablet in every frame, with a ring inside the page', () => {
    for (const f of frames) {
      const { camera, ring, shot } = f.phone!;
      expect(phone!.shots[shot], shot).toBeDefined();
      expect(camera, shot).toEqual({ x: 0, y: 0, w: space.width, h: space.height });
      expect(ring, shot).toBeDefined();
      expect(ring!.x).toBeGreaterThanOrEqual(0);
      expect(ring!.y).toBeGreaterThanOrEqual(0);
      expect(ring!.x + ring!.w).toBeLessThanOrEqual(space.width);
      expect(ring!.y + ring!.h).toBeLessThanOrEqual(space.height);
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
    expect(container.querySelectorAll('.tl-scene')).toHaveLength(1);
    expect(screen.getByRole('button', { name: /The signal drops/ })).toBeInTheDocument();
  });

  it('plays on the exhibitor’s meanwhile side, where the judge’s still was', () => {
    const { container } = render(
      <LifecycleTimeline audience="exhibitor" onAudienceChange={vi.fn()} />
    );
    expect(sceneIn(container, 'lc-meanwhile')).not.toBeNull();
    expect(container.querySelectorAll('.tl-scene')).toHaveLength(1);
    const showday = STORIES.exhibitor.find(s => s.id === 'showday')!;
    expect(showday.meanwhileShot).toBeNull();
  });

  it('jumps to a line’s capture when the line is pressed', () => {
    const { container } = render(<LifecycleTimeline audience="club" onAudienceChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /The score is read back/ }));
    expect(container.querySelector('.tl-scene-shot[data-on="true"]')).toHaveAttribute(
      'data-shot',
      'confirm'
    );
  });
});
