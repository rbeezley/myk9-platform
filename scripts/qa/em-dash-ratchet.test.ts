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
  it('flags a rise, a new file and reports falls as improvements', () => {
    const result = compareToBaseline({ a: 3, new: 1, c: 1 }, { a: 2, c: 2, gone: 1 });
    expect(result.violations).toEqual([
      { file: 'a', actual: 3, baseline: 2 },
      { file: 'new', actual: 1, baseline: 0 },
    ]);
    expect(result.improvements).toEqual([
      { file: 'c', actual: 1, baseline: 2 },
      { file: 'gone', actual: 0, baseline: 1 },
    ]);
  });
});

describe('renderComparison', () => {
  it('names the file that rose', () => {
    const output = renderComparison({ a: 3 }, compareToBaseline({ a: 3 }, { a: 2 }));
    expect(output).toContain('- a: 3 exceeds 2');
  });

  it('prompts with the command that lowers the baseline', () => {
    const output = renderComparison({ a: 1 }, compareToBaseline({ a: 1 }, { a: 2 }));
    expect(output).toContain('pnpm qa:em-dash-ratchet:update');
  });
});

describe('runCli', () => {
  it('passes at the baseline', () => {
    const root = makeRoot({ [`${APP}/a.ts`]: `export const a = '${DASH}';` });
    writeBaselineFile(root, { [`${APP}/a.ts`]: 1 });
    expect(runCli([], root)).toBe(0);
  });

  it('fails when a file gains an em dash', () => {
    const root = makeRoot({ [`${APP}/a.ts`]: `export const a = '${DASH} ${DASH}';` });
    writeBaselineFile(root, { [`${APP}/a.ts`]: 1 });
    expect(runCli([], root)).toBe(1);
  });

  it('fails when a new file carries an em dash', () => {
    const root = makeRoot({ [`${APP}/new.ts`]: `export const a = '${DASH}';` });
    writeBaselineFile(root, {});
    expect(runCli([], root)).toBe(1);
  });

  it('passes and prompts when the count falls', () => {
    const root = makeRoot({ [`${APP}/a.ts`]: `export const a = 'none';` });
    writeBaselineFile(root, { [`${APP}/a.ts`]: 1 });
    expect(runCli([], root)).toBe(0);
    expect(vi.mocked(console.log).mock.calls.flat().join('\n')).toContain(
      'pnpm qa:em-dash-ratchet:update'
    );
  });

  it('--update-baseline lowers the baseline but refuses to raise it', () => {
    const root = makeRoot({ [`${APP}/a.ts`]: `export const a = 'none';` });
    writeBaselineFile(root, { [`${APP}/a.ts`]: 1 });
    expect(runCli(['--update-baseline'], root)).toBe(0);
    expect(JSON.parse(readFileSync(join(root, BASELINE), 'utf8')).files).toEqual({});

    writeFileSync(join(root, `${APP}/a.ts`), `export const a = '${DASH}';`);
    expect(runCli(['--update-baseline'], root)).toBe(1);
    expect(JSON.parse(readFileSync(join(root, BASELINE), 'utf8')).files).toEqual({});
  });
});
