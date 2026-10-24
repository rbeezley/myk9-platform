#!/usr/bin/env node

/**
 * Bundle Budget Check (Dynamic QA — Phase 6)
 *
 * Enforces size budgets on the INITIAL-LOAD payload — the entry script plus
 * everything index.html eagerly fetches (modulepreload + stylesheet links) —
 * which is what actually gates first-paint performance. Lazy route chunks are
 * not summed into the initial budget (most never co-load); instead a per-chunk
 * ceiling guards against any single chunk ballooning.
 *
 * Why this replaces the previous check-bundle-size.js / check-performance-budgets.js:
 * those keyed off filename regexes like /index-[a-f0-9]+\.js$/, which never
 * matched Vite's mixed-case hashes (e.g. index-BotNwOFe.js), and their CLI guard
 * (`import.meta.url === ` + "`file://${process.argv[1]}`" + `) silently no-ops when the
 * repo path contains spaces ("AI Projects/"). Parsing index.html instead is
 * immune to both: it reads the exact asset URLs the app loads.
 *
 * The service worker's precache manifest (dist/sw-custom.js) is checked too: every
 * first-time visitor, ringside devices on venue wifi included, downloads all of it
 * up front. Two rules keep it lean: a total ceiling, and no non-code file (image,
 * PDF, treemap HTML...) above a per-file ceiling. See MYK9-1356, where an
 * unconditional bundle-visualizer, unused stock photos and registry PDFs had
 * grown it to 39.5 MB.
 *
 * A second guard keeps the PDF renderers off the pages that do not print. A page
 * chunk that statically imports a PDF chunk makes every visitor download and parse
 * it on first navigation (MYK9-1358); only lazy chunks that exist to hold PDF code
 * may import one (see PDF_CHUNK_POLICY).
 *
 * Budgets are RAW (uncompressed) KB, recorded from the current build with modest
 * headroom. RATCHET DOWN ONLY — never raise a budget to make a regression pass;
 * lower it as the bundle shrinks.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// RAW KB. Baseline measured 2026-06-15: initialJs 3120, initialCss 329, maxChunk 1476.
export const BUDGETS = {
  initialJsKb: 3300, // entry + eager (modulepreload) vendor chunks
  initialCssKb: 360, // stylesheets linked from index.html
  maxChunkKb: 1550, // ceiling for any single JS chunk (regression guard)
  precacheTotalKb: 12288, // 12 MB: everything the service worker fetches on first visit
  precacheNonCodeFileKb: 1024, // any precached file that is not .js/.css (MYK9-1356)
};

/**
 * A "PDF chunk" is a built JS chunk containing one of these case-sensitive
 * markers. Both survive minification: `yoga` is react-pdf's layout engine
 * (identifiers such as yogaNode), `fontkit` is the instance check in pdf-lib's
 * "no `fontkit` instance was found" error. Verified on the built chunks in
 * dist/assets/scripts; a marker that stops matching shows as a guard that
 * finds no PDF chunks, which the CLI prints.
 */
export const PDF_CHUNK_MARKERS = [
  { kind: 'react-pdf', marker: 'yoga' },
  { kind: 'pdf-lib', marker: 'fontkit' },
];

/**
 * Who may statically import a PDF chunk. Everything else (every page, panel and
 * shared chunk) must reach PDF code through a dynamic import() at the user
 * action. Chunk names are the emitted file name without its 8-character hash.
 * A new lazy PDF module fails this guard until it is listed here on purpose.
 */
