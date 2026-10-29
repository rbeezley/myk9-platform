/**
 * PreToolUse guard: refuse foreground Bash commands that wait on CI by hand.
 *
 * Why this exists (MYK9-1481). CLAUDE.md Gates step 4 already says to use
 * `scripts/qa/watch-pr-checks.sh` and never hand-poll, but that rule is a
 * sentence. Local Claude Code transcripts for 2026-09-01..10-29 hold 3,674
 * `sleep N` calls (41 h of a blocked session) and 3,207 `gh run view/watch`
 * calls, against 1,365 runs of the watcher. A program enforces what a sentence
 * only asks for.
 *
 * What it refuses, only when the command runs in the FOREGROUND:
 *   - `sleep` of SLEEP_LIMIT_SECONDS or more, or of a length it cannot read
 *   - any `sleep` inside a `while`/`until`/`for` loop body (a poll loop at any interval)
 *   - `gh run watch`, and `gh pr checks --watch`
 * It judges the simple commands of the command line itself, nothing nested.
 * Accepted misses, by design (two Codex rounds on #3384 showed each nested form
 * reopens the parser, and the transcripts show agents poll with top-level sleeps
 * and loops, not these): a sleep inside double-quoted `$(...)` or backticks,
 * `bash -c '...'`, a heredoc body (always data), xargs, find -exec, sudo, ssh,
 * and a gh flag between command levels (`gh run --repo x watch`: 0 of 3,937
 * gh run/pr calls in the transcripts, Codex round 3).
 * A command with `run_in_background: true` is always allowed: that is the
 * endorsed way to wait, and the harness notifies the session when it exits.
 * One `gh pr checks <pr>` read, `gh run view --log-failed`, and a `sleep`
 * inside a script file the agent runs are all allowed.
 *
 * The hook fails OPEN: if this script cannot run, Claude Code treats the
 * non-zero, non-2 exit as a non-blocking error and the command proceeds. That
 * is deliberate for a cost guard; it must never stop a session from working.
 *
 * Tokenizing is quote-aware: this repo lives under "AI Projects", and a guard
 * that splits on whitespace misreads every path in it (LESSONS guard-word-split).
 */

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/** Sleeps at least this long in the foreground are refused. */
export const SLEEP_LIMIT_SECONDS = 10;

export const DENY_REASON =
  'Waiting on CI in the foreground blocks this session (MYK9-1481). ' +
  'Run `bash scripts/qa/watch-pr-checks.sh <pr>` with run_in_background: true and you are notified when it exits, ' +
  'or use Monitor for any other condition. A single `gh pr checks <pr>` read is still allowed.';

export interface Verdict {
  deny: boolean;
  /** Which rule fired, for tests and the deny message. */
  rule?: 'sleep' | 'sleep-in-loop' | 'gh-run-watch' | 'gh-pr-checks-watch';
}

type Token = { text: string; op: boolean };

/** Read a double-quoted string whose body starts at `from`: its text (data) and the index of the closing quote. */
function readDoubleQuoted(s: string, from: number): { text: string; end: number } {
  let text = '';
  let i = from;
  while (i < s.length && s[i] !== '"') {
    if (s[i] === '\\' && i + 1 < s.length) i += 1;
    text += s[i] ?? '';
    i += 1;
  }
  return { text, end: i };
}

// Unquoted `(`, `)` and backticks separate commands, so `(sleep 60)` and `echo $(sleep 60)` are still judged.
const OPERATORS = ['&&', '||', ';;', ';', '|', '&', '\n', '(', ')', '`'];

/**
 * Split a shell command into words and control operators, honouring single
 * quotes, double quotes and backslash escapes. It does not expand anything;
 * a guard only needs to know where one word ends and the next begins.
 * Heredoc bodies are data, not commands, so they are skipped: a file or commit
 * message written with `cat <<EOF` may contain `sleep 60` (pre-pass review, #3384).
 */
