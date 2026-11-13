/**
 * Narrow exemptions from the guardrail (`independent`) floor, decided from the
 * DIFF, never the file name (MYK9-1932). A file here still falls to its
 * ordinary floor (`adversarial`: tooling code), so it is never treated as docs.
 *
 * Two shapes qualify, and everything else keeps today's tier:
 *  - a ratchet baseline (`scripts/qa/*baseline*.json`) whose only effect is
 *    lowering counts or removing entries (raising a count, adding an entry or
 *    changing any non-numeric value does not qualify);
 *  - a file whose changed lines are all comments.
 * Fail closed: any file or diff that cannot be read is NOT exempt.
 */
import { execFileSync } from 'node:child_process';
import { extname } from 'node:path';

const BASELINE_PATTERN = /^scripts\/qa\/[^/]*baseline[^/]*\.json$/;

/** Keys whose value is never a ratchet count: pure bookkeeping or schema. */
const IGNORED_KEYS = new Set(['updatedAt']);
const MUST_MATCH_TOP_LEVEL_KEYS = new Set(['version']);

const SLASH_COMMENT_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
/** `#` is a comment here; in `.md` it is a heading and in `.json` it is data. */
const HASH_COMMENT_EXTENSIONS = new Set(['.sh', '.yml', '.yaml', '.toml', '']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isLoweringOnly(base: unknown, head: unknown, topLevel: boolean): boolean {
  if (typeof base === 'number' && typeof head === 'number') return head <= base;
  if (isRecord(base) && isRecord(head)) {
    for (const [key, headValue] of Object.entries(head)) {
      if (IGNORED_KEYS.has(key)) continue;
      // A key base lacks is an added entry: never an exemption.
      if (!(key in base)) return false;
      if (topLevel && MUST_MATCH_TOP_LEVEL_KEYS.has(key)) {
        if (JSON.stringify(base[key]) !== JSON.stringify(headValue)) return false;
        continue;
      }
      if (!isLoweringOnly(base[key], headValue, false)) return false;
    }
    return true;
  }
  // Strings, booleans, arrays, null and type changes must be identical.
  return JSON.stringify(base) === JSON.stringify(head);
}

/** True when `head` differs from `base` only by lower counts or removed entries. */
export function baselineChangeIsLoweringOnly(baseText: string, headText: string): boolean {
  let base: unknown;
  let head: unknown;
  try {
    base = JSON.parse(baseText);
    head = JSON.parse(headText);
  } catch {
    return false;
  }
  if (!isRecord(base) || !isRecord(head)) return false;
  return isLoweringOnly(base, head, true);
}

function lineIsComment(file: string, trimmed: string): boolean {
  const ext = extname(file).toLowerCase();
  if (SLASH_COMMENT_EXTENSIONS.has(ext)) {
    return /^(\/\/|\/\*|\*\/|\*(\s|$))/.test(trimmed);
  }
  // A shebang is code: it picks the interpreter.
  if (HASH_COMMENT_EXTENSIONS.has(ext)) return trimmed.startsWith('#') && !trimmed.startsWith('#!');
  return false;
}

/**
 * True when every added or removed line of a `-U0` unified diff is a comment
 * for this file's language. An empty diff is not an exemption.
 */
export function diffIsCommentOnly(file: string, unifiedDiff: string): boolean {
  let changed = 0;
  for (const line of unifiedDiff.split('\n')) {
    if (line.startsWith('+++') || line.startsWith('---')) continue;
    if (line[0] !== '+' && line[0] !== '-') continue;
    changed += 1;
    if (!lineIsComment(file, line.slice(1).trim())) return false;
  }
  return changed > 0;
}

interface GitOptions {
  cwd?: string;
}

function git(args: readonly string[], options: GitOptions): string {
  return execFileSync('git', [...args], {
    encoding: 'utf8',
    stdio: 'pipe',
    maxBuffer: 16 * 1024 * 1024,
    ...(options.cwd ? { cwd: options.cwd } : {}),
  });
}

function fileIsExempt(base: string, mergeBase: string, file: string, options: GitOptions): boolean {
  try {
    if (BASELINE_PATTERN.test(file)) {
      return baselineChangeIsLoweringOnly(
        git(['show', `${mergeBase}:${file}`], options),
        git(['show', `HEAD:${file}`], options)
      );
    }
    // --no-renames: a moved guardrail file reads as delete + add, never exempt
    // by similarity.
    const diff = git(
      ['diff', '-U0', '--no-color', '--no-renames', `${base}...HEAD`, '--', file],
      options
    );
    return diffIsCommentOnly(file, diff);
  } catch {
    return false;
  }
}

/**
 * The subset of `files` whose change against `base` qualifies for the
 * exemption. The caller must still decide which of them are guardrail paths:
 * an exempt file is only one whose guardrail classification may be skipped.
 */
export function exemptGuardrailFiles(
  base: string,
  files: readonly string[],
  options: GitOptions = {}
): Set<string> {
  const exempt = new Set<string>();
  let mergeBase: string;
  try {
    mergeBase = git(['merge-base', base, 'HEAD'], options).trim();
  } catch {
    return exempt;
  }
  for (const file of files) {
    if (fileIsExempt(base, mergeBase, file, options)) exempt.add(file);
  }
  return exempt;
}
