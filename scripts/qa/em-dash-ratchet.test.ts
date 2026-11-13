import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  collectEmDashCounts,
  compareToBaseline,
  countEmDashesInSource,
  renderComparison,
  runCli,
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
  });

  it('prompts with the command that lowers the baseline when the total fell', () => {
    const output = renderComparison(compareToBaseline({ a: 1 }, { a: 2 }));
    expect(output).toContain('pnpm qa:em-dash-ratchet:update');
    expect(output).toContain('commit the new baseline');
  });

  it('prints moved files as information when the total is unchanged', () => {
    const output = renderComparison(compareToBaseline({ b: 2 }, { a: 2 }));
    expect(output).toContain('- b: 2 above 0');
    expect(output).toContain('- a: 0 below 2');
    expect(output).not.toContain('Regression');
  });
});

describe('runCli', () => {
  const read = (root: string) => JSON.parse(readFileSync(join(root, BASELINE), 'utf8'));

  it('passes at the baseline', () => {
    const root = makeRoot({ [`${APP}/a.ts`]: `export const a = '${DASH}';` });
    writeBaselineFile(root, { [`${APP}/a.ts`]: 1 });
    expect(runCli([], root)).toBe(0);
  });

  it('fails when the total rises', () => {
    const root = makeRoot({ [`${APP}/a.ts`]: `export const a = '${DASH} ${DASH}';` });
    writeBaselineFile(root, { [`${APP}/a.ts`]: 1 });
    expect(runCli([], root)).toBe(1);
  });

  it('fails when a new file carries an em dash', () => {
    const root = makeRoot({ [`${APP}/new.ts`]: `export const a = '${DASH}';` });
    writeBaselineFile(root, {});
    expect(runCli([], root)).toBe(1);
  });

  it('passes a rename and updates cleanly', () => {
    const root = makeRoot({ [`${APP}/renamed.ts`]: `export const a = '${DASH}';` });
    writeBaselineFile(root, { [`${APP}/old.ts`]: 1 });
    expect(runCli([], root)).toBe(0);
    expect(runCli(['--update-baseline'], root)).toBe(0);
    expect(read(root).files).toEqual({ [`${APP}/renamed.ts`]: 1 });
    expect(runCli([], root)).toBe(0);
  });

  it('fails when the total fell until the baseline is updated, then passes', () => {
    const root = makeRoot({ [`${APP}/a.ts`]: `export const a = 'none';` });
    writeBaselineFile(root, { [`${APP}/a.ts`]: 1 });
    expect(runCli([], root)).toBe(1);
    expect(vi.mocked(console.log).mock.calls.flat().join('\n')).toContain(
      'pnpm qa:em-dash-ratchet:update'
    );
    expect(runCli(['--update-baseline'], root)).toBe(0);
    expect(read(root).total).toBe(0);
    expect(runCli([], root)).toBe(0);
  });

  it('--update-baseline refuses to raise the baseline', () => {
    const root = makeRoot({ [`${APP}/a.ts`]: `export const a = '${DASH}';` });
    writeBaselineFile(root, {});
    expect(runCli(['--update-baseline'], root)).toBe(1);
    expect(read(root).files).toEqual({});
  });
});
