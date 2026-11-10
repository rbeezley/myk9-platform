/**
 * Em-dash ratchet (MYK9-1855, sub-issue of MYK9-1820).
 *
 * Counts em dashes (U+2014 and the literal text `&mdash;`) in screen text under
 * apps/myk9show/src: string literals, template literal parts and JSX text.
 * Comments are never counted (they are not string nodes), and test files are
 * excluded. The count may only fall: a recorded per-file baseline fails CI when
 * any file rises or a new file carries any em dash.
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

export type EmDashComparison = {
  violations: { file: string; actual: number; baseline: number }[];
  improvements: { file: string; actual: number; baseline: number }[];
};

export const SOURCE_ROOT = 'apps/myk9show/src';
export const DEFAULT_BASELINE_PATH = 'scripts/qa/em-dash-ratchet.baseline.json';

const SOURCE_EXTENSIONS = ['.ts', '.tsx'];
const TEST_FILE_PATTERN = /\.(test|spec)\.[tj]sx?$/;
const EM_DASH_PATTERN = /—|&mdash;/g;
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

export function compareToBaseline(counts: EmDashCounts, baseline: EmDashCounts): EmDashComparison {
  const violations: EmDashComparison['violations'] = [];
  const improvements: EmDashComparison['improvements'] = [];

  for (const file of new Set([...Object.keys(counts), ...Object.keys(baseline)])) {
    const actual = counts[file] ?? 0;
    const recorded = baseline[file] ?? 0;
    if (actual > recorded) violations.push({ file, actual, baseline: recorded });
    else if (actual < recorded) improvements.push({ file, actual, baseline: recorded });
  }
  return { violations, improvements };
}

export function sumCounts(counts: EmDashCounts): number {
  return Object.values(counts).reduce((total, value) => total + value, 0);
}

export function renderComparison(counts: EmDashCounts, comparison: EmDashComparison): string {
  const lines = [`Em-dash ratchet: ${sumCounts(counts)} em dashes in screen text`, ''];

  if (comparison.violations.length > 0) {
    lines.push('Regressions (em dashes in screen text may only fall):');
    for (const { file, actual, baseline } of comparison.violations) {
      lines.push(`- ${file}: ${actual} exceeds ${baseline}`);
    }
    lines.push('', 'Use a comma, colon, period or "None" / "Not set" instead of an em dash.');
  }

  if (comparison.improvements.length > 0) {
    lines.push('Improvements below baseline:');
    for (const { file, actual, baseline } of comparison.improvements) {
      lines.push(`- ${file}: ${actual} below ${baseline}`);
    }
    lines.push('', 'Run pnpm qa:em-dash-ratchet:update to lower the recorded baseline.');
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
      const { violations } = compareToBaseline(counts, readBaseline(baselinePath).files);
      if (violations.length > 0) {
        console.log(renderComparison(counts, { violations, improvements: [] }));
        console.log('Refusing to raise the baseline. Remove the new em dashes instead.');
        return 1;
      }
    }
    writeBaseline(baselinePath, counts);
    console.log(`Updated ${argValue(args, '--baseline') ?? DEFAULT_BASELINE_PATH}`);
    return 0;
  }

  const comparison = compareToBaseline(counts, readBaseline(baselinePath).files);
  console.log(renderComparison(counts, comparison));
  return comparison.violations.length > 0 ? 1 : 0;
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
