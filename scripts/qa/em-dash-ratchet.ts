/**
 * Em-dash ratchet (MYK9-1855, sub-issue of MYK9-1820).
 *
 * Counts em dashes in screen text under apps/myk9show/src: U+2014 (also via
 * escapes, since string text is cooked), `&mdash;`, and the numeric entities
 * `&#8212;` / `&#x2014;` (any case) in JSX text. Counted nodes are string
 * literals, template literal parts and JSX text. Comments are never counted
 * (they are not string nodes), and test files are excluded.
 *
 * The rule is on the TOTAL, not per file: CI fails when the total is above the
 * recorded baseline total (a regression) and also when it is below it (slack: the
 * baseline must be lowered in the same PR as each cleanup, per MYK9-1820). Equal
 * totals pass even if per-file counts moved. Per-file counts are recorded only to
 * NAME the files that rose or fell in the message. Gating on the total is what
 * lets a rename or a split of a file that carries em dashes go through: the old
 * path drops and the new path rises by the same amount. `--update-baseline`
 * refuses only when the total would rise.
 *
 * Decision: the bare "—" empty-cell placeholder and the public landing templates
 * ARE counted. Placeholders become "None" / "Not set" and templates are cleaned
 * up later, in other issues; this check keeps the number from growing meanwhile.
 *
 * Rewriting strings is out of scope here (sibling MYK9-1856).
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

export type EmDashCounts = Record<string, number>;

export type EmDashBaseline = {
  version: 1;
  updatedAt: string;
  total: number;
  files: EmDashCounts;
};

type FileDelta = { file: string; actual: number; baseline: number };

export type EmDashComparison = {
  actualTotal: number;
  baselineTotal: number;
  /** Files whose own count rose (named for information; the gate is the total). */
  risen: FileDelta[];
  /** Files whose own count fell. */
  fallen: FileDelta[];
};

export const SOURCE_ROOT = 'apps/myk9show/src';
export const DEFAULT_BASELINE_PATH = 'scripts/qa/em-dash-ratchet.baseline.json';

const SOURCE_EXTENSIONS = ['.ts', '.tsx'];
const TEST_FILE_PATTERN = /\.(test|spec)\.[tj]sx?$/;
const EM_DASH_PATTERN = /—|&mdash;|&#0*8212;|&#x0*2014;/gi;
const SKIPPED_DIRS = ['node_modules', 'dist', 'coverage', '.turbo', '__tests__'];

