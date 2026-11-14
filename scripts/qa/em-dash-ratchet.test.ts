import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

import {
  collectEmDashCounts,
  compareToBaseline,
  countEmDashesInSource,
  renderComparison,
  runCli,
  writeBaseline,
} from './em-dash-ratchet';

const DASH = '—';
const BASELINE = 'scripts/qa/em-dash-ratchet.baseline.json';
const APP = 'apps/myk9show/src';
const roots: string[] = [];

function makeRoot(files: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), 'em-dash-ratchet-'));
  roots.push(root);
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
}

function writeBaselineFile(root: string, files: Record<string, number>) {
  mkdirSync(dirname(join(root, BASELINE)), { recursive: true });
  writeFileSync(join(root, BASELINE), JSON.stringify({ version: 1, files }));
}

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('countEmDashesInSource', () => {
  it('counts string literals', () => {
    expect(countEmDashesInSource('a.ts', `const a = 'x ${DASH} y'; const b = "${DASH}";`)).toBe(2);
  });

  it('counts template literal parts', () => {
    const source = `const a = \`one ${DASH} \${n} two ${DASH} \${m} three ${DASH}\`; const b = \`${DASH}\`;`;
    expect(countEmDashesInSource('a.ts', source)).toBe(4);
  });

  it('counts JSX text and JSX attribute strings', () => {
    const source = `export const A = () => <p title="a ${DASH} b">Hello ${DASH} there</p>;`;
    expect(countEmDashesInSource('a.tsx', source)).toBe(2);
  });

  it('counts the literal &mdash; entity', () => {
    expect(countEmDashesInSource('a.tsx', 'export const A = () => <p>Hi &mdash; there</p>;')).toBe(
      1
    );
  });

  it('counts numeric entities in JSX text, any case', () => {
    const source = 'export const A = () => <p>a &#8212; b &#x2014; c &#X2014; d &#x2014;</p>;';
    expect(countEmDashesInSource('a.tsx', source)).toBe(4);
  });

  it('counts an em dash written as an escape in a string literal', () => {
    expect(countEmDashesInSource('a.ts', "const a = '\\u2014'; const b = '\\u{2014}';")).toBe(2);
  });

  it('counts a string expression in JSX', () => {
    expect(countEmDashesInSource('a.tsx', `export const A = () => <p>{'${DASH}'}</p>;`)).toBe(1);
  });

  it('ignores line and block comments', () => {
    const source = `// ${DASH} note\n/* ${DASH} block */\n/** ${DASH} doc */\nconst a = 'plain';`;
    expect(countEmDashesInSource('a.ts', source)).toBe(0);
  });

  it('counts a string but not the comment beside it', () => {
    expect(countEmDashesInSource('a.ts', `// ${DASH}\nconst a = '${DASH}'; // ${DASH}`)).toBe(1);
  });
});

describe('collectEmDashCounts', () => {
  it('keys counts per file and excludes test files and test directories', () => {
    const root = makeRoot({
      [`${APP}/a.ts`]: `export const a = '${DASH}';`,
      [`${APP}/b.tsx`]: `export const B = () => <p>${DASH}${DASH}</p>;`,
      [`${APP}/clean.ts`]: `export const c = 'none';`,
      [`${APP}/a.test.ts`]: `export const t = '${DASH}';`,
      [`${APP}/b.spec.tsx`]: `export const t = '${DASH}';`,
      [`${APP}/test/helper.ts`]: `export const t = '${DASH}';`,
      [`${APP}/pages/__tests__/p.ts`]: `export const t = '${DASH}';`,
    });

    expect(collectEmDashCounts(root)).toEqual({
      [`${APP}/a.ts`]: 1,
      [`${APP}/b.tsx`]: 2,
    });
  });
});