export const PDF_CHUNK_POLICY = {
  lazyChunkNames: [
    /^[A-Za-z]+EntryBlankDocument$/, // loaded by EntryBlankDownloadControl on click
    /^pdfFonts$/, // font registration the entry-blank documents import
    /^publishExperience$/, // premium publish (MYK9-844), dynamic
    /^PremiumPdfDownloadLink$/, // premium editor PDF buttons, React.lazy
    /^(AKC|UKC)PremiumTemplate$/, // templates shared by the two premium chunks above
    /^mergeReportPdfs$/, // show desk merged-sheet preview, dynamic
    /^officialPdfDownload$/, // Reports page official PDFs, dynamic
  ],
  // Known route-level static imports that are still open. RATCHET DOWN ONLY.
  // The Reports route (its chunk is emitted as `index`) imports the pdf-lib
  // form builders directly in useAKCOfficialPdfAction.
  tolerated: [{ chunkName: 'index', kind: 'pdf-lib', max: 1 }],
};

const CODE_EXTENSIONS = new Set(['.js', '.css']);

const toKb = bytes => Math.round((bytes / 1024) * 10) / 10;

/** Walk a directory recursively, returning absolute file paths. */
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

/** The emitted chunk name: `ShowDetailsPage-hFmFCtUs.js` -> `ShowDetailsPage`. */
export function chunkName(file) {
  const base = path.basename(file);
  return base.replace(/-[A-Za-z0-9_-]{8}\.js$/, '');
}

const escapeRegExp = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Pure: given `{ file, source }` chunks, return every static import of a PDF
 * chunk as `{ importer, imported, kind }`. A static import is `from"./x.js"`,
 * `from './x.js'` or a bare `import"./x.js"`, with either quote; the dynamic
 * `import("./x.js")` has a `(` before the specifier and never matches.
 */
export function findPdfStaticImports(chunks) {
  const pdfChunks = chunks.flatMap(chunk =>
    PDF_CHUNK_MARKERS.filter(({ marker }) => chunk.source.includes(marker)).map(({ kind }) => ({
      file: chunk.file,
      kind,
    }))
  );
  const edges = [];
  for (const pdf of pdfChunks) {
    const specifier = new RegExp(
      `(?:from|import)\\s*(["'])\\./${escapeRegExp(path.basename(pdf.file))}\\1`
    );
    for (const chunk of chunks) {
      if (chunk.file === pdf.file) continue;
      if (specifier.test(chunk.source)) {
        edges.push({ importer: chunk.file, imported: pdf.file, kind: pdf.kind });
      }
    }
  }
  return edges;
}

/** Pure: the static PDF imports that policy does not allow, as violations. */
export function evaluatePdfChunkImports(edges, policy = PDF_CHUNK_POLICY) {
  const unlisted = edges.filter(
    edge => !policy.lazyChunkNames.some(pattern => pattern.test(chunkName(edge.importer)))
  );
  const violations = [];
  for (const rule of policy.tolerated) {
    const matching = unlisted.filter(
      edge => chunkName(edge.importer) === rule.chunkName && edge.kind === rule.kind
    );
    if (matching.length > rule.max) violations.push(...matching);
  }
  const toleratedKeys = new Set(policy.tolerated.map(rule => `${rule.chunkName}|${rule.kind}`));
  for (const edge of unlisted) {
    if (!toleratedKeys.has(`${chunkName(edge.importer)}|${edge.kind}`)) violations.push(edge);
  }
  return violations.map(edge => ({
    metric: 'PDF renderer chunk imported statically',
    actual: 1,
    budget: 0,
    file: edge.importer,
    imported: edge.imported,
    message: `${edge.importer} statically imports the ${edge.kind} chunk ${edge.imported}. Load it with import() at the user action instead.`,
  }));
}

/**
 * Extract the precached URLs from the (minified) service worker source. Workbox
 * injects the manifest as JSON-style `"url":"<path>"` pairs; any `?__WB_REVISION__`
 * query is dropped so the path maps back onto a file in dist. Pure.
 */
export function parsePrecacheUrls(swSource) {
  const urls = [...swSource.matchAll(/"url":"([^"]+)"/g)].map(m =>
    m[1].replace(/^\//, '').replace(/\?.*$/, '')
  );
  return [...new Set(urls)];
}

