/**
 * Fail loudly when a scheduled task's INSTALLED prompt has drifted from the
 * version-controlled prompt block that claims to be its source of truth.
 *
 * The installed prompts live at `~/.claude/scheduled-tasks/<taskId>/SKILL.md`,
 * outside this repo, on one machine. Nothing keeps them in step with the docs
 * that carry them — the handoff is "edit the doc, then update the task", by
 * hand, and it has failed silently more than once: MYK9-408 (an installed
 * prompt still asserted the Codex stream was paused for token budget, months
 * after it resumed) and MYK9-391 (a scheduled walk pointed at a login fixture
 * that had been deleted). A stale prompt is not a stale document — it is an
 * instruction a future unattended run will follow.
 *
 * The contract this enforces is deliberately mechanical: an installed
 * `SKILL.md` is the documented fenced block, byte for byte, with a YAML
 * frontmatter block (`name` / `description`) prepended. Everything the run
 * needs — including the `Working directory:` line — lives inside the fenced
 * block, so the comparison has no "explained difference" carve-outs to argue
 * about.
 *
 * This cannot run in CI: the installed files are machine-local, and a CI runner
 * has none of them. It is a local pre-flight, run before and after touching a
 * prompt. A machine with no tasks installed reports SKIPPED for each one rather
 * than a silent pass; `--require-installed` turns that into a failure for the
 * machine that actually owns them.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { pathToFileURL } from 'node:url';

/**
 * Declared, not discovered. A scan of "which docs look like they hold prompts"
 * would silently stop covering a task the day someone renamed a heading; an
 * omission from this list is meant to be a visible edit, and an entry whose
 * block cannot be found is a hard error rather than a skip.
 */
export const REGISTERED_TASKS: readonly TaskRegistration[] = [
  { taskId: 'claude-security-audit', doc: 'docs/operations/scheduled-audits-claude.md' },
  { taskId: 'claude-findings-reconcile', doc: 'docs/operations/scheduled-audits-claude.md' },
  { taskId: 'claude-daily-commit-review', doc: 'docs/operations/scheduled-audits-claude.md' },
  { taskId: 'secretary-task-walk', doc: 'docs/operations/scheduled-task-walks.md' },
  { taskId: 'exhibitor-task-walk', doc: 'docs/operations/scheduled-task-walks.md' },
  { taskId: 'role-intent-walk', doc: 'docs/operations/scheduled-task-walks.md' },
];

export interface TaskRegistration {
  taskId: string;
  doc: string;
}

export type ParityStatus = 'match' | 'drift' | 'not-installed';

export interface ParityResult {
  taskId: string;
  doc: string;
  status: ParityStatus;
  /** Human-readable first divergence, present only when `status` is `drift`. */
  detail?: string;
}

/**
 * Pull the prompt block for `taskId` out of a doc.
 *
 * The heading is matched on its own line rather than with `indexOf`, because a
 * substring search finds the taskId inside prose that merely mentions the task
 * and then reads the wrong fence entirely. Fence length is matched too: the
 * walks doc uses ```` fences because its prompts contain ``` fences of their own.
 */