export function tokenize(command: string): Token[] {
  const tokens: Token[] = [];
  const heredocs: Array<{ delimiter: string; stripTabs: boolean }> = [];
  let word = '';
  let inWord = false;
  let i = 0;
  const flush = () => {
    if (inWord) tokens.push({ text: word, op: false });
    word = '';
    inWord = false;
  };
  const skipHeredocBodies = () => {
    for (const { delimiter, stripTabs } of heredocs) {
      while (i < command.length) {
        const end = command.indexOf('\n', i);
        const stop = end === -1 ? command.length : end;
        const line = command.slice(i, stop);
        i = stop + 1;
        if ((stripTabs ? line.replace(/^\t+/, '') : line) === delimiter) break;
      }
    }
    heredocs.length = 0;
  };
  while (i < command.length) {
    const ch = command[i];
    if (ch === "'") {
      const end = command.indexOf("'", i + 1);
      const stop = end === -1 ? command.length : end;
      word += command.slice(i + 1, stop);
      inWord = true;
      i = stop + 1;
      continue;
    }
    if (ch === '"') {
      const quoted = readDoubleQuoted(command, i + 1);
      word += quoted.text;
      inWord = true;
      i = quoted.end + 1;
      continue;
    }
    if (ch === '\\' && i + 1 < command.length) {
      if (command[i + 1] !== '\n') word += command[i + 1];
      inWord = inWord || command[i + 1] !== '\n';
      i += 2;
      continue;
    }
    if (ch === '#' && !inWord) {
      while (i < command.length && command[i] !== '\n') i += 1;
      continue;
    }
    if (command.startsWith('<<', i) && !command.startsWith('<<<', i)) {
      flush();
      i += 2;
      const stripTabs = command[i] === '-';
      if (stripTabs) i += 1;
      while (command[i] === ' ' || command[i] === '\t') i += 1;
      const m = /^(['"]?)([^\s'"<>;&|()`]+)\1/.exec(command.slice(i));
      if (m?.[2]) {
        heredocs.push({ delimiter: m[2], stripTabs });
        i += m[0].length;
      }
      continue;
    }
    // `2>&1` and `&>file` are redirections, not the `&` operator.
    const redirect = /^(>&|<&|&>>?)/.exec(command.slice(i, i + 3))?.[0];
    if (redirect) {
      word += redirect;
      inWord = true;
      i += redirect.length;
      continue;
    }
    const op = OPERATORS.find(o => command.startsWith(o, i));
    if (op) {
      flush();
      tokens.push({ text: op, op: true });
      i += op.length;
      if (op === '\n') skipHeredocBodies();
      continue;
    }
    if (ch === ' ' || ch === '\t') {
      flush();
      i += 1;
      continue;
    }
    word += ch;
    inWord = true;
    i += 1;
  }
  flush();
  return tokens;
}

/** Words that open or continue a compound command; the real command follows them. */
const KEYWORDS = new Set([
  'if',
  'then',
  'else',
  'elif',
  'fi',
  'do',
  'done',
  'while',
  'until',
  '!',
  '{',
  '}',
]);
/** Wrappers that run the rest of the words as the command, in the same foreground. */
const WRAPPERS = new Set(['command', 'exec', 'time', 'nohup', 'builtin']);

const LOOPS = new Set(['while', 'until', 'for', 'select']);

/**
 * The simple commands in a token stream, each with redirections, leading keywords,
 * assignments and wrappers removed, and whether it sits inside a loop body. Loop
 * keywords count only in command position, so `echo while` opens nothing.
 */
function simpleCommands(tokens: Token[]): Array<{ words: string[]; inLoop: boolean }> {
  const raw: string[][] = [];
  let current: string[] = [];
  for (const t of tokens) {
    if (t.op) {
      if (current.length) raw.push(current);
      current = [];
    } else {
      current.push(t.text);
    }
  }
  if (current.length) raw.push(current);

  const loops: string[] = [];
  const commands: Array<{ words: string[]; inLoop: boolean }> = [];
  for (const words of raw) {
    for (const w of words) {
      if (LOOPS.has(w)) loops.push(w);
      else if (w === 'done') loops.pop();
      else if (!KEYWORDS.has(w)) break;
    }
    const stripped = strip(withoutRedirections(words));
    if (stripped.length) commands.push({ words: stripped, inLoop: loops.length > 0 });
  }
  return commands;
}

/** Drop redirections (`>/dev/null`, `2>&1`, `> out.log`) so `sleep 2 >/dev/null` reads as `sleep 2`. */
function withoutRedirections(words: string[]): string[] {
  const kept: string[] = [];
  for (let i = 0; i < words.length; i += 1) {
    const w = words[i] ?? '';
    if (/^(\d*[<>]{1,2}|&>>?)&?$/.test(w))
      i += 1; // operator alone: its target is the next word
    else if (!/^(\d*[<>]|&>)/.test(w)) kept.push(w);
  }
  return kept;
}

function strip(words: string[]): string[] {
  const at = (n: number): string => words[n] ?? '';
  let i = 0;
  while (i < words.length) {
    const w = at(i);
    if (KEYWORDS.has(w) || WRAPPERS.has(w) || /^[A-Za-z_][A-Za-z0-9_]*=/.test(w)) {
      i += 1;
    } else if (w === 'env') {
      i += 1;
      while (i < words.length && (at(i).startsWith('-') || at(i).includes('='))) i += 1;
    } else if (w === 'timeout') {
      // `timeout [flags] DURATION cmd...`: the wait is the inner command's.
      i += 1;
      while (i < words.length && at(i).startsWith('-')) i += 1;
      i += 1;
    } else {
      break;
    }
  }
  return words.slice(i);
}

const UNIT_SECONDS: Record<string, number> = { '': 1, s: 1, m: 60, h: 3600, d: 86400 };

/** Total seconds a `sleep` argument list waits, or null when any argument is unreadable (a variable). */
export function sleepSeconds(args: string[]): number | null {
  let total = 0;
  for (const arg of args) {
    const m = /^(\d+(?:\.\d+)?|\.\d+)([smhd]?)$/.exec(arg);
    if (!m) return null;
    total += Number(m[1]) * (UNIT_SECONDS[m[2] ?? ''] ?? 1);
  }
  return total;
}

/** `gh [-R repo] <group> <sub> ...` → the words after the global flags. */
function ghArgs(words: string[]): string[] {
  const rest = words.slice(1);
  while (rest[0]?.startsWith('-')) {
    const flag = rest.shift();
    if ((flag === '-R' || flag === '--repo') && rest.length) rest.shift();
  }
  return rest;
}

export function evaluateCommand(command: string): Verdict {
  for (const { words, inLoop } of simpleCommands(tokenize(command))) {
    const name = (words[0] ?? '').split('/').pop();
    if (name === 'sleep') {
      if (inLoop) return { deny: true, rule: 'sleep-in-loop' };
      const seconds = sleepSeconds(words.slice(1));
      if (seconds === null || seconds >= SLEEP_LIMIT_SECONDS) return { deny: true, rule: 'sleep' };
    }
    if (name === 'gh') {
      const [group, sub, ...rest] = ghArgs(words);
      if (group === 'run' && sub === 'watch') return { deny: true, rule: 'gh-run-watch' };
      if (
        group === 'pr' &&
        sub === 'checks' &&
        rest.some(w => w === '--watch' || w.startsWith('--watch='))
      )
        return { deny: true, rule: 'gh-pr-checks-watch' };
    }
  }
  return { deny: false };
}

export interface HookInput {
  tool_name?: string;
  tool_input?: { command?: unknown; run_in_background?: unknown };
}

export function evaluateHook(input: HookInput): Verdict {
  if (input.tool_name !== 'Bash') return { deny: false };
  const command = input.tool_input?.command;
  if (typeof command !== 'string') return { deny: false };
  if (input.tool_input?.run_in_background === true) return { deny: false };
  return evaluateCommand(command);
}

function main(): number {
  const input = JSON.parse(readFileSync(0, 'utf8')) as HookInput;
  const verdict = evaluateHook(input);
  if (verdict.deny) {
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: `${DENY_REASON} (rule: ${verdict.rule})`,
        },
      })
    );
  }
  return 0;
}

// Run only as a CLI, so the test file can import the exports without side effects.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main();
}