export function countEmDashesInSource(fileName: string, source: string): number {
  const scriptKind = fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKind
  );
  let count = 0;

  const countIn = (text: string) => {
    count += text.match(EM_DASH_PATTERN)?.length ?? 0;
  };

  const visit = (node: ts.Node) => {
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node) ||
      ts.isJsxText(node)
    ) {
      countIn(node.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  return count;
}

export function isExcludedPath(relativePath: string): boolean {
  return (
    TEST_FILE_PATTERN.test(relativePath) ||
    relativePath.includes('/src/test/') ||
    relativePath.includes('/__tests__/') ||
    relativePath.endsWith('.d.ts')
  );
}

export function collectEmDashCounts(rootDir: string): EmDashCounts {
  const counts: EmDashCounts = {};
  const sourceDir = join(rootDir, SOURCE_ROOT);
  if (!existsSync(sourceDir)) return counts;

  for (const file of walk(sourceDir).sort()) {
    const relativePath = relative(rootDir, file).replaceAll('\\', '/');
    if (isExcludedPath(relativePath)) continue;
    const count = countEmDashesInSource(file, readFileSync(file, 'utf8'));
    if (count > 0) counts[relativePath] = count;
  }
  return counts;
}

export function sumCounts(counts: EmDashCounts): number {
  return Object.values(counts).reduce((total, value) => total + value, 0);
}

export function compareToBaseline(counts: EmDashCounts, baseline: EmDashCounts): EmDashComparison {
  const risen: FileDelta[] = [];
  const fallen: FileDelta[] = [];

  for (const file of new Set([...Object.keys(counts), ...Object.keys(baseline)])) {
    const actual = counts[file] ?? 0;
    const recorded = baseline[file] ?? 0;
    if (actual > recorded) risen.push({ file, actual, baseline: recorded });
    else if (actual < recorded) fallen.push({ file, actual, baseline: recorded });
  }
  return { actualTotal: sumCounts(counts), baselineTotal: sumCounts(baseline), risen, fallen };
}

function listFiles(heading: string, deltas: FileDelta[], verb: string) {
  if (deltas.length === 0) return [];
  return [heading, ...deltas.map(d => `- ${d.file}: ${d.actual} ${verb} ${d.baseline}`)];
}

export function renderComparison(comparison: EmDashComparison): string {
  const { actualTotal, baselineTotal, risen, fallen } = comparison;
  const lines = [
    `Em-dash ratchet: ${actualTotal} em dashes in screen text (baseline ${baselineTotal})`,
    '',
  ];

  if (actualTotal > baselineTotal) {
    lines.push(
      'Regression: em dashes in screen text may only fall.',
      ...listFiles('Files that rose:', risen, 'above'),
      '',
      'Use a comma, colon, period or "None" / "Not set" instead of an em dash.'
    );
  } else if (actualTotal < baselineTotal) {
    lines.push(
      'The total is below the recorded baseline. Lower the baseline in the same PR as the cleanup:',
      ...listFiles('Files that fell:', fallen, 'below'),
      '',
      'Run pnpm qa:em-dash-ratchet:update and commit the new baseline.'
    );
  } else if (risen.length > 0 || fallen.length > 0) {
    lines.push(
      'Total unchanged; counts moved between files (rename or split):',
      ...listFiles('Rose:', risen, 'above'),
      ...listFiles('Fell:', fallen, 'below')
    );
  }

  return `${lines.join('\n')}\n`;
}

export function readBaseline(path: string): EmDashBaseline {
  return JSON.parse(readFileSync(path, 'utf8')) as EmDashBaseline;
}

export function writeBaseline(path: string, counts: EmDashCounts) {
  const baseline: EmDashBaseline = {
    version: 1,
    updatedAt: new Date().toISOString(),
    total: sumCounts(counts),
    files: counts,
  };
  writeFileSync(path, `${JSON.stringify(baseline, null, 2)}\n`);
}

function argValue(args: string[], name: string) {
  return args.find(arg => arg.startsWith(`${name}=`))?.slice(name.length + 1);
}

export function runCli(args: string[] = process.argv.slice(2), cwd = process.cwd()) {
  const rootDir = argValue(args, '--root') ?? cwd;
  const baselinePath = join(rootDir, argValue(args, '--baseline') ?? DEFAULT_BASELINE_PATH);
  const counts = collectEmDashCounts(rootDir);

  if (args.includes('--update-baseline')) {
    if (existsSync(baselinePath)) {
      const comparison = compareToBaseline(counts, readBaseline(baselinePath).files);
      if (comparison.actualTotal > comparison.baselineTotal) {
        console.log(renderComparison(comparison));
        console.log('Refusing to raise the baseline. Remove the new em dashes instead.');
        return 1;
      }
    }
    writeBaseline(baselinePath, counts);
    console.log(`Updated ${argValue(args, '--baseline') ?? DEFAULT_BASELINE_PATH}`);
    return 0;
  }

  const comparison = compareToBaseline(counts, readBaseline(baselinePath).files);
  console.log(renderComparison(comparison));
  return comparison.actualTotal === comparison.baselineTotal ? 0 : 1;
}

function walk(path: string): string[] {
  return readdirSync(path, { withFileTypes: true }).flatMap(entry => {
    const child = join(path, entry.name);
    if (entry.isDirectory()) return SKIPPED_DIRS.includes(entry.name) ? [] : walk(child);
    if (!entry.isFile() || !SOURCE_EXTENSIONS.some(ext => entry.name.endsWith(ext))) return [];
    return [child];
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = runCli();
}
