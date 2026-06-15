import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  BUDGETS,
  evaluateBudgets,
  collectBundleStats,
} from '../../../scripts/check-bundle-budget.js';

describe('check-bundle-budget — evaluateBudgets', () => {
  const within = {
    initialJsKb: 3000,
    initialCssKb: 300,
    largestChunk: { file: 'vendor.js', kb: 1400 },
  };

  it('reports no violations when every metric is within budget', () => {
    expect(evaluateBudgets(within, BUDGETS)).toEqual([]);
  });

  it('treats a value exactly at the budget as passing (strictly-greater gate)', () => {
    const atLimit = {
      initialJsKb: BUDGETS.initialJsKb,
      initialCssKb: BUDGETS.initialCssKb,
      largestChunk: { file: 'v.js', kb: BUDGETS.maxChunkKb },
    };
    expect(evaluateBudgets(atLimit, BUDGETS)).toEqual([]);
  });

  it('flags an over-budget initial JS payload', () => {
    const v = evaluateBudgets({ ...within, initialJsKb: BUDGETS.initialJsKb + 1 }, BUDGETS);
    expect(v).toHaveLength(1);
    expect(v[0].metric).toBe('Initial JS');
    expect(v[0].actual).toBe(BUDGETS.initialJsKb + 1);
  });

  it('flags over-budget initial CSS', () => {
    const v = evaluateBudgets({ ...within, initialCssKb: BUDGETS.initialCssKb + 1 }, BUDGETS);
    expect(v.map(x => x.metric)).toContain('Initial CSS');
  });

  it('flags a single chunk exceeding the ceiling and names the file', () => {
    const v = evaluateBudgets(
      { ...within, largestChunk: { file: 'huge-abc.js', kb: BUDGETS.maxChunkKb + 50 } },
      BUDGETS
    );
    expect(v).toHaveLength(1);
    expect(v[0].metric).toContain('huge-abc.js');
  });

  it('reports every violation when multiple metrics blow the budget', () => {
    const v = evaluateBudgets(
      {
        initialJsKb: BUDGETS.initialJsKb + 100,
        initialCssKb: BUDGETS.initialCssKb + 100,
        largestChunk: { file: 'x.js', kb: BUDGETS.maxChunkKb + 100 },
      },
      BUDGETS
    );
    expect(v).toHaveLength(3);
  });
});

describe('check-bundle-budget — collectBundleStats', () => {
  let distDir: string;

  beforeAll(() => {
    distDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bundle-budget-'));
    fs.mkdirSync(path.join(distDir, 'assets/scripts'), { recursive: true });
    fs.mkdirSync(path.join(distDir, 'assets/styles'), { recursive: true });
    // entry + one eager vendor preload + one stylesheet; one lazy chunk NOT in html.
    const write = (rel: string, bytes: number) =>
      fs.writeFileSync(path.join(distDir, rel), Buffer.alloc(bytes));
    write('assets/scripts/index-AbC123.js', 100 * 1024); // mixed-case hash on purpose
    write('assets/scripts/vendor-react-dom-XyZ.js', 200 * 1024);
    write('assets/scripts/LazyRoute-Qq9.js', 500 * 1024); // lazy: not referenced by html
    write('assets/styles/index-D5.css', 50 * 1024);
    fs.writeFileSync(
      path.join(distDir, 'index.html'),
      `<!doctype html><html><head>
        <script type="module" src="/assets/scripts/index-AbC123.js"></script>
        <link rel="modulepreload" href="/assets/scripts/vendor-react-dom-XyZ.js">
        <link rel="stylesheet" href="/assets/styles/index-D5.css">
      </head><body></body></html>`
    );
  });

  afterAll(() => fs.rmSync(distDir, { recursive: true, force: true }));

  it('sums only index.html-referenced assets into the initial payload', () => {
    const stats = collectBundleStats(distDir);
    expect(stats.initialJsKb).toBe(300); // entry 100 + eager vendor 200; lazy 500 excluded
    expect(stats.initialCssKb).toBe(50);
  });

  it('finds the largest chunk across ALL chunks (incl. lazy)', () => {
    const stats = collectBundleStats(distDir);
    expect(stats.largestChunk.file).toContain('LazyRoute-Qq9.js');
    expect(stats.largestChunk.kb).toBe(500);
    expect(stats.chunkCount).toBe(3);
  });

  it('throws a clear error when the build output is missing', () => {
    expect(() => collectBundleStats(path.join(distDir, 'nope'))).toThrow(/Run the build/);
  });
});
