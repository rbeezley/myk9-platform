import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { auditSkillTrees, listSkillNames, SKILL_TREES } from './skillTrees';

/**
 * The skill trees Claude Code and Codex read must be ONE source. Before
 * 2026-09-05 `.claude/skills` and `.agents/skills` each held a real copy of
 * seven project skills; `commit`, `cleanup`, `harden`, `audit-pages`,
 * `qa-feature` and `ship-pr` had all drifted, each side carrying content the
 * other lacked, and `ship-pr`'s two copies disagreed about the merge itself.
 * "Port improvements both ways" was the documented policy and it did not
 * hold. Now a shared skill is a real directory in one tree and a symlink in
 * every other, and this test enumerates the trees from disk so a new fork —
 * or a symlink whose target was deleted — fails here instead of forking
 * quietly.
 */

const repoRoot = resolve(__dirname, '../../../../..');

describe('skill trees are a single source', () => {
  it('every skill shared between harnesses has one real copy and resolving links', () => {
    expect(auditSkillTrees(repoRoot)).toEqual([]);
  });

  it('actually enumerated the shared skills (positive control)', () => {
    // A test over an empty set would pass vacuously; the repo has more than
    // ten skills present in at least two trees.
    const shared = listSkillNames(repoRoot).filter(
      name =>
        SKILL_TREES.filter(tree => {
          try {
            return listSkillNames(repoRoot, [tree]).includes(name);
          } catch {
            return false;
          }
        }).length >= 2
    );
    expect(shared.length).toBeGreaterThanOrEqual(10);
    expect(shared).toContain('ship-pr');
    expect(shared).toContain('commit');
  });
});

describe('auditSkillTrees on fixtures', () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  function fixture(): string {
    const root = mkdtempSync(join(tmpdir(), 'skill-trees-'));
    dirs.push(root);
    for (const tree of SKILL_TREES) mkdirSync(join(root, tree), { recursive: true });
    return root;
  }
  function realSkill(root: string, tree: string, name: string) {
    mkdirSync(join(root, tree, name), { recursive: true });
    writeFileSync(join(root, tree, name, 'SKILL.md'), `# ${name}\n`);
  }
  function link(root: string, tree: string, name: string, targetTree: string, targetName = name) {
    symlinkSync(`../../${targetTree}/${targetName}`, join(root, tree, name));
  }

  it('accepts one real copy plus symlinks, and harness-specific skills', () => {
    const root = fixture();
    realSkill(root, '.claude/skills', 'shared');
    link(root, '.agents/skills', 'shared', '.claude/skills');
    link(root, '.codex/skills', 'shared', '.claude/skills');
    realSkill(root, '.claude/skills', 'claude-only');
    realSkill(root, '.codex/skills', 'codex-only');
    expect(auditSkillTrees(root, SKILL_TREES, {})).toEqual([]);
  });

  it('rejects a second real copy', () => {
    const root = fixture();
    realSkill(root, '.claude/skills', 'forked');
    realSkill(root, '.agents/skills', 'forked');
    const problems = auditSkillTrees(root, SKILL_TREES, {});
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ name: 'forked' });
    expect(problems[0].problem).toMatch(/2 real copies/);
  });

  it('rejects a broken symlink', () => {
    const root = fixture();
    link(root, '.agents/skills', 'gone', '.claude/skills');
    expect(auditSkillTrees(root, SKILL_TREES, {})).toEqual([
      { name: 'gone', problem: '.agents/skills/gone is a broken symlink' },
    ]);
  });

  it('rejects a symlink that resolves to a different skill', () => {
    const root = fixture();
    realSkill(root, '.claude/skills', 'alpha');
    realSkill(root, '.claude/skills', 'beta');
    link(root, '.agents/skills', 'beta', '.claude/skills', 'alpha');
    const problems = auditSkillTrees(root, SKILL_TREES, {});
    expect(problems.map(p => p.name)).toEqual(['beta']);
    expect(problems[0].problem).toMatch(/resolves to .*alpha, not the real copy/);
  });

  it('allows a declared intentional variant to hold two real copies', () => {
    const root = fixture();
    realSkill(root, '.claude/skills', 'variant');
    realSkill(root, '.codex/skills', 'variant');
    expect(auditSkillTrees(root, SKILL_TREES, { variant: 'different sub-agent APIs' })).toEqual([]);
    // The same layout without the declaration is a fork.
    expect(auditSkillTrees(root, SKILL_TREES, {})).toHaveLength(1);
  });

  it('fails a stale variant declaration whose copies were unified', () => {
    const root = fixture();
    realSkill(root, '.claude/skills', 'unified');
    link(root, '.codex/skills', 'unified', '.claude/skills');
    const problems = auditSkillTrees(root, SKILL_TREES, { unified: 'no longer true' });
    expect(problems).toHaveLength(1);
    expect(problems[0].problem).toMatch(/stale/);
  });

  it('rejects links with no real copy anywhere', () => {
    const root = fixture();
    mkdirSync(join(root, 'elsewhere', 'orphan'), { recursive: true });
    symlinkSync('../../elsewhere/orphan', join(root, '.claude/skills', 'orphan'));
    symlinkSync('../../elsewhere/orphan', join(root, '.agents/skills', 'orphan'));
    const problems = auditSkillTrees(root, SKILL_TREES, {});
    expect(problems).toHaveLength(1);
    expect(problems[0].problem).toMatch(/0 real copies/);
  });
});
