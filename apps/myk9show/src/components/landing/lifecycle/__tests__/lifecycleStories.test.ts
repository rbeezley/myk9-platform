import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { HERO_PHOTO_SIZES } from '../heroPhoto';
import {
  AUDIENCE_LABEL,
  BANNED_COPY,
  DEFAULT_AUDIENCE,
  MEANWHILE_LABEL,
  PEAK_LEAD,
  SCENE_LINES,
  STORIES,
  STORY_HEADING,
  type Audience,
  type StoryStep,
} from '../lifecycleStories';

const appRoot = resolve(__dirname, '../../../../..');
const publicDir = resolve(appRoot, 'public');
const AUDIENCES: Audience[] = ['club', 'exhibitor'];

const shotsOf = (s: StoryStep) => (s.shot ? [s.shot] : []);
const copyOf = (s: StoryStep) => [
  s.title,
  s.body,
  s.meanwhile,
  ...shotsOf(s).map(x => x.alt),
  ...(s.explainer ?? []).flatMap(e => [e.caption, e.badge?.text ?? '']),
];

describe('STORIES', () => {
  it('opens on the club story (homepage recruits clubs first)', () => {
    expect(DEFAULT_AUDIENCE).toBe('club');
  });

  it('tells the same six steps, in the same order, for both audiences', () => {
    const ids = ['setup', 'entries', 'before', 'showday', 'results', 'after'];
    for (const a of AUDIENCES) expect(STORIES[a].map(s => s.id)).toEqual(ids);
  });

  it('has exactly one peak per audience, and it is show day', () => {
    for (const a of AUDIENCES) {
      expect(STORIES[a].filter(s => s.peak).map(s => s.id)).toEqual(['showday']);
    }
  });

  it('shows no meanwhile screenshot on any step; the meanwhile side is a sentence or a scene', () => {
    for (const a of AUDIENCES) {
      for (const s of STORIES[a]) {
        expect(s, `${a}/${s.id}`).not.toHaveProperty('meanwhileShot');
        expect(s.meanwhile.length, `${a}/${s.id}`).toBeGreaterThan(10);
      }
    }
    expect(STORIES.exhibitor.find(s => s.id === 'showday')!.meanwhileScene).toBe('showday-ring');
  });

  it('points every screenshot at a real file of 250 KB or less with real alt text', () => {
    for (const a of AUDIENCES) {
      for (const shot of STORIES[a].flatMap(shotsOf)) {
        const file = resolve(publicDir, `.${shot.src}`);
        expect(existsSync(file), shot.src).toBe(true);
        expect(statSync(file).size, shot.src).toBeLessThanOrEqual(250 * 1024);
        expect(shot.alt.length, shot.src).toBeGreaterThan(10);
      }
    }
  });

  // MYK9-2309: the steps that are not scenes keep one still each, captured by the Landing capture
  // workflow at twice the size the page draws it. Nothing else carries a screenshot.
  it('keeps one captured still on each step that is not a scene, and no other screenshot', () => {
    const stills = (a: Audience) =>
      Object.fromEntries(STORIES[a].map(s => [s.id, s.shot?.src.replace('/landing/', '') ?? null]));
    expect(stills('club')).toEqual({
      setup: 'stills/club-create-show.png',
      entries: null,
      before: null,
      showday: null,
      results: null,
      after: null,
    });
    expect(stills('exhibitor')).toEqual({
      setup: 'stills/exhibitor-find-a-show.png',
      entries: null,
      before: 'stills/exhibitor-my-entries.png',
      showday: 'stages/e-13.png',
      results: null,
      after: 'stills/exhibitor-past-results.png',
    });
  });

  it('draws each still from a capture of exactly twice its declared size', () => {
    const pngSize = (file: string) => {
      const header = readFileSync(file).subarray(16, 24);
      return { width: header.readUInt32BE(0), height: header.readUInt32BE(4) };
    };
    for (const a of AUDIENCES) {
      for (const shot of STORIES[a].flatMap(shotsOf)) {
        if (!shot.src.startsWith('/landing/stills/')) continue;
        expect(pngSize(resolve(publicDir, `.${shot.src}`)), shot.src).toEqual({
          width: shot.width * 2,
          height: shot.height * 2,
        });
        // A phone still is the whole screen; a desktop still is a window of it.
        if (shot.shape === 'phone') expect([shot.width, shot.height], shot.src).toEqual([390, 844]);
        else expect(shot.width, shot.src).toBeLessThanOrEqual(680);
      }
    }
  });

  it('gives the club story the practice scoresheet on show day and the night-before card before it', () => {
    const club = (id: string) => STORIES.club.find(x => x.id === id)!;
    expect(club('showday').scoresheetDemo).toBe(true);
    expect(club('showday').explainer).toBeUndefined();
    expect(club('before').nightBefore).toBe(true);
    expect(STORIES.exhibitor.some(x => x.scoresheetDemo || x.nightBefore)).toBe(false);
  });

  it('keeps every explainer box inside its image and gives each a caption', () => {
    for (const a of AUDIENCES) {
      for (const s of STORIES[a]) {
        if (!s.explainer) continue;
        expect(s.shot, `${a}/${s.id} explainer needs a shot`).not.toBeNull();
        expect(s.explainer.length).toBeGreaterThanOrEqual(2);
        for (const e of s.explainer) {
          expect(e.x).toBeGreaterThanOrEqual(0);
          expect(e.y).toBeGreaterThanOrEqual(0);
          expect(e.x + e.w).toBeLessThanOrEqual(100);
          expect(e.y + e.h).toBeLessThanOrEqual(100);
          expect(e.caption.length).toBeGreaterThan(5);
        }
      }
    }
  });

  it('contains no banned copy anywhere in the data', () => {
    const labels = [
      ...Object.values(AUDIENCE_LABEL),
      ...Object.values(PEAK_LEAD),
      ...Object.values(STORY_HEADING),
      ...Object.values(MEANWHILE_LABEL),
    ];
    const sceneCopy = Object.values(SCENE_LINES).flatMap(lines =>
      lines.flatMap(line => [line.head, line.text])
    );
    const all = [...labels, ...sceneCopy, ...AUDIENCES.flatMap(a => STORIES[a].flatMap(copyOf))];
    for (const text of all) for (const re of BANNED_COPY) expect(text).not.toMatch(re);
  });

  it('writes a heading and a sentence for every line of the four scenes, none repeated', () => {
    expect(Object.fromEntries(Object.entries(SCENE_LINES).map(([k, v]) => [k, v.length]))).toEqual({
      entries: 5,
      'showday-ring': 5,
      'showday-desk': 5,
      results: 4,
    });
    const seen = new Set<string>();
    for (const [scene, lines] of Object.entries(SCENE_LINES)) {
      for (const { head, text } of lines) {
        expect(head.trim().length, scene).toBeGreaterThan(10);
        // A heading is read at a glance while the scene plays.
        expect(head.length, head).toBeLessThanOrEqual(40);
        expect(text.trim().length, scene).toBeGreaterThan(20);
        for (const copy of [head, text]) {
          expect(seen.has(copy), copy).toBe(false);
          seen.add(copy);
        }
      }
    }
  });

  it('ships a real share image and light hero variants', () => {
    for (const [name, maxKb] of [
      ['og-image.jpg', 250],
      ['hero-ziva-tera-1600.jpg', 250],
      ['hero-ziva-tera-800.jpg', 120],
    ] as const) {
      const file = resolve(publicDir, name);
      expect(existsSync(file), name).toBe(true);
      expect(statSync(file).size, name).toBeLessThanOrEqual(maxKb * 1024);
      expect(readFileSync(file).subarray(0, 3).toString('hex'), name).toBe('ffd8ff'); // a JPEG, not HTML
    }
  });

  // A preload whose sizes differ from the <img> makes the browser fetch the hero twice.
  it('preloads the hero with the same sizes the hero image uses', () => {
    const doc = new DOMParser().parseFromString(
      readFileSync(resolve(appRoot, 'index.html'), 'utf8'),
      'text/html'
    );
    const preload = doc.querySelector('link[rel="preload"][as="image"][imagesrcset*="hero-ziva"]');
    expect(preload, 'hero preload').not.toBeNull();
    expect(preload!.getAttribute('imagesizes')).toBe(HERO_PHOTO_SIZES);
  });

  it('keeps landing screenshots out of the service-worker precache', () => {
    const config = readFileSync(resolve(appRoot, 'vite.config.ts'), 'utf8');
    expect(config).toMatch(/globIgnores:\s*\[[^\]]*'landing\/\*\*'/);
  });
});
