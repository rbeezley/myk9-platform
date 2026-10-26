/**
 * Issue janitor (MYK9-1434): plan which stranded In Progress claims return to
 * Todo and which In Review issues a deploy has closed out.
 *
 *   pnpm qa:issue-janitor --board .logs/board.json [--now <iso>]
 *       [--deployed-commit <sha>] [--apply]
 *
 * Default is a dry run that prints the plan. `--apply` adds the ordered list
 * of Linear MCP writes. Either way this script writes NOTHING: no Linear key
 * exists on this machine, and the scheduled session's allowlisted MCP tools
 * are the authorized write path (docs/operations/scheduled-audits-claude.md,
 * Task 4). It only reads: the board file, GitHub REST, and git.
 *
 * Board file: { "issues": [{ id, state, labels, updatedAt,
 *   comments: [{ createdAt, body }] }] } built from Linear `list_issues` (one call
 * per state) plus `list_comments` per issue, which is the tool that returns comments.
 *
 * Plan entries carry `writes` (run in order, never a Done write), `doneWrites`
 * (a to-done-candidate only: run after a fresh get_issue read shows every
 * criterion met) and `fallbackWrites` (In Progress candidates: run instead if a
 * criterion is unmet). Exit 0 clean, 1 when any GitHub read failed (that issue is
 * a skip whose reason starts `GitHub read failed:`), 2 on a usage or runtime error.
 */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { makeGitHubReader, readBranches } from './issue-janitor-github.ts';
import { planJanitor } from './issue-janitor-plan.ts';
import type { Board, McpWrite, PlanEntry } from './issue-janitor-types.ts';

export interface CliArgs {
  board: string;
  now: Date;
  deployedCommit?: string;
  apply: boolean;
}

export function parseArgs(argv: string[]): CliArgs {
  const value = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i === -1 ? undefined : argv[i + 1];
  };
  const board = value('--board');
  if (!board) throw new Error('--board <file> is required');
  const nowRaw = value('--now');
  const now = nowRaw ? new Date(nowRaw) : new Date();
  if (Number.isNaN(now.getTime())) throw new Error(`--now is not a date: ${nowRaw}`);
  return {
    board,
    now,
    deployedCommit: value('--deployed-commit'),
    apply: argv.includes('--apply'),
  };
}

export function summaryMarkdown(plan: PlanEntry[], mode: 'dry-run' | 'apply', now: Date): string {
  const changes = plan.filter(p => p.action !== 'skip');
  const lines = [`# Issue janitor ${mode} ${now.toISOString()}`, ''];
  if (changes.length === 0) lines.push('No state changes or comments planned.');
  for (const p of changes) lines.push(`- ${p.issue}: ${p.action}. ${p.reason}`);
  lines.push('', `Untouched: ${plan.length - changes.length} of ${plan.length}.`);
  const skipped = plan.filter(p => p.action === 'skip');
  for (const p of skipped) lines.push(`  - ${p.issue}: ${p.reason}`);
  return lines.join('\n');
}

export function orderedWrites(plan: PlanEntry[]): McpWrite[] {
  return plan.flatMap(p => p.writes);
}

export function render(plan: PlanEntry[], args: CliArgs): string {
  const mode = args.apply ? 'apply' : 'dry-run';
  // `writes` (ordered) never holds a Done write; each to-done-candidate carries its own doneWrites.
  const body = { mode, plan, ...(args.apply ? { writes: orderedWrites(plan) } : {}) };
  return `${summaryMarkdown(plan, mode, args.now)}\n\n\`\`\`json\n${JSON.stringify(body, null, 2)}\n\`\`\`\n`;
}

export function run(argv = process.argv.slice(2)): number {
  const args = parseArgs(argv);
  const board = JSON.parse(readFileSync(args.board, 'utf8')) as Board;
  const plan = planJanitor(board, makeGitHubReader(), readBranches(), args.now, {
    deployedCommit: args.deployedCommit,
  });
  process.stdout.write(render(plan, args));
  // A failed GitHub read is a skip in the plan, but the session must report it.
  return plan.some(p => p.reason.startsWith('GitHub read failed:')) ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = run();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 2;
  }
}