describe('compareToBaseline', () => {
  it('totals both sides and names files that rose or fell', () => {
    const result = compareToBaseline({ a: 3, new: 1, c: 1 }, { a: 2, c: 2, gone: 1 });
    expect(result.actualTotal).toBe(5);
    expect(result.baselineTotal).toBe(5);
    expect(result.risen).toEqual([
      { file: 'a', actual: 3, baseline: 2 },
      { file: 'new', actual: 1, baseline: 0 },
    ]);
    expect(result.fallen).toEqual([
      { file: 'c', actual: 1, baseline: 2 },
      { file: 'gone', actual: 0, baseline: 1 },
    ]);
  });
});

describe('renderComparison', () => {
  it('names the file that rose on a regression', () => {
    const output = renderComparison(compareToBaseline({ a: 3 }, { a: 2 }));
    expect(output).toContain('- a: 3 above 2');
    expect(output).toContain('Regression');
  });

  it('calls a fall a pass and makes the update optional', () => {
    const output = renderComparison(compareToBaseline({ a: 1 }, { a: 2 }));
    expect(output).toContain('Pass.');
    expect(output).toContain('Optional: pnpm qa:em-dash-ratchet:update');
    expect(output).not.toContain('Regression');
  });

  it('prints the total slack on every run', () => {
    expect(renderComparison(compareToBaseline({ a: 1 }, { a: 2 }))).toContain('Slack: 1 ');
    expect(renderComparison(compareToBaseline({ a: 2 }, { a: 2 }))).toContain('Slack: 0 ');
    expect(renderComparison(compareToBaseline({ a: 1 }, { a: 2 }))).not.toContain('quiet main');
  });

  it('nudges to run the update once slack reaches 10', () => {
    const output = renderComparison(compareToBaseline({ a: 1, b: 0 }, { a: 6, b: 5 }));
    expect(output).toContain('Slack: 10 ');
    expect(output).toContain('run pnpm qa:em-dash-ratchet:update on a quiet main');
    expect(output).not.toContain('Regression');
  });

  it('tells a regression about the rename and split path', () => {
    expect(renderComparison(compareToBaseline({ a: 3 }, { a: 2 }))).toContain(
      'For a rename or split, run pnpm qa:em-dash-ratchet:update'
    );
  });

  it('is a regression when one file rises even if another fell by as much', () => {
    const output = renderComparison(compareToBaseline({ b: 2 }, { a: 2 }));
    expect(output).toContain('Regression');
    expect(output).toContain('- b: 2 above 0');
  });
});

