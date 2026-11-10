import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';

/**
 * Visible-wording scan (MYK9-1857). Walks non-test source with the TypeScript
 * compiler API and reports text a person can read: string literals, template
 * parts and JSX text. Comments, identifiers and test files never count.
 * The agreed words live in docs/reference/ui-vocabulary.md (Nouns).
 */
export type WordingHit = { file: string; line: number; rule: string; text: string };

const WAITLIST_PATTERN = /wait[ -]list/i;
const RETRY_LABEL_KEYS = new Set(['label', 'ariaLabel', 'aria-label', 'title']);
/**
 * Held back while another open PR owns these folders; delete this list when that
 * PR lands and the two waitlist strings in them are reworded.
 */
const PENDING_OTHER_PR = [
  'components/shows/RegistrationWorkflow/PaymentStep/',
  'components/shows/RegistrationWorkflow/EntriesPanel/',
];
const SKIPPED_DIRS = new Set(['node_modules', 'dist', 'coverage', '__tests__', 'test']);

const isTextNode = (node: ts.Node): node is ts.StringLiteralLike | ts.JsxText =>
  ts.isStringLiteral(node) ||
  ts.isNoSubstitutionTemplateLiteral(node) ||
  ts.isTemplateHead(node) ||
  ts.isTemplateMiddle(node) ||
  ts.isTemplateTail(node) ||
  ts.isJsxText(node);

function propertyKey(node: ts.Node): string | undefined {
  const parent = node.parent;
  if (ts.isPropertyAssignment(parent) && parent.initializer === node) return parent.name.getText();
  if (ts.isJsxAttribute(parent)) return parent.name.getText();
  return undefined;
}

export function scanVisibleWording(fileName: string, source: string): WordingHit[] {
  const kind = fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, kind);
  const hits: WordingHit[] = [];

  const report = (node: ts.Node, rule: string, text: string) => {
    const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    hits.push({ file: fileName, line: line + 1, rule, text: text.trim() });
  };

  const visit = (node: ts.Node) => {
    if (isTextNode(node)) {
      const text = node.text;
      if (WAITLIST_PATTERN.test(text)) report(node, 'waitlist is one word', text);
      const isLabelProp = RETRY_LABEL_KEYS.has(propertyKey(node) ?? '');
      if (text.trim() === 'Retry' && (ts.isJsxText(node) || isLabelProp)) {
        report(node, 'use "Try again", not "Retry"', text);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return hits;
}

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRS.has(entry.name)) yield* walk(join(dir, entry.name));
    } else if (/\.tsx?$/.test(entry.name) && !/\.(test|spec)\.tsx?$|\.d\.ts$/.test(entry.name)) {
      yield join(dir, entry.name);
    }
  }
}

export function scanSourceTree(srcDir: string): WordingHit[] {
  const hits: WordingHit[] = [];
  for (const file of walk(srcDir)) {
    const rel = relative(srcDir, file).replaceAll('\\', '/');
    if (PENDING_OTHER_PR.some(prefix => rel.startsWith(prefix))) continue;
    hits.push(...scanVisibleWording(rel, readFileSync(file, 'utf8')));
  }
  return hits;
}
