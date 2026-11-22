import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { LifecycleTimeline } from '../LifecycleTimeline';
import { BANNED_COPY, SCENE_LINES, STORIES } from '../lifecycleStories';
import { lastFrameOfLine, wholeScreen, zoomOnRing } from '../sceneFrames';
import type { DeviceView, Region } from '../sceneFrames';
import { DESK_CAMERA_WIDTH } from '../scenes/entriesScene';
import { RESULTS_SCENE } from '../scenes/resultsScene';
import { SCENES } from '../scenes';
import regions from '../scenes/resultsRegions.json';

vi.mock('../useTimelineProgress', () => ({
  useTimelineProgress: () => ({ isRevealed: () => true }),
}));

const publicDir = resolve(process.cwd(), 'public');
const { frames, desk, phone } = RESULTS_SCENE;
const deskSpace = desk!.space;
const phoneSpace = phone!.space;

/** Width and height from a PNG's IHDR chunk. */
function pngSize(file: string) {
  const header = readFileSync(file).subarray(16, 24);
  return { width: header.readUInt32BE(0), height: header.readUInt32BE(4) };
}

const inside = (inner: Region, outer: Region) =>
  inner.x >= outer.x &&
  inner.y >= outer.y &&
  inner.x + inner.w <= outer.x + outer.w &&
  inner.y + inner.h <= outer.y + outer.h;

afterEach(() => {
  vi.restoreAllMocks();
});

const PHONE_BEFORE_ALT = phone!.shots.before!.alt;

