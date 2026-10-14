import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AUDIENCE_LABEL,
  BANNED_COPY,
  DEFAULT_AUDIENCE,
  MEANWHILE_LABEL,
  PEAK_LEAD,
  STORIES,
  STORY_HEADING,
  type Audience,
  type Shot,
  type StoryStep,
} from '../lifecycleStories';

const appRoot = resolve(__dirname, '../../../../..');
const publicDir = resolve(appRoot, 'public');
const AUDIENCES: Audience[] = ['club', 'exhibitor'];

const shotsOf = (s: StoryStep) => [s.shot, s.meanwhileShot].filter((x): x is Shot => x !== null);
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
    const all = [...labels, ...AUDIENCES.flatMap(a => STORIES[a].flatMap(copyOf))];
    for (const text of all) for (const re of BANNED_COPY) expect(text).not.toMatch(re);
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

  it('keeps landing screenshots out of the service-worker precache', () => {
    const config = readFileSync(resolve(appRoot, 'vite.config.ts'), 'utf8');
    expect(config).toMatch(/globIgnores:\s*\[[^\]]*'landing\/\*\*'/);
  });
});
