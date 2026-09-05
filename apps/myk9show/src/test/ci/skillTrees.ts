import { lstatSync, readdirSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * Skill directories that more than one harness reads. Claude Code loads
 * `.claude/skills`, Codex loads `.agents/skills` (and, historically,
 * `.codex/skills`). A skill present in more than one tree must exist as ONE
 * real directory, with every other tree holding a symlink to it — a second
 * real copy is a fork that will drift (six of fifteen shared skills had, by
 * 2026-09-05, with each side carrying improvements the other lacked).
 */
export const SKILL_TREES = ['.claude/skills', '.agents/skills', '.codex/skills'] as const;

/**
 * Skills that are DELIBERATELY different per harness — not two copies of one
 * text but two texts, because the harnesses' sub-agent APIs differ. Each entry
 * must still exist as a real directory in at least two trees: an entry whose
 * copies were later unified is stale and fails the audit, so this list cannot
 * silently outlive the fork it excuses.
 */
export const INTENTIONAL_VARIANTS: Readonly<Record<string, string>> = {
  'opsx-orchestrate':
    'Codex port (#1260) is written against spawn_agent/followup_task and cannot pick a model tier; the Claude version dispatches sonnet/opus via the Agent tool.',
};

export interface SkillTreeProblem {
  name: string;
  problem: string;
}

interface Entry {
  tree: string;
  path: string;
  kind: 'dir' | 'symlink';
  /** Resolved real path for a symlink; undefined when the link is broken. */
  target?: string;
}

function entriesFor(root: string, name: string, trees: readonly string[]): Entry[] {
  const out: Entry[] = [];
  for (const tree of trees) {
    const path = join(root, tree, name);
    let stat;
    try {
      stat = lstatSync(path);
    } catch {
      continue;
    }
    if (stat.isSymbolicLink()) {
      let target: string | undefined;
      try {
        target = realpathSync(path);
      } catch {
        target = undefined;
      }
      out.push({ tree, path, kind: 'symlink', target });
    } else if (stat.isDirectory()) {
      out.push({ tree, path, kind: 'dir' });
    }
  }
  return out;
}

/** Every skill name that appears in at least one tree. */
export function listSkillNames(root: string, trees: readonly string[] = SKILL_TREES): string[] {
  const names = new Set<string>();
  for (const tree of trees) {
    let dirents;
    try {
      dirents = readdirSync(join(root, tree), { withFileTypes: true });
    } catch {
      continue;
    }
    for (const d of dirents) {
      if (d.isDirectory() || d.isSymbolicLink()) names.add(d.name);
    }
  }
  return [...names].sort();
}

/**
 * Returns one problem per violation; an empty array means every shared skill
 * has exactly one real copy and every link resolves to it.
 */
export function auditSkillTrees(
  root: string,
  trees: readonly string[] = SKILL_TREES,
  variants: Readonly<Record<string, string>> = INTENTIONAL_VARIANTS
): SkillTreeProblem[] {
  const problems: SkillTreeProblem[] = [];
  const names = listSkillNames(root, trees);
  for (const name of Object.keys(variants)) {
    const real = entriesFor(root, name, trees).filter(e => e.kind === 'dir');
    if (real.length < 2) {
      problems.push({
        name,
        problem: `listed in INTENTIONAL_VARIANTS but has ${real.length} real copies — the entry is stale, remove it`,
      });
    }
  }
  for (const name of names) {
    const entries = entriesFor(root, name, trees);
    for (const e of entries) {
      if (e.kind === 'symlink' && e.target === undefined) {
        problems.push({ name, problem: `${e.tree}/${name} is a broken symlink` });
      }
    }
    if (entries.length < 2) continue; // harness-specific skill: nothing to keep in sync
    if (name in variants) continue; // declared variant, checked above
    const real = entries.filter(e => e.kind === 'dir');
    if (real.length !== 1) {
      problems.push({
        name,
        problem: `${real.length} real copies across ${entries.map(e => e.tree).join(', ')}; expected exactly one, the rest symlinks`,
      });
      continue;
    }
    const canonical = realpathSync(real[0].path);
    for (const e of entries) {
      if (e.kind === 'symlink' && e.target !== undefined && resolve(e.target) !== canonical) {
        problems.push({
          name,
          problem: `${e.tree}/${name} resolves to ${e.target}, not the real copy at ${canonical}`,
        });
      }
    }
  }
  return problems;
}
