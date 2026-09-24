import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  auditInventory,
  auditSkillTrees,
  listSkillNames,
  parseInventory,
  SKILL_TREES,
} from './skillTrees';

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

/** git's own answer, so re-includes and tracked-despite-ignored files count. */
function gitIgnores(root: string): (path: string) => boolean {
  return path => {
    try {
      execFileSync('git', ['check-ignore', '-q', path], { cwd: root, stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  };
}

function realSkillDirs(root: string): string[] {
  return readdirSync(resolve(root, '.agents/skills'), { withFileTypes: true })
    .filter(d => d.isDirectory() && !d.isSymbolicLink())
    .map(d => d.name);
}

describe('third-party skills are inventoried', () => {
  const inventory = readFileSync(resolve(repoRoot, 'docs/agents/skills-inventory.md'), 'utf8');
  const rows = parseInventory(inventory);
  const onDisk = realSkillDirs(repoRoot);

  it('every real (non-symlink) .agents/skills entry has a row, and every row has a directory', () => {
    expect(auditInventory(rows, onDisk, gitIgnores(repoRoot))).toEqual([]);
    expect(onDisk.length).toBeGreaterThan(5); // vacuity guard
  });

  it('holds whether or not a local-only skill is installed here (MYK9-598)', () => {
    // CI never has `impeccable`; the machine that runs local checks does.
    // Both worlds must be green, so audit each regardless of this checkout.
    const localOnly = rows.filter(r => r.localOnly).map(r => r.name);
    expect(localOnly).toContain('impeccable'); // positive control
    const shared = onDisk.filter(n => !localOnly.includes(n));
    expect(auditInventory(rows, shared, gitIgnores(repoRoot))).toEqual([]);
    expect(auditInventory(rows, [...shared, ...localOnly], gitIgnores(repoRoot))).toEqual([]);
  });

  it('every third-party row names a repo file that routes to it, and that file exists and mentions it', () => {
    for (const row of rows.filter(r => r.origin !== 'ours')) {
      const path = row.reason.match(/`([^`]+\.(?:md|ts|js|yml|json))`/)?.[1];
      expect(path, `${row.name}: reason must name the routing file in backticks`).toBeTruthy();
      const text = readFileSync(resolve(repoRoot, path!), 'utf8');
      expect(text, `${path} does not name ${row.name}`).toMatch(
        new RegExp(`(skills/${row.name}\\b|\`${row.name}\`|/${row.name}\\b)`)
      );
    }
  });
});

describe('auditInventory on fixtures', () => {
  const TABLE = [
    '| Skill | Origin | Why |',
    '| ----- | ------ | --- |',
    '| `kept`       | ours                        | routed from `x.md` |',
    '| `vendored`   | Local-only, upstream/vendor | routed from `y.md` |',
  ].join('\n');
  const rows = parseInventory(TABLE);
  const allIgnored = new Set(SKILL_TREES.map(t => `${t}/vendored`));
  const ignores = (set: ReadonlySet<string>) => (p: string) => set.has(p);

  it('parses padded rows and marks local-only by the origin cell', () => {
    expect(rows.map(r => [r.name, r.localOnly])).toEqual([
      ['kept', false],
      ['vendored', true],
    ]);
  });

  it('the MYK9-598 table: green with and without the local-only directory', () => {
    expect(auditInventory(rows, ['kept'], ignores(allIgnored))).toEqual([]);
    expect(auditInventory(rows, ['kept', 'vendored'], ignores(allIgnored))).toEqual([]);
  });

  it('still requires a row for every real directory', () => {
    expect(auditInventory(rows, ['kept', 'stray'], ignores(allIgnored))).toEqual([
      'stray: real directory with no inventory row',
    ]);
  });

  it('still requires a directory for every row that is not local-only', () => {
    expect(auditInventory(rows, [], ignores(allIgnored))).toEqual([
      'kept: inventory row with no real .agents/skills directory',
    ]);
  });

  it('refuses a local-only row that some tree does not ignore', () => {
    const partial = new Set([...allIgnored].filter(p => !p.startsWith('.codex/')));
    expect(auditInventory(rows, ['kept'], ignores(partial))).toEqual([
      'vendored: local-only row but git does not ignore .codex/skills/vendored',
    ]);
  });

  describe('against git check-ignore', () => {
    let root = '';
    afterEach(() => rmSync(root, { recursive: true, force: true }));

    it('a force-added local-only skill is tracked, so it is not ignored and fails', () => {
      root = mkdtempSync(join(tmpdir(), 'skill inventory '));
      const git = (...args: string[]) =>
        execFileSync('git', args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
      git('init', '-q');
      writeFileSync(join(root, '.gitignore'), SKILL_TREES.map(t => `${t}/vendored`).join('\n'));
      expect(auditInventory(rows, ['kept'], gitIgnores(root))).toEqual([]);

      mkdirSync(join(root, '.agents/skills/vendored'), { recursive: true });
      writeFileSync(join(root, '.agents/skills/vendored/SKILL.md'), '# vendored\n');
      expect(auditInventory(rows, ['kept', 'vendored'], gitIgnores(root))).toEqual([]);

      git('add', '-f', '.agents/skills/vendored/SKILL.md');
      expect(auditInventory(rows, ['kept', 'vendored'], gitIgnores(root))).toEqual([
        'vendored: local-only row but git does not ignore .agents/skills/vendored',
      ]);
    });

    it('a later re-include cancels the ignore', () => {
      root = mkdtempSync(join(tmpdir(), 'skill inventory '));
      execFileSync('git', ['init', '-q'], { cwd: root, stdio: 'ignore' });
      writeFileSync(
        join(root, '.gitignore'),
        [...SKILL_TREES.map(t => `${t}/vendored`), '!.claude/skills/vendored'].join('\n')
      );
      expect(auditInventory(rows, ['kept'], gitIgnores(root))).toEqual([
        'vendored: local-only row but git does not ignore .claude/skills/vendored',
      ]);
    });
  });
});