/** Stat the precached files under distDir. Files absent from dist are skipped. */
function measurePrecache(distDir, urls) {
  const files = urls
    .filter(rel => fs.existsSync(path.join(distDir, rel)))
    .map(rel => ({ file: rel, kb: toKb(fs.statSync(path.join(distDir, rel)).size) }));
  const nonCode = files
    .filter(f => !CODE_EXTENSIONS.has(path.extname(f.file).toLowerCase()))
    .sort((a, b) => b.kb - a.kb);
  return {
    precacheFileCount: files.length,
    precacheTotalKb: Math.round(files.reduce((sum, f) => sum + f.kb, 0) * 10) / 10,
    largestNonCodePrecached: nonCode[0] ?? { file: '(none)', kb: 0 },
  };
}

/**
 * Read dist/index.html + dist files and return the size facts the budget cares
 * about. Pure-ish (only reads the filesystem); the comparison lives in
 * evaluateBudgets so it can be unit-tested without a real build.
 */
export function collectBundleStats(distDir) {
  if (!fs.existsSync(path.join(distDir, 'index.html'))) {
    throw new Error(`No index.html in ${distDir}. Run the build first.`);
  }
  const html = fs.readFileSync(path.join(distDir, 'index.html'), 'utf8');
  const refs = [...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)].map(m =>
    m[1].replace(/^\//, '')
  );
  const sizeKb = rel => toKb(fs.statSync(path.join(distDir, rel)).size);

  const initialJs = refs.filter(f => f.endsWith('.js'));
  const initialCss = refs.filter(f => f.endsWith('.css'));

  const allChunks = walk(distDir)
    .filter(f => f.endsWith('.js'))
    .map(f => ({ file: path.relative(distDir, f), kb: toKb(fs.statSync(f).size) }))
    .sort((a, b) => b.kb - a.kb);

  const scriptsDir = path.join(distDir, 'assets', 'scripts');
  const scriptChunks = fs.existsSync(scriptsDir)
    ? walk(scriptsDir)
        .filter(f => f.endsWith('.js'))
        .map(f => ({
          file: path.relative(distDir, f).split(path.sep).join('/'),
          source: fs.readFileSync(f, 'utf8'),
        }))
    : [];
  const pdfChunkFiles = scriptChunks
    .filter(chunk => PDF_CHUNK_MARKERS.some(({ marker }) => chunk.source.includes(marker)))
    .map(chunk => chunk.file);

  const swPath = path.join(distDir, 'sw-custom.js');
  const precache = fs.existsSync(swPath)
    ? {
        precacheManifestFound: true,
        ...measurePrecache(distDir, parsePrecacheUrls(fs.readFileSync(swPath, 'utf8'))),
      }
    : { precacheManifestFound: false };

  return {
    pdfChunkFiles,
    pdfStaticImports: findPdfStaticImports(scriptChunks),
    ...precache,
    initialJsKb: Math.round(initialJs.reduce((s, f) => s + sizeKb(f), 0) * 10) / 10,
    initialCssKb: Math.round(initialCss.reduce((s, f) => s + sizeKb(f), 0) * 10) / 10,
    initialJsFiles: initialJs.map(f => ({ file: f, kb: sizeKb(f) })),
    initialCssFiles: initialCss.map(f => ({ file: f, kb: sizeKb(f) })),
    largestChunk: allChunks[0] ?? { file: '(none)', kb: 0 },
    chunkCount: allChunks.length,
  };
}

/**
 * Pure comparison: given collected stats and budgets, return the list of
 * violations (empty = within budget). Unit-tested directly.
 */
