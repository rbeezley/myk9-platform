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
/** "Retry" alone, or "Retry ..." as the start of a sentence-like label ("Retry failed"). */
const RETRY_PATTERN = /^Retry(\s|$)/;
/** Non-visible styling and test hooks: a CSS or test-id string is never read by a person. */
const HIDDEN_KEYS = new Set(['className', 'testId', 'testid', 'data-testid']);
const isHiddenKey = (key: string) => HIDDEN_KEYS.has(key) || key.startsWith('data-');
/** Developer-facing sinks: their first strings go to the console or log store, not the screen. */
const LOG_CALLEE = /^(logger|console)\./;

/**
 * Strings that contain the old words on purpose because something compares, matches or
 * sends them; they are NOT copy. Each must mirror its source of truth exactly and must
 * never be reworded to the waitlist vocabulary.
 */
const NON_VISIBLE_MATCH_KEYS = new Set([
  // `denial_reason` written by public.evaluate_entry_capacity (migration
  // 20261005031700_myk9_1012_hold_spots_at_pay.sql). entrySubmissionOutcomes.ts compares
  // outcome.denialReason against it.
  'dog already on this class wait list for a different exhibitor',
  // `reason` handed to refreshServerChangedEntries (a developer-facing refresh label that a
  // test asserts); never shown.
  'wait list offer entry changed by the server',
]);
/** Walk-up skip folders: tests and dependencies never ship as visible text. */
const SKIPPED_DIRS = new Set(['node_modules', 'dist', 'coverage', '__tests__']);
const SKIPPED_TOP_LEVEL_DIRS = new Set(['test']);

const isTextNode = (node: ts.Node): node is ts.StringLiteralLike | ts.JsxText =>
  ts.isStringLiteral(node) ||
  ts.isNoSubstitutionTemplateLiteral(node) ||
  ts.isTemplateHead(node) ||
  ts.isTemplateMiddle(node) ||
  ts.isTemplateTail(node) ||
  ts.isJsxText(node);

/** True when the literal sits inside a className / data-* / test-id value or a log call. */
function isHiddenText(node: ts.Node): boolean {
  for (let cur: ts.Node | undefined = node.parent; cur; cur = cur.parent) {
    if (ts.isJsxAttribute(cur)) return isHiddenKey(cur.name.getText());
    if (ts.isPropertyAssignment(cur) && isHiddenKey(cur.name.getText())) return true;
    if (ts.isCallExpression(cur) && LOG_CALLEE.test(cur.expression.getText())) return true;
    if (ts.isJsxElement(cur) || ts.isJsxSelfClosingElement(cur) || ts.isBlock(cur)) return false;
  }
  return false;
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
      const trimmed = text.trim();
      if (!NON_VISIBLE_MATCH_KEYS.has(trimmed) && !isHiddenText(node)) {
        if (WAITLIST_PATTERN.test(text)) report(node, 'waitlist is one word', text);
        if (RETRY_PATTERN.test(trimmed)) report(node, 'use "Try again", not "Retry"', text);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return hits;
}

function* walk(dir: string, top = true): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRS.has(entry.name) && !(top && SKIPPED_TOP_LEVEL_DIRS.has(entry.name))) {
        yield* walk(join(dir, entry.name), false);
      }
    } else if (/\.tsx?$/.test(entry.name) && !/\.(test|spec)\.tsx?$|\.d\.ts$/.test(entry.name)) {
      yield join(dir, entry.name);
    }
  }
}

export function scanSourceTree(srcDir: string): WordingHit[] {
  const hits: WordingHit[] = [];
  for (const file of walk(srcDir)) {
    const rel = relative(srcDir, file).replaceAll('\\', '/');
    hits.push(...scanVisibleWording(rel, readFileSync(file, 'utf8')));
  }
  return hits;
}
