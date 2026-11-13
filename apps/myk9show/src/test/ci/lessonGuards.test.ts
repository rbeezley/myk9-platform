import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { lessonGuardProblems, sectionFor } from './lessonGuards';

const root = resolve(__dirname, '../../../../..');
const exists = (p: string) => p === 'scripts/real.ts';
const check = (narratives: string, anchors = ['a']) =>
  lessonGuardProblems({ anchors, narratives, fileExists: exists });

describe('lessonGuardProblems known answers', () => {
  it('accepts a path guard, a filed issue, and a human-only marker', () => {
    expect(check('## a\n\n**Guard:** `scripts/real.ts`\n\nbody\n')).toEqual([]);
    expect(check('## a\n\n**Guard:** MYK9-1651 (check not built yet)\n')).toEqual([]);
    expect(check('## a\n\n**Guard:** MYK9-12\n')).toEqual([]);
    expect(check('## a\n\n**Guard:** human-only: a judgment call\n')).toEqual([]);
  });

  it('rejects an untagged lesson', () => {
    expect(check('## a\n\nstory only\n')).toEqual([
      'a: expected exactly one **Guard:** line, found 0',
    ]);
  });

  it('rejects a path guard naming a missing file', () => {
    expect(check('## a\n\n**Guard:** `scripts/missing.ts`\n')).toEqual([
      'a: guard file does not exist: scripts/missing.ts',
    ]);
  });

  it('rejects the MYK9-TBD placeholder and an empty human-only', () => {
    expect(check('## a\n\n**Guard:** MYK9-TBD-a\n')).toHaveLength(1);
    expect(check('## a\n\n**Guard:** human-only:\n')).toHaveLength(1);
  });

  it('does not borrow a Guard line from the next section', () => {
    const doc = '## a\n\nstory\n\n## b\n\n**Guard:** human-only: x\n';
    expect(check(doc, ['a', 'b'])).toEqual(['a: expected exactly one **Guard:** line, found 0']);
    expect(sectionFor(doc, 'a')).not.toContain('Guard');
  });

  it('rejects a missing section', () => {
    expect(check('## b\n', ['a'])).toEqual(['a: no narrative section']);
  });
});

describe('real lessons', () => {
  // MYK9-1790: domain lessons live in the skill that does the work, so the
  // guard check reads those sections as well as CLAUDE.md's.
  const LESSON_SKILLS = ['commit', 'db-push', 'deploy', 'playwright-cli', 'ship-pr'];
  const anchorsIn = (file: string, heading: string): string[] => {
    const text = readFileSync(resolve(root, file), 'utf8');
    const start = text.indexOf(`\n${heading}\n`);
    if (start < 0) return [];
    const next = text.indexOf('\n## ', start + 1);
    return [
      ...text
        .slice(start, next < 0 ? undefined : next)
        .matchAll(/docs\/lessons\/README\.md#([a-z0-9-]+)/g),
    ].map(m => m[1]);
  };

  it('every lesson in CLAUDE.md and the skills has a valid Guard line in its narrative', () => {
    const claude = anchorsIn('CLAUDE.md', '## LESSONS');
    expect(claude.length).toBeGreaterThan(5); // vacuity guard
    const perSkill = LESSON_SKILLS.map(skill =>
      anchorsIn(`.claude/skills/${skill}/SKILL.md`, '## Lessons')
    );
    // Every listed skill carries at least one lesson; a renamed heading would
    // otherwise drop its lessons out of the check silently.
    expect(perSkill.map(a => a.length > 0)).toEqual(LESSON_SKILLS.map(() => true));
    const anchors = [...claude, ...perSkill.flat()];
    expect(anchors.length).toBeGreaterThan(20); // vacuity guard
    expect(new Set(anchors).size).toBe(anchors.length); // one home per lesson
    const narratives = readFileSync(resolve(root, 'docs/lessons/README.md'), 'utf8');
    expect(
      lessonGuardProblems({
        anchors,
        narratives,
        fileExists: p => existsSync(resolve(root, p)),
      })
    ).toEqual([]);
  });
});
