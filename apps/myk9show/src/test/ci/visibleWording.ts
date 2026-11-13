import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';

/**
 * Visible-wording scan (MYK9-1857). Walks non-test source with the TypeScript
 * compiler API and reports text a person can read: string literals, template
 * parts and JSX text. Comments, identifiers and test files never count.
 * The agreed words live in docs/reference/ui-vocabulary.md (Nouns, and "Offline and updates").
 */
export type WordingHit = { file: string; line: number; rule: string; text: string };

const WAITLIST_PATTERN = /wait[ -]list/i;
/** "Retry" alone, or "Retry ..." as the start of a sentence-like label ("Retry failed"). */
const RETRY_PATTERN = /^Retry(\s|$)/;
/** Non-visible styling and test hooks: a CSS or test-id string is never read by a person. */
const HIDDEN_KEYS = new Set(['className', 'testId', 'testid', 'data-testid']);
const isHiddenKey = (key: string) => HIDDEN_KEYS.has(key) || key.startsWith('data-');
/** Developer-facing sinks: their first strings go to the console or log store, not the screen. */
const LOG_CALLEE = /^(?:(?:logger|console|(?:this\.)?loggingService)\.|log$)/;

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
/**
 * Offline and update words (MYK9-1848, MYK9-1928; ui-vocabulary.md, "Offline and updates").
 * Bare words: any visible string with one of these says a developer's word to a person.
 */
const OFFLINE_RULES: ReadonlyArray<{ pattern: RegExp; rule: string }> = [
  {
    pattern: /\b(?:un|re)?sync(?:s|ed|ing|hroni[sz]\w*)?\b/i,
    rule: 'say "sent when you are back online" or "not been sent yet", not "sync"',
  },
  { pattern: /\bqueued\b/i, rule: 'say "saved on this device", not "queued"' },
  {
    pattern: /\bservers?\b/i,
    rule: 'say "myK9Show" ("we could not reach myK9Show"), not "the server"',
  },
  { pattern: /\bcach(?:e|es|ed|ing)\b/i, rule: 'say "saved data", not "cache"' },
  {
    pattern: /\breload(?:s|ed|ing)?\b/i,
    rule: 'say "restart the app", not "reload" (reload only where the control just refetches a list)',
  },
];
/**
 * Code a person never reads (MYK9-1848, MYK9-1928): staff diagnostics, developer tools, and
 * services no screen mounts. Each entry says why. Prefer deleting dead code over listing it.
 */
const OFFLINE_EXEMPT_PATHS = [
  // Staff diagnostics and developer-only tools keep the technical words.
  'features/admin-system-health/',
  'pages/admin/SystemHealth',
  'utils/clearDevelopmentCache.ts',
  // Developer error thrown by the viewer-scope guard; never rendered.
  'lib/viewerScopedQueryKey.ts',
  // Codemod pattern strings, not copy.
  'utils/standardizedErrorHandler.ts',
  // Developer console output (DEV builds only).
  'hooks/useNavigationPerformance.ts',
  // Lock errors thrown to callers that catch and log them.
  'services/cacheClearGate.ts',
  // Developer analytics, feature-flag and deployment tooling: no screen renders these strings.
  'services/analytics/',
  'services/deployment/',
  'hooks/useCDN.ts',
  // Not mounted by any screen (no importers outside tests); delete rather than reword.
  'components/common/SyncStatusIndicator.tsx',
  'hooks/useBackgroundSync.ts',
  'services/sync/',
  'services/offline/DataBackupService.ts',
];
/**
 * Visible text that keeps an offline word on purpose. Each entry says why; keep this short.
 */
/** Allowed only in the file that owns it, so the same words elsewhere are still caught. */
const DEV_MENU_FILE = 'components/layout/AccountMenuContent.tsx';
const OFFLINE_ALLOWED_IN_FILE = new Map<string, string>([
  // The Developer submenu, shown only to a site admin in a development build.
  ['Clear development cache and browser storage?', DEV_MENU_FILE],
  ['Clear cache', DEV_MENU_FILE],
  ['Clear Cache', DEV_MENU_FILE],
  ['This preserves templates and UI preferences, then reloads the page.', DEV_MENU_FILE],
  ['This will reload the page.', DEV_MENU_FILE],
]);
const OFFLINE_ALLOWED_TEXT = new Set([
  // A push alert queued on the server for sending, not a change held on this device.
  'Message posted and push alert queued',
  'Schedule announcement posted and push alert queued',
  // Raw HTTP error text matched against messages; never shown (friendlySaveError rewrites it).
  'internal server error',
  // Developer refresh labels (asserted by tests); logged, never shown.
  'flagged pull cleared by the server',
  'move-up pair confirmed by the server',
  // Log message from a .catch handler.
  'Judge-name resolve failed; cached names are retained',
]);
/**
 * Phrases that are accurate: the Try again control only retries a query, so "reload the list"
 * is true (waitlistErrorCopy.ts, VolunteerSchedulingPage). Removed before the rules run.
 */
const OFFLINE_ALLOWED_PHRASES = /\bTry again to reload the list\b|\bTry Again to reload it\b/gi;
/** One-token strings ('queued', 'replication:mutation-queued', import paths) are keys, not copy;
 * a "[tag] ..." message is a developer error. */
/** A lowercase token or one with a separator ('queued', 'a:b', 'x_y') is a key; "Syncing…" is not. */
const KEY_SHAPED = /^(?:[a-z][\w.-]*|[\w.-]*[:/_#@][\w.:/#@-]*)$/;
const isOfflineExempt = (file: string, trimmed: string) =>
  KEY_SHAPED.test(trimmed) ||
  trimmed.startsWith('[') ||
  OFFLINE_ALLOWED_TEXT.has(trimmed) ||
  OFFLINE_ALLOWED_IN_FILE.get(trimmed) === file ||
  OFFLINE_EXEMPT_PATHS.some(p => file.startsWith(p));

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
      // Collapse whitespace as the browser does: Prettier wraps long JSX text, and a phrase
      // split across lines ("The wait⏎lists") still reads as one phrase on screen.
      const text = node.text.replace(/\s+/g, ' ');
      const trimmed = text.trim();
      if (!NON_VISIBLE_MATCH_KEYS.has(trimmed) && !isHiddenText(node)) {
        if (WAITLIST_PATTERN.test(text)) report(node, 'waitlist is one word', text);
        if (RETRY_PATTERN.test(trimmed)) report(node, 'use "Try again", not "Retry"', text);
        if (!isOfflineExempt(fileName, trimmed)) {
          for (const { pattern, rule } of OFFLINE_RULES) {
            if (pattern.test(text.replace(OFFLINE_ALLOWED_PHRASES, ''))) report(node, rule, text);
          }
        }
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
