import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * CLAUDE.md is loaded into every session and every subagent. On 2026-09-07 it
 * was 12,546 words, 10,097 of them LESSONS narratives; that is ~16k tokens per
 * turn spent on stories about traps that mostly have checks now. Narratives
 * live in docs/lessons/README.md; CLAUDE.md keeps one to three lines per
 * lesson and a pointer. Raise these numbers only in a PR that says why.
 */
const root = resolve(__dirname, '../../../../..');
const words = (file: string) =>
  readFileSync(resolve(root, file), 'utf8').split(/\s+/).filter(Boolean).length;

// The shared-rules block (docs/agents/shared-rules.md, ~3,750 words on
// 2026-09-07) is carried verbatim by BOTH files, so each file's budget is that
// block plus its harness-specific remainder. The LESSONS budget is the one that
// ratchets: it was 10,097 words before this test existed.
const lessonsSection = (): string => {
  const claude = readFileSync(resolve(root, 'CLAUDE.md'), 'utf8');
  const start = claude.indexOf('## LESSONS');
  expect(start).toBeGreaterThan(0);
  const next = claude.indexOf('\n## ', start + 1);
  return claude.slice(start, next < 0 ? undefined : next);
};

describe('instruction file budgets', () => {
  it('CLAUDE.md stays under 7,500 words', () => {
    expect(words('CLAUDE.md')).toBeLessThan(7500);
  });

  it('AGENTS.md stays under 5,000 words', () => {
    expect(words('AGENTS.md')).toBeLessThan(5000);
  });

  it('the LESSONS section stays under 3,000 words', () => {
    expect(lessonsSection().split(/\s+/).filter(Boolean).length).toBeLessThan(3000);
  });

  it('every LESSONS bullet is at most three lines of prose and points at its narrative', () => {
    const lessons = lessonsSection();
    const bullets = lessons.split(/\n(?=- )/).slice(1);
    expect(bullets.length).toBeGreaterThan(20); // vacuity guard
    const long = bullets.filter(b => b.split('\n').filter(l => l.trim()).length > 3);
    expect(long.map(b => b.slice(0, 60))).toEqual([]);
    const narratives = readFileSync(resolve(root, 'docs/lessons/README.md'), 'utf8');
    const unlinked = bullets.filter(b => !/docs\/lessons\/README\.md#[a-z0-9-]+/.test(b));
    expect(unlinked.map(b => b.slice(0, 60))).toEqual([]);
    const dangling = bullets
      .map(b => b.match(/docs\/lessons\/README\.md#([a-z0-9-]+)/)?.[1] ?? '')
      .filter(slug => !narratives.includes(`\n## ${slug}\n`));
    expect(dangling).toEqual([]);
  });
});
