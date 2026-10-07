/**
 * PreToolUse(Bash) hook: refuse a command that writes a log to `.logs-<name>`
 * instead of `.logs/<name>`.
 *
 * CLAUDE.md says check output goes to `.logs/` at the worktree root (gitignored,
 * per-worktree). Agents kept typing `> .logs-w-2790.txt` instead, one character
 * off: the file is NOT ignored, lands wherever the shell happens to be (usually
 * the primary checkout), and 47 of them had piled up in its `git status` by
 * 2026-10-07. No script wrote them; every one was a hand-typed redirect, so the
 * only place to catch it is the command itself.
 *
 * Only WRITES are refused (`>`, `>>`, `2>`, `&>`, `tee`). Reading an old
 * `.logs-*.txt` stays allowed so a session can still inspect what it wrote.
 *
 * Words are read quote-aware: this repo lives under "AI Projects", and a guard
 * that splits on whitespace is off for every quoted path (LESSONS
 * guard-word-split). Known-answer fixtures live in logs-path-guard.test.ts.
 */

import { pathToFileURL } from 'node:url';

// One shell word: double-quoted, single-quoted, or a bare run of non-separators.
const WORD = String.raw`"(?:[^"\\]|\\.)*"|'[^']*'|(?:[^\s"';|&<>()\\]|\\.)+`;

// `>`, `>>`, `1>`, `2>>`, `&>`, `&>>`; never `>&` (an fd dup such as `2>&1`).
const REDIRECT = new RegExp(String.raw`(?:^|[^<>&\d])(?:\d|&)?>>?(?!&)\s*(${WORD})`, 'g');
const TEE = new RegExp(String.raw`\btee((?:\s+(?:${WORD}))+)`, 'g');
const WORD_ONLY = new RegExp(WORD, 'g');

function unquote(word: string): string {
  if (word.length >= 2 && (word[0] === '"' || word[0] === "'") && word.at(-1) === word[0]) {
    return word.slice(1, -1);
  }
  return word;
}

/** True when the path's last segment is a `.logs-*` FILE (not `.logs/…`). */
function isStrayLogPath(path: string): boolean {
  const base = path.split('/').at(-1) ?? '';
  return /^\.logs-[^/]+$/.test(base);
}

/** The write targets of a command that are stray `.logs-*` files, in order. */
export function findStrayLogWrites(command: string): string[] {
  const targets: string[] = [];
  for (const match of command.matchAll(REDIRECT)) {
    targets.push(unquote(match[1] ?? ''));
  }
  for (const match of command.matchAll(TEE)) {
    for (const word of (match[1] ?? '').match(WORD_ONLY) ?? []) {
      if (!word.startsWith('-')) targets.push(unquote(word));
    }
  }
  return targets.filter(isStrayLogPath);
}

/** `../../.logs-w-2790.txt` → `../../.logs/w-2790.txt`. */
export function suggestedPath(target: string): string {
  return target.replace(/\.logs-([^/]+)$/, '.logs/$1');
}

export function denyReason(targets: readonly string[]): string {
  const lines = targets.map(t => `  ${t}  ->  ${suggestedPath(t)}`);
  return [
    'Logs go in .logs/ (gitignored, one per worktree), not .logs-<name> files, which land untracked in the checkout.',
    'Rewrite the redirect:',
    ...lines,
    'Create the directory first if needed: mkdir -p .logs',
  ].join('\n');
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

async function main(): Promise<void> {
  let command = '';
  try {
    const input = JSON.parse(await readStdin()) as { tool_input?: { command?: unknown } };
    command = typeof input.tool_input?.command === 'string' ? input.tool_input.command : '';
  } catch (error) {
    // A guard that blocks every Bash call on a parse error is worse than none;
    // say so on stderr (shown to the user) and allow.
    process.stderr.write(
      `logs-path-guard could not read hook input, not checking: ${String(error)}\n`
    );
    return;
  }
  const targets = findStrayLogWrites(command);
  if (targets.length === 0) return;
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: denyReason(targets),
      },
    })
  );
}

// pathToFileURL, not a `file://` template: the repo path has a space, which a
// URL encodes as %20, so a hand-built comparison never matches and the hook
// silently allows everything.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
