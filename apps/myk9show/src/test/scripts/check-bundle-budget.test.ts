import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  BUDGETS,
  PDF_CHUNK_POLICY,
  chunkName,
  evaluateBudgets,
  evaluatePdfChunkImports,
  collectBundleStats,
  findPdfStaticImports,
  parsePrecacheUrls,
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

  afterAll(() => {
    fs.rmSync(distDir, { recursive: true, force: true });
  });

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

describe('check-bundle-budget — PDF renderer chunks stay off the static path', () => {
  const reactPdf = { file: 'assets/scripts/react-pdf.browser-DK2aTDOG.js', source: 'x.yogaNode=1' };
  const pdfLib = {
    file: 'assets/scripts/PDFButton-B7ojBW5L.js',
    source: 'throw "no `fontkit` instance was found"',
  };

  it('derives the chunk name from the emitted file name, hash dashes included', () => {
    expect(chunkName('assets/scripts/ShowDetailsPage-hFmFCtUs.js')).toBe('ShowDetailsPage');
    expect(chunkName('assets/scripts/HeadlineEntryBlankDocument--WK-WbDU.js')).toBe(
      'HeadlineEntryBlankDocument'
    );
    expect(chunkName('assets/scripts/react-pdf.browser-DK2aTDOG.js')).toBe('react-pdf.browser');
  });

  it('finds a page chunk that statically imports the react-pdf chunk, with either quote style', () => {
    const edges = findPdfStaticImports([
      reactPdf,
      {
        file: 'assets/scripts/ShowDetailsPage-hFmFCtUs.js',
        source: `import{Text}from'./react-pdf.browser-DK2aTDOG.js';`,
      },
      {
        file: 'assets/scripts/RegistrationWizardPage-Dgqko_Q-.js',
        source: `import{Text}from"./react-pdf.browser-DK2aTDOG.js";`,
      },
      {
        file: 'assets/scripts/ShowDeskPanel-BEGYGcOj.js',
        source: `import'./react-pdf.browser-DK2aTDOG.js';`,
      },
    ]);

    expect(edges.map(e => [e.importer, e.imported, e.kind])).toEqual([
      ['assets/scripts/ShowDetailsPage-hFmFCtUs.js', reactPdf.file, 'react-pdf'],
      ['assets/scripts/RegistrationWizardPage-Dgqko_Q-.js', reactPdf.file, 'react-pdf'],
      ['assets/scripts/ShowDeskPanel-BEGYGcOj.js', reactPdf.file, 'react-pdf'],
    ]);
  });

  it('does not count a dynamic import() of a PDF chunk', () => {
    const edges = findPdfStaticImports([
      reactPdf,
      {
        file: 'assets/scripts/ShowDetailsPage-hFmFCtUs.js',
        source: `const l=()=>import('./react-pdf.browser-DK2aTDOG.js');const m=()=>import("./react-pdf.browser-DK2aTDOG.js");`,
      },
    ]);

    expect(edges).toEqual([]);
  });

  it('finds the pdf-lib chunk by its fontkit marker', () => {
    const edges = findPdfStaticImports([
      pdfLib,
      {
        file: 'assets/scripts/ShowDeskPanel-BEGYGcOj.js',
        source: `import{a}from'./PDFButton-B7ojBW5L.js';`,
      },
    ]);

    expect(edges).toEqual([
      {
        importer: 'assets/scripts/ShowDeskPanel-BEGYGcOj.js',
        imported: pdfLib.file,
        kind: 'pdf-lib',
      },
    ]);
  });

  it('does not match a chunk whose name only starts like a PDF chunk', () => {
    const edges = findPdfStaticImports([
      reactPdf,
      {
        file: 'assets/scripts/Other-AAAAAAAA.js',
        source: `import{a}from'./react-pdf.browser-DK2aTDOG.js.map';`,
      },
    ]);

    expect(edges).toEqual([]);
  });

  it('flags a page chunk and names both chunks in the violation', () => {
    const violations = evaluateBudgets({
      initialJsKb: 1,
      initialCssKb: 1,
      largestChunk: { file: 'x.js', kb: 1 },
      pdfStaticImports: [
        {
          importer: 'assets/scripts/ShowDetailsPage-hFmFCtUs.js',
          imported: reactPdf.file,
          kind: 'react-pdf',
        },
      ],
    });

    expect(violations).toHaveLength(1);
    expect(violations[0].file).toBe('assets/scripts/ShowDetailsPage-hFmFCtUs.js');
    expect(violations[0].imported).toBe(reactPdf.file);
    expect(violations[0].message).toContain('ShowDetailsPage-hFmFCtUs.js');
    expect(violations[0].message).toContain('react-pdf.browser-DK2aTDOG.js');
  });

  it('allows the lazy chunks that exist to hold PDF code', () => {
    const lazy = [
      'HeadlineEntryBlankDocument--WK-WbDU',
      'pdfFonts-pv7eJEXa',
      'publishExperience-BP5eabl_',
      'PremiumPdfDownloadLink-AbCdEfGh',
      'UKCPremiumTemplate-CacC6rjY',
      'mergeReportPdfs-f3fNLvY6',
      'officialPdfDownload-Bnyr6Inq',
    ].map(name => ({
      importer: `assets/scripts/${name}.js`,
      imported: reactPdf.file,
      kind: 'react-pdf',
    }));

    expect(evaluatePdfChunkImports(lazy, PDF_CHUNK_POLICY)).toEqual([]);
  });

  it('tolerates exactly the known Reports route import of pdf-lib, and no more', () => {
    const edge = (hash: string, kind = 'pdf-lib') => ({
      importer: `assets/scripts/index-${hash}.js`,
      imported: pdfLib.file,
      kind,
    });

    expect(evaluatePdfChunkImports([edge('G_PEI8ZQ')], PDF_CHUNK_POLICY)).toEqual([]);
    expect(
      evaluatePdfChunkImports([edge('G_PEI8ZQ'), edge('Xr9fGu1Z')], PDF_CHUNK_POLICY)
    ).toHaveLength(2);
    // The tolerance is for pdf-lib only: an index chunk importing react-pdf is a violation.
    expect(evaluatePdfChunkImports([edge('G_PEI8ZQ', 'react-pdf')], PDF_CHUNK_POLICY)).toHaveLength(
      1
    );
  });

  describe('against a built dist on disk', () => {
    function buildDist(pageSource: string) {
      const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'bundle-budget-pdf-'));
      fs.mkdirSync(path.join(dist, 'assets/scripts'), { recursive: true });
      fs.writeFileSync(
        path.join(dist, 'index.html'),
        '<!doctype html><html><head><script type="module" src="/assets/scripts/index-AbC123xy.js"></script></head></html>'
      );
      const write = (name: string, source: string) =>
        fs.writeFileSync(path.join(dist, 'assets/scripts', name), source);
      write('index-AbC123xy.js', 'console.log(1)');
      write('react-pdf.browser-DK2aTDOG.js', 'export{a as Text};let yogaNode=1');
      write('ShowDetailsPage-hFmFCtUs.js', pageSource);
      return dist;
    }

    it('fails when a page chunk statically imports the PDF chunk', () => {
      const dist = buildDist(`import{a as Text}from'./react-pdf.browser-DK2aTDOG.js';`);
      try {
        const stats = collectBundleStats(dist);
        expect(stats.pdfChunkFiles).toEqual(['assets/scripts/react-pdf.browser-DK2aTDOG.js']);
        const violations = evaluateBudgets(stats, BUDGETS);
        expect(violations.map(v => v.file)).toEqual(['assets/scripts/ShowDetailsPage-hFmFCtUs.js']);
      } finally {
        fs.rmSync(dist, { recursive: true, force: true });
      }
    });

    it('passes when the same page loads the PDF chunk with a dynamic import', () => {
      const dist = buildDist(`const load=()=>import('./react-pdf.browser-DK2aTDOG.js');`);
      try {
        const stats = collectBundleStats(dist);
        expect(stats.pdfChunkFiles).toEqual(['assets/scripts/react-pdf.browser-DK2aTDOG.js']);
        expect(evaluateBudgets(stats, BUDGETS)).toEqual([]);
      } finally {
        fs.rmSync(dist, { recursive: true, force: true });
      }
    });
  });
});

