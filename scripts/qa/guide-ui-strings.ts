/**
 * MYK9-2397: fail when a user guide quotes UI text the app no longer has.
 *
 * Guides write UI labels in bold (**Show Desk**) or quotes ("N pending"). Each such span is
 * looked up, case-insensitively, whitespace-normalized and at word boundaries, in the app's string
 * literals and JSX text (apps/myk9show/src and packages/<pkg>/src, tests excluded; comments do not count). A span found nowhere fails with
 * `file:line`. Intentional non-UI quotes live in `guide-ui-strings.allowlist.json`.
 *
 * Usage: tsx scripts/qa/guide-ui-strings.ts   (exit 1 on any unmatched span)
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

export interface Allowlist {
  /** Quotes that are not UI (dog names, sample data, keys, registry names). */
  nonUi: string[];
  /**
   * Strings a guide still names that the app removed, scoped to the occurrences that exist now.
   * A new occurrence (another guide, or a higher count) fails. Fix the guide, then delete the entry.
   */
  knownDrift: DriftEntry[];
}

export interface DriftEntry {
  /** Guide path relative to the repo root, e.g. docs/user-guides/secretary-guide.md. */
  file: string;
  text: string;
  /** How many times the guide quotes it today. */
  count: number;
}

export interface Finding {
  file: string;
  line: number;
  text: string;
}

const SPAN_PATTERNS = [/\*\*([^*]+)\*\*/g, /"([^"]{1,200})"/g, /“([^”]{1,200})”/g];
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

/** Strings that never render: module specifiers, require()/import() arguments, type positions. */
function isNonUiString(node: ts.Node): boolean {
  if (!ts.isStringLiteralLike(node)) return false;
  const parent = node.parent;
  if (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent)) return true;
  if (ts.isExternalModuleReference(parent) || ts.isModuleDeclaration(parent)) return true;
  if (ts.isImportAttribute(parent)) return true;
  if (ts.isCallExpression(parent) && parent.arguments[0] === node) {
    const callee = parent.expression;
    if (callee.kind === ts.SyntaxKind.ImportKeyword) return true;
    if (ts.isIdentifier(callee) && callee.text === 'require') return true;
  }
  for (let n: ts.Node | undefined = parent; n; n = n.parent) {
    if (ts.isTypeNode(n)) return true;
    if (ts.isStatement(n)) break;
  }
  return false;
}

/** Every string literal, template static part, JSX text and JSX attribute string in a source file. */
export function collectStrings(fileName: string, text: string): string[] {
  const kind = fileName.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, kind);
  const out: string[] = [];
  const visit = (node: ts.Node): void => {
    if (isNonUiString(node)) return;
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node) ||
      ts.isJsxText(node)
    ) {
      out.push(node.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

/** The normalized UI strings of every source file under the given roots, one per line. */
export function buildCorpus(roots: string[]): string {
  const files: string[] = [];
  for (const root of roots) walk(root, files);
  const strings: string[] = [];
  for (const f of files) {
    for (const str of collectStrings(f, readFileSync(f, 'utf8'))) {
      const n = normalize(str);
      if (n) strings.push(n);
    }
  }
  return strings.join('\n');
}

const isWordChar = (c: string | undefined): boolean => c !== undefined && /[\p{L}\p{N}_]/u.test(c);

/** True when `key` occurs in the corpus with no letter or digit touching either end. */
export function corpusHas(corpus: string, key: string): boolean {
  let from = 0;
  for (;;) {
    const at = corpus.indexOf(key, from);
    if (at === -1) return false;
    const before = at === 0 ? undefined : corpus[at - 1];
    const after = corpus[at + key.length];
    const startOk = !isWordChar(key[0]) || !isWordChar(before);
    const endOk = !isWordChar(key[key.length - 1]) || !isWordChar(after);
    if (startOk && endOk) return true;
    from = at + 1;
  }
}

/** Candidate label parts of a span: "A → B" is two labels; edge punctuation is not part. */
function labelParts(span: string): string[] {
  return span
    .split(/\s*→\s*|\s*->\s*|\s+>\s+/)
    .map(p => p.replace(/^[\s.,;:!?()"“”]+|[\s.,;:!?()"“”]+$/g, ''))
    .filter(p => p.length > 0);
}

interface Block {
  text: string;
  /** [start offset in text, 1-based guide line] for each source line of the block. */
  starts: [number, number][];
}

/**
 * Group guide lines into Markdown blocks so a span that wraps onto the next line (a soft break,
 * including after a blockquote "> " prefix) is one span. Headings, table rows, list items,
 * blank lines and fences end a block. Fenced code and the Status line are dropped.
 */
function toBlocks(markdown: string): Block[] {
  const blocks: Block[] = [];
  let cur: Block | undefined;
  let fenced = false;
  markdown.split('\n').forEach((raw, i) => {
    if (/^\s*```/.test(raw)) {
      fenced = !fenced;
      cur = undefined;
      return;
    }
    // Image alt text and link targets are not UI quotes.
    const line = raw
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/\]\([^)]*\)/g, ']')
      .replace(/^\s*(?:>\s?)+/, '');
    if (fenced || /^\*\*Status:\*\*/.test(line)) {
      cur = undefined;
      return;
    }
    if (line.trim() === '') {
      cur = undefined;
      return;
    }
    const startsBlock = /^\s*(?:#{1,6}\s|\||[-*+]\s|\d+[.)]\s)/.test(line);
    if (!cur || startsBlock) {
      cur = { text: '', starts: [] };
      blocks.push(cur);
    }
    if (cur.text) cur.text += ' ';
    cur.starts.push([cur.text.length, i + 1]);
    cur.text += line.trim();
  });
  return blocks;
}

const lineAt = (block: Block, offset: number): number => {
  let line = block.starts[0]?.[1] ?? 1;
  for (const [start, l] of block.starts) if (start <= offset) line = l;
  return line;
};

export function checkGuide(
  file: string,
  markdown: string,
  corpus: string,
  allow: Allowlist
): Finding[] {
  const skip = new Set(allow.nonUi.map(normalize));
  const here = file.replace(/\\/g, '/');
  const budget = new Map<string, number>();
  for (const d of allow.knownDrift) {
    if (here === d.file || here.endsWith('/' + d.file)) {
      const k = normalize(d.text);
      budget.set(k, (budget.get(k) ?? 0) + d.count);
    }
  }
  // A guide's own headings are cross-references, not app UI.
  const headings = new Set(
    [...markdown.matchAll(/^#{1,6}\s+(.+)$/gm)].map(h =>
      normalize((h[1] ?? '').replace(/[*`]/g, ''))
    )
  );
  const findings: Finding[] = [];
  for (const block of toBlocks(markdown)) {
    for (const pattern of SPAN_PATTERNS) {
      for (const m of block.text.matchAll(pattern)) {
        for (const part of labelParts(m[1] ?? '')) {
          const key = normalize(part);
          if (skip.has(key) || headings.has(key) || corpusHas(corpus, key)) continue;
          const left = budget.get(key) ?? 0;
          if (left > 0) {
            budget.set(key, left - 1);
            continue;
          }
          findings.push({ file, line: lineAt(block, m.index ?? 0), text: part });
        }
      }
    }
  }
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
