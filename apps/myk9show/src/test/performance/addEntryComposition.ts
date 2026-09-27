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
const reportPath = resolve(
  appRoot,
  '../..',
  process.env.MYK9_PERF_REPORT_PATH ??
    `docs/qa/perf-baseline-${new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })}.md`
);
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