describe('check-bundle-budget — precache rules', () => {
  const within = {
    initialJsKb: 3000,
    initialCssKb: 300,
    largestChunk: { file: 'vendor.js', kb: 1400 },
    precacheTotalKb: 9000,
    largestNonCodePrecached: { file: 'pwa-512x512.png', kb: 40 },
  };

  it('pins the MYK9-1356 ceilings', () => {
    expect(BUDGETS.precacheTotalKb).toBe(12288);
    expect(BUDGETS.precacheNonCodeFileKb).toBe(1024);
  });

  it('passes when the precache is within both ceilings', () => {
    expect(evaluateBudgets(within, BUDGETS)).toEqual([]);
  });

  it('passes at exactly the ceilings (strictly-greater gate)', () => {
    const atLimit = {
      ...within,
      precacheTotalKb: BUDGETS.precacheTotalKb,
      largestNonCodePrecached: { file: 'a.png', kb: BUDGETS.precacheNonCodeFileKb },
    };
    expect(evaluateBudgets(atLimit, BUDGETS)).toEqual([]);
  });

  it('flags a precache total over 12 MB', () => {
    const v = evaluateBudgets({ ...within, precacheTotalKb: BUDGETS.precacheTotalKb + 1 }, BUDGETS);
    expect(v).toHaveLength(1);
    expect(v[0].metric).toBe('Precache total');
    expect(v[0].actual).toBe(BUDGETS.precacheTotalKb + 1);
  });

  it('flags a non-code file over 1 MB and names it', () => {
    const v = evaluateBudgets(
      { ...within, largestNonCodePrecached: { file: 'images/hero.png', kb: 2200 } },
      BUDGETS
    );
    expect(v).toHaveLength(1);
    expect(v[0].metric).toContain('images/hero.png');
    expect(v[0].budget).toBe(BUDGETS.precacheNonCodeFileKb);
  });

  it('skips precache rules when the stats carry no precache facts', () => {
    const plain = {
      initialJsKb: within.initialJsKb,
      initialCssKb: within.initialCssKb,
      largestChunk: within.largestChunk,
    };
    expect(evaluateBudgets(plain, BUDGETS)).toEqual([]);
  });
});

