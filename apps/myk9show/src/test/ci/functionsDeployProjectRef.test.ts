// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guard for LESSON functions-deploy-workdir (MYK9-1708, split from MYK9-1654).
 *
 * `supabase functions deploy --workdir apps/myk9show` follows that dir's
 * tracked `.temp/project-ref`. A command copied from a doc without
 * `--project-ref` deploys to whatever that file (or the local link) names, and
 * untracking `.temp/*` silently changes the target. Two checks:
 *   1. every runnable `supabase functions deploy <name>` in tracked files
 *      carries `--project-ref sojmvhhwsjxmfistvzbe` in the same statement;
 *   2. `apps/myk9show/supabase/.temp/project-ref` stays tracked and correct.
 *
 * "Runnable" means a function-name token follows `deploy`. Prose such as
 * "`supabase functions deploy` is manual" has no such token and is ignored.
 * A token counts as a name when it has a hyphen (every function here does),
 * is a `<placeholder>`, or matches a function directory. Single-word prose
 * ("and", "per") therefore never trips it.
 */

const REPO_ROOT = resolve(__dirname, '../../../../..');
export const PROJECT_REF = 'sojmvhhwsjxmfistvzbe';
const TRACKED_REF_FILE = 'apps/myk9show/supabase/.temp/project-ref';
const SCANNED = ['*.sh', '*.md', '*.ts', '*.yml', '*.yaml', '*.json'];
/** Frozen history: archived docs and archived OpenSpec changes are never edited. */
const EXCLUDED_PREFIXES = ['docs/archive/', 'openspec/changes/archive/'];
/** This file holds the known-answer fixtures, which are deliberately flagless. */
const SELF = 'apps/myk9show/src/test/ci/functionsDeployProjectRef.test.ts';

export interface Violation {
  line: number;
  text: string;
}

function functionDirNames(): Set<string> {
  const names = new Set<string>();
  for (const dir of ['supabase/functions', 'apps/myk9show/supabase/functions']) {
    for (const e of readdirSync(join(REPO_ROOT, dir), { withFileTypes: true })) {
      if (e.isDirectory() && !e.name.startsWith('_')) names.add(e.name);
    }
  }
  return names;
}

function isFunctionName(token: string, known: ReadonlySet<string>): boolean {
  return (
    /^<[^>]+>$/.test(token) ||
    (/^[a-z][a-z0-9_-]*$/.test(token) && (token.includes('-') || known.has(token)))
  );
}

/** Join lines ending in a shell `\` continuation into one statement. */
function statements(source: string): Array<{ line: number; text: string }> {
  const out: Array<{ line: number; text: string }> = [];
  const lines = source.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const start = i;
    let text = lines[i];
    while (/\\\s*$/.test(lines[i]) && i + 1 < lines.length) {
      i++;
      text += ' ' + lines[i].trim();
    }
    out.push({ line: start + 1, text });
  }
  return out;
}

export function findViolations(source: string, known: ReadonlySet<string>): Violation[] {
  const deploy = /supabase\s+functions\s+deploy\s+([^\s`'")]+)/g;
  const flag = new RegExp(`--project-ref[ =]${PROJECT_REF}(?![a-z0-9])`);
  const violations: Violation[] = [];
  for (const { line, text } of statements(source)) {
    for (const m of text.matchAll(deploy)) {
      if (!isFunctionName(m[1], known)) continue;
      // The statement from this command onward; a second command on the same
      // line needs its own flag, so cut at the next occurrence.
      const rest = text.slice(m.index).split(/supabase\s+functions\s+deploy/)[1] ?? '';
      if (!flag.test(rest)) violations.push({ line, text: text.trim() });
    }
  }
  return violations;
}

function trackedFiles(): string[] {
  const out = execFileSync('git', ['ls-files', '-z', '--', ...SCANNED], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return out
    .split('\0')
    .filter(Boolean)
    .filter(f => f !== SELF && !EXCLUDED_PREFIXES.some(p => f.startsWith(p)));
}

describe('functions deploy --project-ref guard (known answers)', () => {
  const known = new Set(['calendar-feed']);

  it('flags a deploy command with no --project-ref', () => {
    expect(
      findViolations('supabase functions deploy resend-webhook --no-verify-jwt', known)
    ).toHaveLength(1);
    expect(
      findViolations('// Deploy: supabase functions deploy calendar-feed --no-verify-jwt', known)
    ).toHaveLength(1);
  });

  it('passes when the flag is present on the same line', () => {
    const ok = `supabase functions deploy resend-webhook --project-ref ${PROJECT_REF} --no-verify-jwt`;
    expect(findViolations(ok, known)).toEqual([]);
  });

  it('follows shell line continuations, flagged and unflagged', () => {
    const ok = `supabase functions deploy a-b c-d \\\n  --workdir apps/myk9show \\\n  --project-ref ${PROJECT_REF}`;
    const bad = 'supabase functions deploy a-b c-d \\\n  --workdir apps/myk9show';
    expect(findViolations(ok, known)).toEqual([]);
    expect(findViolations(bad, known)).toEqual([{ line: 1, text: expect.any(String) }]);
  });

  it('rejects a wrong or longer project ref', () => {
    expect(
      findViolations('supabase functions deploy a-b --project-ref otherref', known)
    ).toHaveLength(1);
    expect(
      findViolations(`supabase functions deploy a-b --project-ref ${PROJECT_REF}x`, known)
    ).toHaveLength(1);
  });

  it('flags a placeholder name without the flag', () => {
    expect(
      findViolations('supabase functions deploy <function-name> --no-verify-jwt', known)
    ).toHaveLength(1);
  });

  it('ignores prose mentions with no function-name token', () => {
    expect(findViolations('`supabase functions deploy` is manual', known)).toEqual([]);
    expect(
      findViolations('and `supabase functions deploy` per the Auto-Mode rules', known)
    ).toEqual([]);
    expect(findViolations('supabase functions deploy are not pre-approved', known)).toEqual([]);
    expect(findViolations('Never run `supabase functions deploy`.', known)).toEqual([]);
  });

  it('requires the flag per command when two share a line', () => {
    const text = `supabase functions deploy a-b --project-ref ${PROJECT_REF}; supabase functions deploy c-d`;
    expect(findViolations(text, known)).toHaveLength(1);
  });
});

describe('functions deploy --project-ref guard (repo)', () => {
  it('every documented deploy command passes --project-ref', () => {
    const known = functionDirNames();
    const offenders: string[] = [];
    for (const file of trackedFiles()) {
      const source = readFileSync(join(REPO_ROOT, file), 'utf8');
      for (const v of findViolations(source, known)) offenders.push(`${file}:${v.line}: ${v.text}`);
    }
    expect(offenders).toEqual([]);
  });

  it('keeps apps/myk9show/supabase/.temp/project-ref tracked and correct', () => {
    const tracked = execFileSync('git', ['ls-files', '--', TRACKED_REF_FILE], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    }).trim();
    expect(tracked).toBe(TRACKED_REF_FILE);
    expect(readFileSync(join(REPO_ROOT, TRACKED_REF_FILE), 'utf8').trim()).toBe(PROJECT_REF);
  });
});
