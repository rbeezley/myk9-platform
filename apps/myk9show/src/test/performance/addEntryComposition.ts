import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';

interface TreeNode {
  name: string;
  uid?: string;
  children?: TreeNode[];
}

interface VisualizerData {
  tree: TreeNode;
  nodeParts: Record<string, { renderedLength: number }>;
}

const appRoot = process.cwd();
const repoRoot = resolve(appRoot, '../..');
const reportPath = resolve(appRoot, '../../docs/qa/perf-baseline-2026-09-26.md');
const stats = readFileSync(resolve(appRoot, 'dist/stats.html'), 'utf8');
const marker = 'const data = ';
const start = stats.indexOf(marker);
if (start < 0) throw new Error('Vite visualizer data was not found in dist/stats.html');
const jsonStart = start + marker.length;
const jsonEnd = stats.indexOf(';\n', jsonStart);
if (jsonEnd < 0) throw new Error('Vite visualizer data was not terminated');
const data = JSON.parse(stats.slice(jsonStart, jsonEnd)) as VisualizerData;

const html = readFileSync(resolve(appRoot, 'dist/index.html'), 'utf8');
const entryPath = html.match(/assets\/scripts\/index-[^" ]+\.js/)?.[0];
if (!entryPath) throw new Error('Production entry script was not found in dist/index.html');
const entry = data.tree.children?.find(node => node.name === entryPath);
if (!entry) throw new Error(`Production entry ${entryPath} was not found in visualizer data`);

function renderedBytes(node: TreeNode): number {
  return node.children
    ? node.children.reduce((sum, child) => sum + renderedBytes(child), 0)
    : (data.nodeParts[node.uid ?? '']?.renderedLength ?? 0);
}

function descendants(node: TreeNode): TreeNode[] {
  return [node, ...(node.children ?? []).flatMap(descendants)];
}

const all = descendants(entry);
const dependencies = all.find(node => node.name === 'node_modules/.pnpm');
const appSource = entry.children?.find(node => node.name === 'src');
const sharedPackages = all.find(node => node.name === 'packages');
const topDependencies = [...(dependencies?.children ?? [])]
  .sort((a, b) => renderedBytes(b) - renderedBytes(a))
  .slice(0, 10);
const lines = [
  '## Entry chunk composition',
  '',
  `Production entry: \`${entryPath}\`. Vite visualizer reports rendered module lengths before final minification; these numbers describe relative contributors and must not be added to the minified file size.`,
  '',
  '| Source group | Visualizer rendered bytes |',
  '|---|---:|',
  `| App source (\`src\`) | ${(appSource ? renderedBytes(appSource) : 0).toLocaleString()} |`,
  `| Shared workspace packages | ${(sharedPackages ? renderedBytes(sharedPackages) : 0).toLocaleString()} |`,
  `| pnpm dependencies | ${(dependencies ? renderedBytes(dependencies) : 0).toLocaleString()} |`,
  '',
  '| Largest dependency groups in the entry | Visualizer rendered bytes |',
  '|---|---:|',
  ...topDependencies.map(
    node => `| \`${node.name.replace(/@\d.*$/, '')}\` | ${renderedBytes(node).toLocaleString()} |`
  ),
  '',
  'The visualizer import graph traces `@react-pdf/renderer` through `publishPremium.tsx` → `publishExperience.tsx` → `premiumPublishCoordinator.ts` → `ShowManagementShell.tsx` → `ShowDetailsPage.tsx` → `publicRoutes.tsx` → `router.tsx` → `main.tsx`. PDF rendering is therefore present in the public entry path before a visitor requests a PDF.',
  '',
  '`router.tsx` also imports `adminRoutes.tsx` for every visitor. Its admin route definitions use `highPriority` and `critical` presets, and `createEnhancedLazy` schedules those imports at browser idle. This matches the admin chunks observed on anonymous pages. Separate MYK9-844 follow-ups should split the entry import chain and gate admin preloading by role.',
  '',
  '## Prioritized follow-up for MYK9-844',
  '',
  '1. Split the static PDF/rendering import chain out of the entry script. Every tested route pays for the large entry transfer on a cold visit; verify the split by comparing entry bytes and cold mobile medians.',
  '2. Gate idle admin-route preloads by authorization. Public route samples fetch admin chunks even though anonymous visitors cannot use those pages; verify that public requests no longer include admin page chunks.',
  '3. Trace secretary and ringside data readiness separately. Show Day, Entries, Results, and scoring show slow or blocked attempts after the shell loads. The Reports route crashed Chromium in repeated attempts. Capture route-specific request and browser-memory evidence before choosing a fix.',
  '',
  '## Tooling consolidation',
  '',
  'The issue’s “exhibitor dashboard” and “My Shows” destinations both resolve to the canonical `/exhibitor/entries` route; the matrix measures that page once per profile. Secretary Show Map and workbench concerns are represented by the dashboard and show-scoped setup, show-day, entries, results, and reports routes. `/secretary/run-order` is a legacy redirect; run-order work lives in Show Day and ringside.',
  '',
  '`performance.spec.ts` used Playwright tests under the Vitest-only `test:performance` directory and stale paths; it had no direct CI or e2e-map reference. `measure-loading-performance.ts` hardcoded a dev URL and was only named by the historical logging-migration file list. The production-build benchmark replaces their load-measurement purpose, and its report tests run under `test:performance`.',
  '',
];

const report = readFileSync(reportPath, 'utf8');
const existing = report.indexOf('## Entry chunk composition');
const fieldData = report.indexOf('## Field data and limitations');
if (fieldData < 0) throw new Error('Baseline report lacks the field-data section');
const withoutOld = existing < 0 ? report : report.slice(0, existing) + report.slice(fieldData);
const insertion = withoutOld.indexOf('## Field data and limitations');
const browserVersion = execFileSync(chromium.executablePath(), ['--version'], {
  encoding: 'utf8',
}).trim();
const buildRef = execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd: repoRoot,
  encoding: 'utf8',
}).trim();
const enriched = (
  withoutOld.slice(0, insertion) +
  lines.join('\n') +
  '\n' +
  withoutOld.slice(insertion)
)
  .replace('Build ref: local worktree', `Build ref: ${buildRef} (local worktree)`)
  .replace(
    'Production Vite build served locally with Playwright Chromium.',
    `Production Vite build served locally with Playwright ${browserVersion}.`
  )
  .replace('verified read-only role RPCs', 'verified read-only RPCs')
  .replace(
    'Time-to-usable stops when the route heading becomes visible.',
    'Time-to-usable stops when the route-specific primary-content selector becomes visible.'
  );
writeFileSync(reportPath, enriched);
console.log(`Entry composition added: ${entryPath}`);