describe('the Results scene', () => {
  it('is the secretary’s desktop and the exhibitor’s phone, on the plan’s four lines', () => {
    expect(RESULTS_SCENE.name).toBe('Results walkthrough');
    expect(SCENES.results).toBe(RESULTS_SCENE);
    expect(desk!.label).toBe('The secretary’s screen');
    expect(phone!.label).toBe('The exhibitor’s phone');
    expect(deskSpace).toEqual({ width: 1440, height: 900 });
    expect(phoneSpace).toEqual({ width: 390, height: 844 });
    expect(regions.desk.scale).toBe(1);
    expect(regions.phone.scale).toBe(2);
    expect(RESULTS_SCENE.lines).toBe(SCENE_LINES.results);
    expect(RESULTS_SCENE.lines).toHaveLength(4);
  });

  it('gives every line at least one frame, in order, and both devices a view in every frame', () => {
    const lines = frames.map(f => f.line);
    expect([...lines].sort((a, b) => a - b)).toEqual(lines);
    expect(new Set(lines)).toEqual(new Set([0, 1, 2, 3]));
    for (const f of frames) {
      expect(f.desk, `line ${f.line + 1}`).toBeDefined();
      expect(f.phone, `line ${f.line + 1}`).toBeDefined();
    }
  });

  it('puts the desk first for the club’s three lines and the phone first for the exhibitor’s one', () => {
    expect(frames.map(f => [f.line, f.subject])).toEqual([
      [0, 'desk'],
      [1, 'desk'],
      [2, 'desk'],
      [2, 'desk'],
      [3, 'phone'],
      [3, 'phone'],
    ]);
  });

  it('rings only the subject, and the ring is whole inside the camera', () => {
    for (const f of frames) {
      const views: [string, DeviceView, boolean][] = [
        ['desk', f.desk!, f.subject !== 'phone'],
        ['phone', f.phone!, f.subject !== 'desk'],
      ];
      for (const [kind, view, isSubject] of views) {
        const where = `line ${f.line + 1}, ${kind}, ${view.shot}`;
        if (!isSubject) {
          expect(view.ring, where).toBeUndefined();
        } else {
          expect(view.ring, where).toBeDefined();
          expect(inside(view.ring!, view.camera), where).toBe(true);
        }
      }
    }
  });

  it('shows the whole phone screen and the desk in a 5:3 camera placed on its ring', () => {
    for (const f of frames) {
      expect(f.phone!.camera).toEqual(wholeScreen(phoneSpace));
    }
    for (const f of frames) {
      const { camera, ring } = f.desk!;
      expect(camera.x).toBeGreaterThanOrEqual(0);
      expect(camera.y).toBeGreaterThanOrEqual(0);
      expect(camera.x + camera.w).toBeLessThanOrEqual(deskSpace.width);
      expect(camera.y + camera.h).toBeLessThanOrEqual(deskSpace.height);
      expect(camera.w).toBeGreaterThanOrEqual(DESK_CAMERA_WIDTH);
      // 5:3, within the rounding of whole pixels.
      expect(Math.abs(camera.w * 3 - camera.h * 5)).toBeLessThanOrEqual(5);
      if (ring) expect(inside(ring, camera)).toBe(true);
    }
  });

  it('rests every line on the capture its heading names, which is what reduced motion shows', () => {
    // Under reduced motion a line shows its last frame and nothing else (sceneState.ts).
    const at = (line: number) => frames[lastFrameOfLine(frames, line)]!;
    expect(RESULTS_SCENE.lines.map(line => line.head)).toEqual([
      'A finished class is waiting for you',
      'The placements are worked out',
      'You release the results',
      'The exhibitor sees it on their phone',
    ]);
    // 1: the Results tab, ringing what to do next on the waiting class.
    expect(at(0).desk!.shot).toBe('list');
    expect(at(0).desk!.ring).toEqual(regions.desk.shots.list.regions.action);
    // 2: the open class, ringing the table with the placements.
    expect(at(1).desk!.shot).toBe('class');
    expect(at(1).desk!.ring).toEqual(regions.desk.shots.class.regions.table);
    // 3: the class reading Released, ringing its chips.
    expect(at(2).desk!.shot).toBe('released');
    expect(at(2).desk!.ring).toEqual(regions.desk.shots.released.regions.chips);
    // 4: the exhibitor's result card, ringing the card; the desk rests on the released class.
    expect(at(3).phone!.shot).toBe('card');
    expect(at(3).phone!.ring).toEqual(regions.phone.shots.card.regions.card);
    expect(at(3).desk!.shot).toBe('released');
  });

  it('shows the Release results button on its own frame, with the card it sits in kept in view', () => {
    const view = frames.find(f => f.desk!.shot === 'release')!.desk!;
    const { button, card } = regions.desk.shots.release.regions;
    expect(view.ring).toEqual(button);
    expect(inside(button, card)).toBe(true);
    expect(inside(card, view.camera)).toBe(true);
    expect(view.camera).toEqual(zoomOnRing(deskSpace, card, DESK_CAMERA_WIDTH));
    // Pressing it comes before the class reads Released.
    const order = frames.map(f => f.desk!.shot);
    expect(order.indexOf('release')).toBeLessThan(order.indexOf('released'));
  });

  it('shows New result on the phone before the card it opens', () => {
    const order = frames.map(f => f.phone!.shot);
    expect(order.indexOf('new')).toBeLessThan(order.indexOf('card'));
    // Before the release the phone rests on My Entries without it, and without a ring.
    for (const f of frames.filter(f => f.line < 3)) {
      expect(f.phone!.shot).toBe('before');
      expect(f.phone!.ring).toBeUndefined();
    }
  });

  it('uses every capture, and each file is on disk at the size the data states', () => {
    const used = new Set(frames.flatMap(f => [`desk:${f.desk!.shot}`, `phone:${f.phone!.shot}`]));
    expect(used).toEqual(
      new Set([
        ...Object.keys(regions.desk.shots).map(name => `desk:${name}`),
        ...Object.keys(regions.phone.shots).map(name => `phone:${name}`),
      ])
    );
    for (const [kind, data, scale, space] of [
      ['desk', desk!, regions.desk.scale, deskSpace],
      ['phone', phone!, regions.phone.scale, phoneSpace],
    ] as const) {
      for (const [name, shot] of Object.entries(data.shots)) {
        const file = resolve(publicDir, shot.src.slice(1));
        expect(existsSync(file), `${kind} ${name}`).toBe(true);
        expect(pngSize(file), `${kind} ${name}`).toEqual({
          width: shot.width,
          height: shot.height,
        });
        expect(shot.width / space.width).toBe(scale);
      }
    }
  });

  it('is staged with results held until the release, so the phone shows no result before it', () => {
    const setup = readFileSync(
      resolve(process.cwd(), 'src/test/e2e/capture/landingResultsSetup.sql'),
      'utf8'
    );
    expect(setup).toMatch(/SET preset = 'review', placement_timing = 'manual_release'/);
    expect(PHONE_BEFORE_ALT).not.toMatch(/Qualified|preliminary|\d:\d\d/);
    // The released frame's camera holds the header and chips and stops above what follows them.
    const view = frames.find(f => f.desk!.shot === 'released')!.desk!;
    const { header } = regions.desk.shots.released.regions;
    expect(inside(header, view.camera)).toBe(true);
  });

  it('describes every capture, within the copy rules', () => {
    for (const data of [desk!, phone!]) {
      for (const shot of Object.values(data.shots)) {
        expect(shot.alt.length).toBeGreaterThan(20);
        for (const banned of BANNED_COPY) expect(shot.alt).not.toMatch(banned);
        expect(shot.alt).not.toMatch(/—/);
      }
    }
  });

  it('says only what the screens hold: no waitlist, no "one click" release of several classes', () => {
    const texts = [
      ...Object.values(desk!.shots).map(shot => shot.alt),
      ...Object.values(phone!.shots).map(shot => shot.alt),
      ...RESULTS_SCENE.lines.map(line => `${line.head}. ${line.text}`),
    ];
    const words = texts.join(' ');
    expect(words).not.toMatch(/waitlist/i);
    // The scene shows one class released, never the multi-select (owner, 2026-11-16).
    expect(words).not.toMatch(/classes at once|release (all|every|several|many)|tick/i);
  });
});

