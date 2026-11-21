import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { LifecycleTimeline } from '../LifecycleTimeline';
import { BANNED_COPY, SCENE_LINES, STORIES } from '../lifecycleStories';
import { lastFrameOfLine, windowOnRing, zoomOnRing } from '../sceneFrames';
import type { DeviceView, Region } from '../sceneFrames';
import { DESK_CAMERA_WIDTH, ENTRIES_SCENE, PHONE_WINDOW_HEIGHT } from '../scenes/entriesScene';
import regions from '../scenes/entriesRegions.json';

vi.mock('../useTimelineProgress', () => ({
  useTimelineProgress: () => ({ isRevealed: () => true }),
}));

const publicDir = resolve(process.cwd(), 'public');
const { frames, desk, phone } = ENTRIES_SCENE;
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

describe('the Entries open scene', () => {
  it('is the secretary’s desktop and the exhibitor’s phone, on the plan’s five lines', () => {
    expect(desk!.label).toBe('The secretary’s screen');
    expect(phone!.label).toBe('The exhibitor’s phone');
    expect(deskSpace).toEqual({ width: 1440, height: 900 });
    expect(phoneSpace).toEqual({ width: 390, height: 844 });
    expect(regions.desk.scale).toBe(1);
    expect(regions.phone.scale).toBe(2);
    expect(ENTRIES_SCENE.lines).toBe(SCENE_LINES.entries);
    expect(ENTRIES_SCENE.lines).toHaveLength(5);
  });

  it('gives every line at least one frame, in order, and both devices a view in every frame', () => {
    const lines = frames.map(f => f.line);
    expect([...lines].sort((a, b) => a - b)).toEqual(lines);
    expect(new Set(lines)).toEqual(new Set([0, 1, 2, 3, 4]));
    for (const f of frames) {
      expect(f.desk, `line ${f.line + 1}`).toBeDefined();
      expect(f.phone, `line ${f.line + 1}`).toBeDefined();
    }
  });

  it('puts the phone first for the exhibitor’s three lines and the desk first for the club’s two', () => {
    expect(frames.map(f => [f.line, f.subject])).toEqual([
      [0, 'phone'],
      [0, 'phone'],
      [1, 'phone'],
      [2, 'phone'],
      [3, 'desk'],
      [4, 'desk'],
      [4, 'both'],
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

  it('shows the phone in a 3:4 window and the desk in a 5:3 camera, each placed by one rule', () => {
    expect(PHONE_WINDOW_HEIGHT).toBe(520);
    for (const f of frames) {
      const { camera, ring } = f.phone!;
      expect(camera.x).toBe(0);
      expect(camera.w).toBe(phoneSpace.width);
      expect(camera.h).toBe(PHONE_WINDOW_HEIGHT);
      expect(camera.y).toBeGreaterThanOrEqual(0);
      expect(camera.y + camera.h).toBeLessThanOrEqual(phoneSpace.height);
      if (ring) expect(camera).toEqual(windowOnRing(phoneSpace, ring, PHONE_WINDOW_HEIGHT));
    }
    for (const f of frames) {
      const { camera } = f.desk!;
      expect(camera.x).toBeGreaterThanOrEqual(0);
      expect(camera.y).toBeGreaterThanOrEqual(0);
      expect(camera.x + camera.w).toBeLessThanOrEqual(deskSpace.width);
      expect(camera.y + camera.h).toBeLessThanOrEqual(deskSpace.height);
      expect(camera.w).toBeGreaterThanOrEqual(DESK_CAMERA_WIDTH);
      // 5:3, within the rounding of whole pixels.
      expect(Math.abs(camera.w * 3 - camera.h * 5)).toBeLessThanOrEqual(5);
    }
  });

  it('rests every line on the capture its heading names, which is what reduced motion shows', () => {
    // Under reduced motion a line shows its last frame and nothing else (sceneState.ts).
    const at = (line: number) => frames[lastFrameOfLine(frames, line)]!;
    expect(ENTRIES_SCENE.lines.map(line => line.head)).toEqual([
      'An exhibitor enters online',
      'They pay as they enter',
      'They can see where it stands',
      'The form arrives in your list',
      'You open it and accept',
    ]);
    // 1: the classes step, ringing the full class. 2: the Payment step, ringing the Pay button.
    expect(at(0).phone!.shot).toBe('classes');
    expect(at(0).phone!.ring).toEqual(regions.phone.shots.classes.regions.chip);
    expect(at(1).phone!.shot).toBe('payment');
    expect(at(1).phone!.ring).toEqual(regions.phone.shots.payment.regions.pay);
    // 3: My Entries reading Pending review.
    expect(at(2).phone!.shot).toBe('pending');
    expect(at(2).phone!.ring).toEqual(regions.phone.shots.pending.regions.badge);
    // 4: the secretary's list, ringing the form's row.
    expect(at(3).desk!.shot).toBe('list');
    expect(at(3).desk!.ring).toEqual(regions.desk.shots.list.regions.row);
    // 5: Accepted, on the secretary's screen and then on the phone.
    expect(at(4).desk!.shot).toBe('accepted');
    expect(at(4).phone!.shot).toBe('accepted');
    expect(at(4).desk!.ring).toEqual(regions.desk.shots.accepted.regions.entry);
  });

  it('rings the Accept button on the review frame and keeps the item it belongs to in view', () => {
    const view = frames.find(f => f.desk!.shot === 'review')!.desk!;
    const { accept, item } = regions.desk.shots.review.regions;
    expect(view.ring).toEqual(accept);
    expect(inside(accept, item)).toBe(true);
    expect(inside(item, view.camera)).toBe(true);
  });

  it('shows the phone dimmed on the pending capture while the secretary works', () => {
    const lineThree = frames.find(f => f.line === 3)!;
    const lineTwo = frames.find(f => f.line === 2)!;
    expect(lineThree.phone!.shot).toBe('pending');
    expect(lineThree.phone!.camera).toEqual(lineTwo.phone!.camera);
  });

  it('keeps the Communication section, which says no decision email has gone yet, out of frame on the Accepted capture', () => {
    // Line 5 says the exhibitor gets an email; that section reads "No decision email sent yet".
    const view = frames.find(f => f.desk!.shot === 'accepted')!.desk!;
    const { entry, communication } = regions.desk.shots.accepted.regions;
    expect(inside(entry, view.camera)).toBe(true);
    const overlaps =
      communication.y < view.camera.y + view.camera.h &&
      communication.y + communication.h > view.camera.y &&
      communication.x < view.camera.x + view.camera.w &&
      communication.x + communication.w > view.camera.x;
    expect(overlaps).toBe(false);
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

  it('describes every capture, within the copy rules', () => {
    for (const data of [desk!, phone!]) {
      for (const shot of Object.values(data.shots)) {
        expect(shot.alt.length).toBeGreaterThan(20);
        for (const banned of BANNED_COPY) expect(shot.alt).not.toMatch(banned);
      }
    }
  });

  it('says only what the screens hold: no class-limit figure, no armband assigned by the entry', () => {
    const texts = [
      ...Object.values(desk!.shots).map(shot => shot.alt),
      ...Object.values(phone!.shots).map(shot => shot.alt),
      ...ENTRIES_SCENE.lines.map(line => `${line.head}. ${line.text}`),
    ];
    const words = texts.join(' ');
    expect(words).not.toMatch(/class limit|max entries|limit of|spots left|capacity/i);
    expect(words).not.toMatch(/armband (assigned|given)|gets an armband/i);
    // Paying does not accept an entry: no sentence joins the two.
    for (const sentence of texts.flatMap(text => text.split(/[.:]/))) {
      expect(sentence, sentence).not.toMatch(/\b(pay|pays|paid|paying|payment)\b.*\baccept/i);
      expect(sentence, sentence).not.toMatch(/\baccept.*\b(pay|pays|paid|paying|payment)\b/i);
    }
  });
});

describe('zoomOnRing', () => {
  const page = { width: 1440, height: 900 };

  it('centres the subject in a 5:3 camera', () => {
    expect(zoomOnRing(page, { x: 700, y: 400, w: 100, h: 40 }, 640)).toEqual({
      x: 430,
      y: 228,
      w: 640,
      h: 384,
    });
  });

  it('stops at the page’s edge', () => {
    expect(zoomOnRing(page, { x: 0, y: 0, w: 100, h: 40 }, 640)).toMatchObject({ x: 0, y: 0 });
    expect(zoomOnRing(page, { x: 1340, y: 860, w: 100, h: 40 }, 640)).toEqual({
      x: 800,
      y: 516,
      w: 640,
      h: 384,
    });
  });

  it('widens rather than crops a subject that does not fit', () => {
    const wide = { x: 100, y: 300, w: 900, h: 60 };
    const camera = zoomOnRing(page, wide, 640);
    expect(camera.w).toBe(948);
    expect(inside(wide, camera)).toBe(true);
    const tall = { x: 100, y: 100, w: 200, h: 500 };
    expect(inside(tall, zoomOnRing(page, tall, 640))).toBe(true);
  });
});

describe('the Entries open scene on the page', () => {
  const entriesStep = (container: HTMLElement) => container.querySelector('#entries')!;

  it('replaces the club’s still, with the desk leading', () => {
    const { container } = render(<LifecycleTimeline audience="club" onAudienceChange={vi.fn()} />);
    const step = entriesStep(container);
    const scene = step.querySelector('.lc-scene[data-side="main"] .tl-scene');
    expect(scene).not.toBeNull();
    expect(scene).toHaveAttribute('data-lead', 'desk');
    expect(scene).not.toHaveAttribute('data-solo');
    expect(step.querySelectorAll('.lc-shot, figure')).toHaveLength(0);
    expect(STORIES.club.find(s => s.id === 'entries')!.shot).toBeNull();
  });

  it('replaces the exhibitor’s still and its explainer, with the phone leading', () => {
    const { container } = render(
      <LifecycleTimeline audience="exhibitor" onAudienceChange={vi.fn()} />
    );
    const step = entriesStep(container);
    const scene = step.querySelector('.lc-scene[data-side="main"] .tl-scene');
    expect(scene).not.toBeNull();
    expect(scene).toHaveAttribute('data-lead', 'phone');
    expect(step.querySelectorAll('.lc-shot, figure')).toHaveLength(0);
    expect(STORIES.exhibitor.find(s => s.id === 'entries')).not.toHaveProperty('explainer');
  });

  it('reads the same five lines in both stories', () => {
    const linesIn = (audience: 'club' | 'exhibitor') => {
      const { container, unmount } = render(
        <LifecycleTimeline audience={audience} onAudienceChange={vi.fn()} />
      );
      const list = within(entriesStep(container) as HTMLElement).getByRole('list');
      const text = within(list)
        .getAllByRole('button')
        .map(button => button.textContent);
      unmount();
      return text;
    };
    const club = linesIn('club');
    expect(club).toHaveLength(5);
    expect(linesIn('exhibitor')).toEqual(club);
  });

  it('jumps to a line’s capture when the line is pressed', () => {
    const { container } = render(<LifecycleTimeline audience="club" onAudienceChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /They can see where it stands/ }));
    const on = (kind: string) =>
      entriesStep(container)
        .querySelector(`.tl-scene-frame[data-kind="${kind}"] .tl-scene-shot[data-on="true"]`)
        ?.getAttribute('data-shot');
    expect(on('phone')).toBe('pending');
    expect(on('desk')).toBe('before');
  });

  it('rests each line on the frame its heading names under reduced motion', () => {
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
    const { container } = render(<LifecycleTimeline audience="club" onAudienceChange={vi.fn()} />);
    const on = (kind: string) =>
      entriesStep(container)
        .querySelector(`.tl-scene-frame[data-kind="${kind}"] .tl-scene-shot[data-on="true"]`)
        ?.getAttribute('data-shot');
    const rest = (name: RegExp) => {
      fireEvent.click(within(entriesStep(container) as HTMLElement).getByRole('button', { name }));
      return [on('desk'), on('phone')];
    };
    expect(rest(/An exhibitor enters online/)).toEqual(['before', 'classes']);
    expect(rest(/They pay as they enter/)).toEqual(['before', 'payment']);
    expect(rest(/They can see where it stands/)).toEqual(['before', 'pending']);
    expect(rest(/The form arrives in your list/)).toEqual(['list', 'pending']);
    expect(rest(/You open it and accept/)).toEqual(['accepted', 'accepted']);
  });
});
