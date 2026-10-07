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
 * Commands are lexed quote-aware (see `tokenize`): this repo lives under
 * "AI Projects", and a guard that splits on whitespace is off for every quoted
 * path (LESSONS guard-word-split). Known-answer fixtures live in
 * logs-path-guard.test.ts.
 */

import { pathToFileURL } from 'node:url';

type Token =
  | { kind: 'word'; value: string }
  | { kind: 'sep' }
  // write: `>` `>>` `>|` `&>` `&>>`; read: `<` `<<<`; dup: `>&N`, `<&N`
  | { kind: 'redirect'; mode: 'write' | 'read' | 'dup' }
  | { kind: 'heredoc'; stripTabs: boolean };

/**
 * A small quote-aware shell lexer: just enough to know which words are WRITE
 * targets. Adjacent quoted and bare segments join into one word
 * (`"/a b"/.logs-x.txt` is one path); text inside quotes is never an operator;
 * `;`, `|`, `&`, `(`, `)` and newlines end a command; heredoc bodies are
 * skipped, so prose in them is not parsed as commands. It is not a full shell
 * parser (no `$(…)` nesting or `case` syntax) — a regex version of this guard
 * both denied quoted prose and missed mixed-quote paths (Codex review, #2812).
 */
export function tokenize(command: string): Token[] {
  const tokens: Token[] = [];
  const pendingHeredocs: Array<{ delimiter: string; stripTabs: boolean }> = [];
  let word = '';
  let inWord = false;
  let awaitingHeredocDelimiter: boolean | null = null;
  let i = 0;

  const endWord = (): void => {
    if (!inWord) return;
    if (awaitingHeredocDelimiter !== null) {
      pendingHeredocs.push({ delimiter: word, stripTabs: awaitingHeredocDelimiter });
      awaitingHeredocDelimiter = null;
    } else {
      tokens.push({ kind: 'word', value: word });
    }
    word = '';
    inWord = false;
  };

  const skipHeredocBodies = (): void => {
    while (pendingHeredocs.length > 0 && i < command.length) {
      const { delimiter, stripTabs } = pendingHeredocs[0]!;
      const lineEnd = command.indexOf('\n', i);
      const stop = lineEnd === -1 ? command.length : lineEnd;
      const line = command.slice(i, stop);
      i = stop + 1;
      if ((stripTabs ? line.replace(/^\t+/, '') : line) === delimiter) pendingHeredocs.shift();
    }
  };

  while (i < command.length) {
    const c = command[i]!;
    const next = command[i + 1];
    if (c === '\\') {
      if (next === '\n') i += 2;
      else {
        word += next ?? '';
        inWord = true;
        i += 2;
      }
    } else if (c === "'") {
      const close = command.indexOf("'", i + 1);
      const stop = close === -1 ? command.length : close;
      word += command.slice(i + 1, stop);
      inWord = true;
      i = stop + 1;
    } else if (c === '"') {
      i += 1;
      while (i < command.length && command[i] !== '"') {
        if (command[i] === '\\' && i + 1 < command.length) i += 1;
        word += command[i];
        i += 1;
      }
      inWord = true;
      i += 1;
    } else if (c === ' ' || c === '\t') {
      endWord();
      i += 1;
    } else if (c === '\n') {
      endWord();
      tokens.push({ kind: 'sep' });
      i += 1;
      skipHeredocBodies();
    } else if (c === '>' || c === '<' || (c === '&' && next === '>')) {
      // A bare run of digits glued to the operator is its fd (`2>`), not a word.
      if (inWord && /^\d+$/.test(word) && /\d/.test(command[i - 1] ?? '')) {
        word = '';
        inWord = false;
      }
      endWord();
      const op = /^(?:&>>?|<<<|<<-?|<&|>&|>>|>\||<>|>|<)/.exec(command.slice(i))![0];
      i += op.length;
      if (op === '<<' || op === '<<-') {
        awaitingHeredocDelimiter = op === '<<-';
        tokens.push({ kind: 'heredoc', stripTabs: op === '<<-' });
      } else if (op === '>&' || op === '<&') {
        tokens.push({ kind: 'redirect', mode: 'dup' });
      } else if (op === '<' || op === '<<<') {
        tokens.push({ kind: 'redirect', mode: 'read' });
      } else {
        tokens.push({ kind: 'redirect', mode: 'write' });
      }
    } else if (c === ';' || c === '|' || c === '&' || c === '(' || c === ')') {
      endWord();
      tokens.push({ kind: 'sep' });
      i += 1;
    } else {
      word += c;
      inWord = true;
      i += 1;
    }
  }
  endWord();
  return tokens;
}

/** True when the path's last segment is a `.logs-*` FILE (not `.logs/…`). */
function isStrayLogPath(path: string): boolean {
  const base = path.split('/').at(-1) ?? '';
  return /^\.logs-[^/]+$/.test(base);
}

/** Every path a command writes to: redirect targets and `tee` file operands. */
export function writeTargets(command: string): string[] {
  const targets: string[] = [];
  let atCommandStart = true;
  let inTee = false;
  let redirect: 'write' | 'read' | 'dup' | null = null;
  for (const token of tokenize(command)) {
    if (token.kind === 'sep') {
      atCommandStart = true;
      inTee = false;
      redirect = null;
    } else if (token.kind === 'redirect') {
      redirect = token.mode;
    } else if (token.kind === 'word') {
      if (redirect !== null) {
        // `>&2` duplicates an fd; `>& file` (no fd number) is bash for `&> file`.
        const isFd = /^(?:\d+-?|-)$/.test(token.value);
        if (redirect === 'write' || (redirect === 'dup' && !isFd)) targets.push(token.value);
        redirect = null;
      } else if (atCommandStart) {
        if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(token.value)) continue; // FOO=bar cmd
        atCommandStart = false;
        inTee = token.value.split('/').at(-1) === 'tee';
      } else if (inTee && !token.value.startsWith('-')) {
        targets.push(token.value);
      }
    }
  }
  return targets;
}

/** The write targets of a command that are stray `.logs-*` files, in order. */
export function findStrayLogWrites(command: string): string[] {
  return writeTargets(command).filter(isStrayLogPath);
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
