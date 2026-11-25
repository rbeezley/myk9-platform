/**
 * MYK9-2397: fail when a user guide quotes UI text the app no longer has.
 *
 * Guides write UI labels in bold (**Show Desk**) or quotes ("N pending"). Each such span is
 * looked up, case-insensitively and whitespace-normalized, in the app's source text
 * (apps/myk9show/src and packages/<pkg>/src, tests excluded). A span found nowhere fails with
 * `file:line`. Intentional non-UI quotes live in `guide-ui-strings.allowlist.json`.
 *
 * Usage: tsx scripts/qa/guide-ui-strings.ts   (exit 1 on any unmatched span)
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export interface Allowlist {
  /** Quotes that are not UI (dog names, sample data, keys, registry names). */
  nonUi: string[];
  /** Strings a guide still names that the app removed. Fix the guide, then delete the entry. */
  knownDrift: string[];
}

export interface Finding {
  file: string;
  line: number;
  text: string;
}

const SPAN_PATTERNS = [/\*\*([^*\n]+)\*\*/g, /"([^"\n]+)"/g, /“([^”\n]+)”/g];
const SKIP_EXT = /\.(test|spec)\.tsx?$|\.d\.ts$/;

/** Lowercase, straighten quotes, drop escapes and entities, collapse whitespace. */
export function normalize(s: string): string {
  return s
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\\(['"`])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function walk(dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name === '__tests__' || name === 'test')
      continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(name) && !SKIP_EXT.test(name)) out.push(full);
  }
}

/** One normalized blob of every source file under the given roots. */
export function buildCorpus(roots: string[]): string {
  const files: string[] = [];
  for (const root of roots) walk(root, files);
  return normalize(files.map(f => readFileSync(f, 'utf8')).join('\n'));
}

/** Candidate label parts of a span: "A → B" is two labels; trailing punctuation is not part. */
function labelParts(span: string): string[] {
  return span
    .split(/\s*(?:→|->|>)\s*/)
    .map(p => p.replace(/^[\s.,;:!?()]+|[\s.,;:!?()]+$/g, ''))
    .filter(p => /[a-z]/i.test(p) && p.length >= 3 && p.split(/\s+/).length <= 5);
}

export function checkGuide(
  file: string,
  markdown: string,
  corpus: string,
  allow: Allowlist
): Finding[] {
  const skip = new Set([...allow.nonUi, ...allow.knownDrift].map(normalize));
  // A guide's own headings are cross-references, not app UI.
  const headings = new Set(
    [...markdown.matchAll(/^#{1,6}\s+(.+)$/gm)].map(h =>
      normalize((h[1] ?? '').replace(/[*`]/g, ''))
    )
  );
  const findings: Finding[] = [];
  let fenced = false;
  markdown.split('\n').forEach((raw, i) => {
    if (/^\s*```/.test(raw)) fenced = !fenced;
    // Image alt text and link targets are not UI quotes.
    const line = raw.replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\]\([^)]*\)/g, ']');
    if (fenced || /^\*\*Status:\*\*/.test(line)) return;
    // A line that is only a bold phrase is a sub-heading, a question or a lead-in, not a control.
    if (/^\s*(?:[-*]\s+)?\*\*[^*]+\*\*[.:]?\s*$/.test(line) && !/^\s*[-*]\s+/.test(line)) return;
    for (const pattern of SPAN_PATTERNS) {
      for (const m of line.matchAll(pattern)) {
        if (/\?$/.test((m[1] ?? '').trim())) continue;
        for (const part of labelParts(m[1] ?? '')) {
          const key = normalize(part);
          if (skip.has(key) || headings.has(key) || corpus.includes(key)) continue;
          findings.push({ file, line: i + 1, text: part });
        }
      }
    }
  });
  return findings;
}

export function checkGuides(guideDir: string, sourceRoots: string[], allow: Allowlist): Finding[] {
  const corpus = buildCorpus(sourceRoots);
  const out: Finding[] = [];
  for (const name of readdirSync(guideDir).sort()) {
    if (!name.endsWith('.md') || name.endsWith('-outline.md')) continue;
    if (!/-guide\.md$|quickstart\.md$/.test(name)) continue;
    const full = join(guideDir, name);
    out.push(...checkGuide(full, readFileSync(full, 'utf8'), corpus, allow));
  }
  return out;
}

export function repoSourceRoots(root: string): string[] {
  const roots = [join(root, 'apps/myk9show/src')];
  for (const pkg of readdirSync(join(root, 'packages'))) {
    const src = join(root, 'packages', pkg, 'src');
    try {
      if (statSync(src).isDirectory()) roots.push(src);
    } catch {
      // package without a src directory
    }
  }
  return roots;
}

function main(): void {
  const root = resolve(import.meta.dirname, '../..');
  const allow = JSON.parse(
    readFileSync(join(root, 'scripts/qa/guide-ui-strings.allowlist.json'), 'utf8')
  ) as Allowlist;
  const findings = checkGuides(join(root, 'docs/user-guides'), repoSourceRoots(root), allow);
  for (const f of findings) {
    console.error(`${relative(root, f.file)}:${f.line}  "${f.text}" matches no string in the app`);
  }
  if (findings.length > 0) {
    console.error(
      `\n${findings.length} guide quote(s) match nothing in the app. Fix the guide, or add a non-UI quote to ` +
        'scripts/qa/guide-ui-strings.allowlist.json (nonUi).'
    );
    process.exit(1);
  }
  console.log('guide-ui-strings: every quoted UI string exists in the app');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
