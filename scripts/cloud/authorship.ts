/**
 * Which harness wrote a PR, and therefore which one reviews it (MYK9-1398;
 * docs/plan-cloud-agent-workflow.md Task 2.1). The branch prefix declares the
 * author (`claude/` or `codex/`, owner decision 2026-10-24), but a PR controls
 * its own branch name, so every commit's `Co-Authored-By:` trailer must agree.
 *
 * Fail closed: anything this cannot attribute with certainty is refused with a
 * reason a person can act on. Nothing here guesses a reviewer.
 *
 * Merge commits are skipped: a `git merge origin/main` brings in base-branch
 * work and carries no trailer. Any non-base commit a merge brings in is itself
 * in the PR's commit list, so it is still checked.
 */

export type Harness = 'claude' | 'codex';

/** One entry of the PR's commit list (`GET /repos/{o}/{r}/pulls/{n}/commits`). */
export type AuthoredCommit = { sha: string; parentCount: number; message: string };

export type Authorship = { implementer: Harness; reviewer: Harness } | { refused: string };

const PREFIXES: Record<string, Harness> = { 'claude/': 'claude', 'codex/': 'codex' };
const OTHER: Record<Harness, Harness> = { claude: 'codex', codex: 'claude' };

// The display name is the signal: Codex has signed as noreply@openai.com,
// codex@openai.com and noreply@anthropic.com, so the address cannot be.
const CO_AUTHOR = /^co-authored-by:[ \t]*(.+?)[ \t]*<[^>\n]*>[ \t]*$/i;
const TRAILER_LINE = /^[A-Za-z0-9-]+:[ \t]/;
const HARNESS_NAME: [RegExp, Harness][] = [
  [/^claude\b/i, 'claude'],
  [/^codex\b/i, 'codex'],
];

/**
 * The message's trailer block: its last paragraph, when that is not the
 * subject and every line in it is `Key: value` (Codex, #3284: a body that
 * quotes a trailer is prose, not authorship). Stricter than git, which allows
 * some non-trailer lines; a looser block here could only add a harness, so
 * anything ambiguous yields no block and the commit is refused.
 */
function trailerBlock(message: string): string[] {
  const paragraphs = message.trimEnd().split(/\n[ \t]*\n/);
  if (paragraphs.length < 2) return [];
  const lines = (paragraphs[paragraphs.length - 1] ?? '').split('\n');
  return lines.every(line => TRAILER_LINE.test(line)) ? lines : [];
}

function trailerHarnesses(message: string): Set<Harness> {
  const found = new Set<Harness>();
  for (const line of trailerBlock(message)) {
    const name = CO_AUTHOR.exec(line)?.[1] ?? '';
    for (const [pattern, harness] of HARNESS_NAME) if (pattern.test(name)) found.add(harness);
  }
  return found;
}

export function resolveAuthorship(input: {
  branch: string;
  commits: AuthoredCommit[];
}): Authorship {
  const prefix = Object.keys(PREFIXES).find(p => input.branch.startsWith(p));
  if (!prefix) {
    return {
      refused: `branch "${input.branch}" does not start with claude/ or codex/, so its author is undeclared`,
    };
  }
  const implementer = PREFIXES[prefix] as Harness;

  const authored = input.commits.filter(c => c.parentCount < 2);
  if (authored.length === 0) return { refused: 'no commits to attribute (merge commits only)' };

  for (const c of authored) {
    const harnesses = trailerHarnesses(c.message);
    const sha = c.sha.slice(0, 9);
    if (harnesses.size === 0) {
      return { refused: `commit ${sha} carries no Claude or Codex Co-Authored-By trailer` };
    }
    if (harnesses.size > 1) return { refused: `commit ${sha} names both Claude and Codex` };
    if (!harnesses.has(implementer)) {
      return {
        refused: `commit ${sha} was written by ${[...harnesses][0]}, but the ${prefix} branch declares ${implementer}`,
      };
    }
  }
  return { implementer, reviewer: OTHER[implementer] };
}