const shotsOf = (card: Element) =>
  Object.fromEntries(
    [...card.querySelectorAll('.tl-scene-frame')].map(frame => [
      frame.getAttribute('data-kind'),
      frame.querySelector('.tl-scene-shot[data-on="true"]')?.getAttribute('data-shot'),
    ])
  );

const reduceMotion = () =>
  vi.spyOn(window, 'matchMedia').mockImplementation(
    query =>
      ({
        matches: query.includes('reduce'),
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }) as MediaQueryList
  );

describe('the Results scene on the page', () => {
  const resultsStep = (container: HTMLElement) => container.querySelector('#results')!;

  it('replaces the club’s still, with the desk leading', () => {
    const { container } = render(<LifecycleTimeline audience="club" onAudienceChange={vi.fn()} />);
    const step = resultsStep(container);
    const scene = step.querySelector('.lc-scene[data-side="main"] .tl-scene');
    expect(scene).not.toBeNull();
    expect(scene).toHaveAttribute('data-lead', 'desk');
    expect(scene).not.toHaveAttribute('data-solo');
    expect(step.querySelectorAll('.lc-shot, figure')).toHaveLength(0);
    expect(STORIES.club.find(s => s.id === 'results')!.shot).toBeNull();
  });

  // MYK9-2334: "After the show" folded into Results, so the exhibitor's dog record sits beside
  // the words and the scene, phone leading, plays below it.
  it('plays with the phone leading for exhibitors, below the dog-record still', () => {
    const { container } = render(
      <LifecycleTimeline audience="exhibitor" onAudienceChange={vi.fn()} />
    );
    const step = resultsStep(container);
    const scene = step.querySelector('.lc-scene[data-side="main"] .tl-scene');
    expect(scene).not.toBeNull();
    expect(scene).toHaveAttribute('data-lead', 'phone');
    const stills = step.querySelectorAll('.lc-media .lc-shot img');
    expect(stills).toHaveLength(1);
    expect(stills[0]).toHaveAttribute('src', '/landing/stills/exhibitor-past-results.png');
  });

  it('reads the same four lines in both stories', () => {
    const linesIn = (audience: 'club' | 'exhibitor') => {
      const { container, unmount } = render(
        <LifecycleTimeline audience={audience} onAudienceChange={vi.fn()} />
      );
      const group = within(resultsStep(container) as HTMLElement).getByRole('group', {
        name: 'Lines in this scene',
      });
      const text = within(group)
        .getAllByRole('button')
        .map(button => button.textContent);
      unmount();
      return text;
    };
    const club = linesIn('club');
    expect(club).toEqual(SCENE_LINES.results.map((line, i) => `${i + 1}${line.short}`));
    expect(linesIn('exhibitor')).toEqual(club);
  });

  it('jumps to a line’s capture when the line is pressed', () => {
    const { container } = render(<LifecycleTimeline audience="club" onAudienceChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Placements worked out/ }));
    const on = (kind: string) =>
      resultsStep(container)
        .querySelector(`.tl-scene-frame[data-kind="${kind}"] .tl-scene-shot[data-on="true"]`)
        ?.getAttribute('data-shot');
    expect(on('desk')).toBe('class');
    expect(on('phone')).toBe('before');
  });

  it('draws one storyboard card per line under reduced motion, on the frame its heading names', () => {
    reduceMotion();
    const { container } = render(<LifecycleTimeline audience="club" onAudienceChange={vi.fn()} />);
    const step = resultsStep(container);
    expect(within(step as HTMLElement).queryByRole('group')).toBeNull();
    const cards = [...step.querySelectorAll('.tl-scene-card')];
    // Each card shows the device its line is about: the secretary's three lines, then the phone.
    expect(cards.map(card => shotsOf(card))).toEqual([
      { desk: 'list' },
      { desk: 'class' },
      { desk: 'released' },
      { phone: 'card' },
    ]);
  });
});