export function extractPromptBlock(markdown: string, taskId: string): string {
  const lines = markdown.split('\n');
  const needle = '`' + taskId + '`';
  const headingIndex = lines.findIndex(line => /^#{2,4} /.test(line) && line.includes(needle));
  if (headingIndex === -1) {
    throw new Error(`no heading naming \`${taskId}\``);
  }

  let openIndex = -1;
  let fence = '';
  for (let i = headingIndex + 1; i < lines.length; i += 1) {
    const match = /^(`{3,})\s*$/.exec(lines[i]);
    if (match) {
      openIndex = i;
      fence = match[1];
      break;
    }
    // A following heading of the same or higher level means this task's section
    // ended without a prompt block.
    if (/^#{1,4} /.test(lines[i]) && headingLevel(lines[i]) <= headingLevel(lines[headingIndex])) {
      break;
    }
  }
  if (openIndex === -1) {
    throw new Error(`no prompt block under the \`${taskId}\` heading`);
  }

  const closeIndex = lines.findIndex((line, i) => i > openIndex && line.trimEnd() === fence);
  if (closeIndex === -1) {
    throw new Error(`unterminated prompt block for \`${taskId}\``);
  }

  return lines
    .slice(openIndex + 1, closeIndex)
    .join('\n')
    .replace(/\n+$/, '');
}

function headingLevel(line: string): number {
  return (/^(#+) /.exec(line)?.[1].length as number) ?? 99;
}

/** Drop the leading YAML frontmatter — the one part an installed file adds. */
export function stripFrontmatter(skill: string): string {
  const match = /^---\n[\s\S]*?\n---\n+/.exec(skill);
  if (!match) {
    throw new Error('installed SKILL.md has no YAML frontmatter');
  }
  return skill.slice(match[0].length).replace(/\n+$/, '');
}

/** First line that differs, with its line number, for a legible failure. */
export function describeDivergence(documented: string, installed: string): string {
  const a = documented.split('\n');
  const b = installed.split('\n');
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    if (a[i] !== b[i]) {
      return [
        `first divergence at line ${i + 1}`,
        `  documented: ${a[i] === undefined ? '<end of block>' : JSON.stringify(a[i])}`,
        `  installed:  ${b[i] === undefined ? '<end of file>' : JSON.stringify(b[i])}`,
      ].join('\n');
    }
  }
  return 'blocks differ only in trailing whitespace';
}

export interface CheckOptions {
  repoRoot: string;
  /** Root holding `<taskId>/SKILL.md`; defaults to `~/.claude/scheduled-tasks`. */
  installRoot?: string;
  tasks?: readonly TaskRegistration[];
}

export function checkPromptParity(options: CheckOptions): ParityResult[] {
  const installRoot = options.installRoot ?? join(homedir(), '.claude', 'scheduled-tasks');
  const tasks = options.tasks ?? REGISTERED_TASKS;

  return tasks.map(({ taskId, doc }) => {
    const docPath = join(options.repoRoot, doc);
    if (!existsSync(docPath)) {
      throw new Error(`check-prompt-parity: ${doc} does not exist (registered for ${taskId})`);
    }
    // A missing or unreadable block throws: a registered task that has lost its
    // documented prompt is a failure, never a skip.
    const documented = extractPromptBlock(readFileSync(docPath, 'utf8'), taskId);

    const skillPath = join(installRoot, taskId, 'SKILL.md');
    if (!existsSync(skillPath)) {
      return { taskId, doc, status: 'not-installed' as const };
    }

    const installed = stripFrontmatter(readFileSync(skillPath, 'utf8'));
    return documented === installed
      ? { taskId, doc, status: 'match' as const }
      : {
          taskId,
          doc,
          status: 'drift' as const,
          detail: describeDivergence(documented, installed),
        };
  });
}

export function runCli(repoRoot: string, argv: readonly string[] = []): number {
  const requireInstalled = argv.includes('--require-installed');
  let results: ParityResult[];
  try {
    results = checkPromptParity({ repoRoot });
  } catch (error) {
    console.error(`check-prompt-parity: ${(error as Error).message}`);
    return 1;
  }

  for (const result of results) {
    if (result.status === 'match') console.log(`  OK           ${result.taskId}`);
    else if (result.status === 'not-installed')
      console.log(`  SKIPPED      ${result.taskId} — not installed on this machine`);
    else console.error(`  DRIFT        ${result.taskId} (${result.doc})`);
  }

  const drifted = results.filter(r => r.status === 'drift');
  if (drifted.length > 0) {
    console.error(
      '\ncheck-prompt-parity: installed prompts have drifted from their source of truth:'
    );
    for (const result of drifted) {
      console.error(`\n${result.taskId}:\n${result.detail}`);
    }
    console.error(
      '\nEdit the doc block first, then copy it verbatim into ' +
        '~/.claude/scheduled-tasks/<taskId>/SKILL.md below the frontmatter.'
    );
    return 1;
  }

  const missing = results.filter(r => r.status === 'not-installed');
  if (missing.length > 0 && requireInstalled) {
    console.error(
      `\ncheck-prompt-parity: --require-installed, but ${missing.length} task(s) are not installed here.`
    );
    return 1;
  }
  if (missing.length === results.length) {
    console.log(
      '\ncheck-prompt-parity: SKIPPED — no scheduled tasks are installed on this machine. ' +
        'This check only means something where the tasks actually run.'
    );
    return 0;
  }

  console.log(`\ncheck-prompt-parity: ${results.length - missing.length} prompt(s) in parity.`);
  return 0;
}

export function findWorkspaceRoot(from: string): string {
  let dir = resolve(from);
  for (;;) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = dirname(dir);
    if (parent === dir)
      throw new Error(`check-prompt-parity: no pnpm-workspace.yaml above ${from}`);
    dir = parent;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = runCli(
    findWorkspaceRoot(process.env.MYK9_REPO_ROOT ?? process.cwd()),
    process.argv.slice(2)
  );
}