export function evaluateBudgets(stats, budgets = BUDGETS) {
  const violations = [];
  if (stats.initialJsKb > budgets.initialJsKb) {
    violations.push({
      metric: 'Initial JS',
      actual: stats.initialJsKb,
      budget: budgets.initialJsKb,
    });
  }
  if (stats.initialCssKb > budgets.initialCssKb) {
    violations.push({
      metric: 'Initial CSS',
      actual: stats.initialCssKb,
      budget: budgets.initialCssKb,
    });
  }
  if (stats.largestChunk.kb > budgets.maxChunkKb) {
    violations.push({
      metric: `Largest chunk (${stats.largestChunk.file})`,
      actual: stats.largestChunk.kb,
      budget: budgets.maxChunkKb,
    });
  }
  violations.push(...evaluatePdfChunkImports(stats.pdfStaticImports ?? []));
  // Precache rules apply only when the stats carry precache facts, so a unit
  // test (or caller) with plain initial-load stats is unaffected.
  if (
    typeof stats.precacheTotalKb === 'number' &&
    stats.precacheTotalKb > budgets.precacheTotalKb
  ) {
    violations.push({
      metric: 'Precache total',
      actual: stats.precacheTotalKb,
      budget: budgets.precacheTotalKb,
    });
  }
  const heavy = stats.largestNonCodePrecached;
  if (heavy && heavy.kb > budgets.precacheNonCodeFileKb) {
    violations.push({
      metric: `Largest non-code precached file (${heavy.file})`,
      actual: heavy.kb,
      budget: budgets.precacheNonCodeFileKb,
      file: heavy.file,
    });
  }
  return violations;
}

function runCli() {
  const distDir = path.resolve(__dirname, '..', 'dist');
  let stats;
  try {
    stats = collectBundleStats(distDir);
  } catch (err) {
    console.error(`❌ ${err.message}`);
    process.exit(1);
  }

  console.log('📦 Bundle budget check (initial-load payload)\n');
  console.log(`   Initial JS:   ${stats.initialJsKb} KB / ${BUDGETS.initialJsKb} KB`);
  for (const f of stats.initialJsFiles)
    console.log(`      ${String(f.kb).padStart(8)} KB  ${f.file}`);
  console.log(`   Initial CSS:  ${stats.initialCssKb} KB / ${BUDGETS.initialCssKb} KB`);
  console.log(
    `   Largest chunk: ${stats.largestChunk.kb} KB / ${BUDGETS.maxChunkKb} KB  (${stats.largestChunk.file})`
  );
  console.log(`   Chunk count:  ${stats.chunkCount}`);
  console.log(`   PDF chunks:   ${stats.pdfChunkFiles.join(', ') || '(none found)'}`);
  for (const e of stats.pdfStaticImports)
    console.log(`      static import: ${e.importer} -> ${e.imported} (${e.kind})`);
  if (stats.precacheManifestFound) {
    console.log(
      `   Precache:     ${stats.precacheTotalKb} KB / ${BUDGETS.precacheTotalKb} KB  (${stats.precacheFileCount} files)`
    );
    console.log(
      `   Largest non-code precached: ${stats.largestNonCodePrecached.kb} KB / ${BUDGETS.precacheNonCodeFileKb} KB  (${stats.largestNonCodePrecached.file})\n`
    );
  } else {
    console.error(
      '\n❌ No dist/sw-custom.js: cannot check the precache manifest. Run the build first.'
    );
    process.exit(1);
  }

  const violations = evaluateBudgets(stats);
  if (violations.length > 0) {
    console.error('❌ Bundle budget exceeded:');
    for (const v of violations) {
      console.error(
        v.message
          ? `   ${v.message}`
          : `   ${v.metric}: ${v.actual} KB exceeds ${v.budget} KB budget`
      );
    }
    console.error('\nReduce the bundle, or — only if the growth is justified — raise the');
    console.error('budget in scripts/check-bundle-budget.js with a comment explaining why.');
    process.exit(1);
  }
  console.log('✅ All bundle budgets satisfied.');
}

// Run only when executed directly. Compare resolved real paths (not a hand-built
// file:// URL) so a repo path containing spaces does not break detection.
const invokedPath = process.argv[1] ? fs.realpathSync(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  runCli();
}