describe('check-bundle-budget — parsePrecacheUrls', () => {
  it('extracts url pairs from minified workbox manifest output, deduped and normalised', () => {
    const sw =
      'x([{"revision":null,"url":"assets/scripts/a-1.js"},{"revision":"abc","url":"/index.html"},' +
      '{"revision":"d","url":"stats.html?__WB_REVISION__=d"},{"revision":null,"url":"assets/scripts/a-1.js"}]);' +
      'icon:"/pwa-192x192.png"';
    expect(parsePrecacheUrls(sw)).toEqual(['assets/scripts/a-1.js', 'index.html', 'stats.html']);
  });
});

describe('check-bundle-budget — collectBundleStats precache manifest', () => {
  let distDir: string;

  beforeAll(() => {
    distDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bundle-budget-sw-'));
    fs.mkdirSync(path.join(distDir, 'assets/scripts'), { recursive: true });
    const write = (rel: string, kb: number) =>
      fs.writeFileSync(path.join(distDir, rel), Buffer.alloc(kb * 1024));
    write('assets/scripts/index-A.js', 100);
    write('assets/scripts/lazy-B.js', 300);
    write('stats.html', 4500);
    write('pwa-192x192.png', 20);
    write('not-precached.pdf', 3000); // on disk but absent from the manifest
    fs.writeFileSync(
      path.join(distDir, 'index.html'),
      '<!doctype html><script type="module" src="/assets/scripts/index-A.js"></script>'
    );
    fs.writeFileSync(
      path.join(distDir, 'sw-custom.js'),
      'precache([{"url":"assets/scripts/index-A.js"},{"url":"assets/scripts/lazy-B.js"},' +
        '{"url":"stats.html"},{"url":"pwa-192x192.png"},{"url":"gone.png"}])'
    );
  });

  afterAll(() => {
    fs.rmSync(distDir, { recursive: true, force: true });
  });

  it('totals only manifest files that exist and reports the largest non-code one', () => {
    const stats = collectBundleStats(distDir);
    expect(stats.precacheManifestFound).toBe(true);
    expect(stats.precacheFileCount).toBe(4);
    expect(stats.precacheTotalKb).toBe(100 + 300 + 4500 + 20);
    expect(stats.largestNonCodePrecached).toEqual({ file: 'stats.html', kb: 4500 });
  });

  it('turns a precached treemap into a budget violation end to end', () => {
    const v = evaluateBudgets(collectBundleStats(distDir), BUDGETS);
    expect(v.map(x => x.metric)).toEqual(['Largest non-code precached file (stats.html)']);
  });

  it('reports no manifest when dist has no sw-custom.js', () => {
    // Own directory: deleting the shared fixture's sw-custom.js would make the
    // tests above order-dependent under CI's shuffled test sequence.
    const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'bundle-budget-nosw-'));
    try {
      fs.writeFileSync(path.join(bare, 'index.html'), '<!doctype html>');
      expect(collectBundleStats(bare).precacheManifestFound).toBe(false);
    } finally {
      fs.rmSync(bare, { recursive: true, force: true });
    }
  });
});