describe('runCli', () => {
  const read = (root: string) => JSON.parse(readFileSync(join(root, BASELINE), 'utf8'));
  const A = `${APP}/a.ts`;
  const B = `${APP}/b.ts`;
  const src = (n: number) => `export const a = '${Array(n).fill(DASH).join(' ')}';`;

  it('passes at the baseline', () => {
    const root = makeRoot({ [A]: src(1) });
    writeBaselineFile(root, { [A]: 1 });
    expect(runCli([], root)).toBe(0);
  });

  it('fails when a file rises', () => {
    const root = makeRoot({ [A]: src(2) });
    writeBaselineFile(root, { [A]: 1 });
    expect(runCli([], root)).toBe(1);
  });

  it('fails when one file rises even though another fell by the same amount', () => {
    const root = makeRoot({ [A]: src(2), [B]: src(0) });
    writeBaselineFile(root, { [A]: 1, [B]: 1 });
    expect(runCli([], root)).toBe(1);
  });

  it('fails when a new file carries an em dash', () => {
    const root = makeRoot({ [`${APP}/new.ts`]: src(1) });
    writeBaselineFile(root, {});
    expect(runCli([], root)).toBe(1);
  });

  it('passes a lowered file without rewriting the baseline', () => {
    const root = makeRoot({ [A]: src(1), [B]: src(0) });
    writeBaselineFile(root, { [A]: 2, [B]: 1 });
    const before = readFileSync(join(root, BASELINE), 'utf8');
    expect(runCli([], root)).toBe(0);
    expect(readFileSync(join(root, BASELINE), 'utf8')).toBe(before);
  });

  it('a rename fails the check, --update-baseline allows it, and the check then passes', () => {
    const renamed = `${APP}/renamed.ts`;
    const root = makeRoot({ [renamed]: src(2) });
    writeBaselineFile(root, { [`${APP}/old.ts`]: 2 });
    expect(runCli([], root)).toBe(1);
    expect(runCli(['--update-baseline'], root)).toBe(0);
    expect(read(root)).toEqual({ version: 1, files: { [renamed]: 2 } });
    expect(runCli([], root)).toBe(0);
  });

  it('--update-baseline refuses a rename that also adds an em dash', () => {
    const root = makeRoot({ [`${APP}/renamed.ts`]: src(3) });
    writeBaselineFile(root, { [`${APP}/old.ts`]: 2 });
    expect(runCli(['--update-baseline'], root)).toBe(1);
    expect(read(root).files).toEqual({ [`${APP}/old.ts`]: 2 });
  });

  it('--update-baseline lowers the baseline and drops a file that reached zero', () => {
    const root = makeRoot({ [A]: src(1), [B]: src(0) });
    writeBaselineFile(root, { [A]: 2, [B]: 1 });
    expect(runCli(['--update-baseline'], root)).toBe(0);
    expect(read(root)).toEqual({ version: 1, files: { [A]: 1 } });
    expect(runCli([], root)).toBe(0);
  });

  it('--update-baseline refuses to raise the baseline', () => {
    const root = makeRoot({ [A]: src(1) });
    writeBaselineFile(root, {});
    expect(runCli(['--update-baseline'], root)).toBe(1);
    expect(read(root).files).toEqual({});
  });
});

describe('the committed baseline format', () => {
  const text = (files: Record<string, number>) =>
    `${JSON.stringify({ version: 1, files }, null, 2)}\n`;
  const git = (cwd: string, ...args: string[]) =>
    execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {
      cwd,
      encoding: 'utf8',
    });

  it('holds no total or timestamp and one sorted line per file', () => {
    const root = makeRoot({});
    const path = join(root, 'b.json');
    writeBaseline(path, { 'z.ts': 1, 'a.ts': 2 });
    const written = readFileSync(path, 'utf8');
    expect(written).not.toMatch(/total|updatedAt/);
    expect(written.split('\n').filter(line => line.includes('.ts'))).toEqual([
      '    "a.ts": 2,',
      '    "z.ts": 1',
    ]);
  });

  it.each([
    ['one then two', ['one', 'two']],
    ['two then one', ['two', 'one']],
  ])('two PRs lowering different files merge with no conflict (%s)', (_label, order) => {
    const files = { 'a.ts': 3, 'b.ts': 2, 'c.ts': 4, 'd.ts': 1, 'e.ts': 5 };
    const lowered: Record<string, Record<string, number>> = {
      one: { ...files, 'a.ts': 2 },
      two: { 'a.ts': 3, 'b.ts': 2, 'c.ts': 4, 'e.ts': 5 },
    };
    const root = makeRoot({ 'baseline.json': text(files) });
    git(root, 'init', '-q', '-b', 'main');
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'base');
    for (const name of ['one', 'two']) {
      git(root, 'checkout', '-q', '-b', name, 'main');
      writeFileSync(join(root, 'baseline.json'), text(lowered[name] ?? files));
      git(root, 'commit', '-qam', name);
    }
    git(root, 'checkout', '-q', '-b', 'target', 'main');
    for (const name of order) git(root, 'merge', '-q', '--no-edit', name);
    expect(JSON.parse(readFileSync(join(root, 'baseline.json'), 'utf8')).files).toEqual({
      'a.ts': 2,
      'b.ts': 2,
      'c.ts': 4,
      'e.ts': 5,
    });
  });
});
