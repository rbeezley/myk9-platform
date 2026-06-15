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
};

const toKb = bytes => Math.round((bytes / 1024) * 10) / 10;

/** Walk a directory recursively, returning absolute file paths. */
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
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

  return {
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
  for (const f of stats.initialJsFiles) console.log(`      ${String(f.kb).padStart(8)} KB  ${f.file}`);
  console.log(`   Initial CSS:  ${stats.initialCssKb} KB / ${BUDGETS.initialCssKb} KB`);
  console.log(
    `   Largest chunk: ${stats.largestChunk.kb} KB / ${BUDGETS.maxChunkKb} KB  (${stats.largestChunk.file})`
  );
  console.log(`   Chunk count:  ${stats.chunkCount}\n`);

  const violations = evaluateBudgets(stats);
  if (violations.length > 0) {
    console.error('❌ Bundle budget exceeded:');
    for (const v of violations) {
      console.error(`   ${v.metric}: ${v.actual} KB exceeds ${v.budget} KB budget`);
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
