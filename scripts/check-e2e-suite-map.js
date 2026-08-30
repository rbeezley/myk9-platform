#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const suiteMapPath = path.join(repoRoot, 'docs/qa/e2e-suite-map.md');
const suiteMap = fs.readFileSync(suiteMapPath, 'utf8');

const mappedSpecs = new Set(
  Array.from(suiteMap.matchAll(/`(apps\/[^`]+\.spec\.ts)`/g), match => match[1])
);

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, files);
      continue;
    }
    if (
      entry.isFile() &&
      entry.name.endsWith('.spec.ts') &&
      fullPath.includes(`${path.sep}e2e${path.sep}`)
    ) {
      files.push(path.relative(repoRoot, fullPath).split(path.sep).join('/'));
    }
  }
  return files;
}

const actualSpecs = new Set(walk(path.join(repoRoot, 'apps')).sort());

const missingFromMap = [...actualSpecs].filter(spec => !mappedSpecs.has(spec));
const staleInMap = [...mappedSpecs].filter(spec => !actualSpecs.has(spec));

/**
 * Presence is not classification.
 *
 * The checks above only ask whether a path appears SOMEWHERE in the map. That
 * let six specs land under `## PR Smoke` — including one whose own header says
 * it is not a CI spec — while this script reported the map clean. A map that
 * misfiles a spec claims coverage CI does not run, which is worse than an
 * unmapped spec: an unmapped spec is visibly unowned, a misfiled one looks
 * owned and is not.
 *
 * So the two CI-gated sections are cross-checked against the Playwright config
 * that actually selects them. The other sections (feature-audit, manual-debug,
 * candidate-delete, repair queue) are editorial by design and have no config
 * to compare against.
 */
const CI_SECTIONS = [
  { heading: '## PR Smoke', constant: 'PR_SMOKE_SPECS' },
  { heading: '### Playwright', constant: 'REGRESSION_SPECS' },
];

const playwrightConfig = fs.readFileSync(
  path.join(repoRoot, 'apps/myk9show/playwright.ci.config.ts'),
  'utf8'
);

/** Spec globs listed in a `const NAME = [...]` array in the Playwright config. */
function configuredSpecs(constant) {
  const match = new RegExp(`${constant}\\s*=\\s*\\[(.*?)\\n\\];`, 's').exec(playwrightConfig);
  if (!match) throw new Error(`${constant} not found in playwright.ci.config.ts`);
  return Array.from(match[1].matchAll(/'\*\*\/([^']+)'/g), m => m[1]);
}

/** Spec paths listed in the table under an exact heading line. */
function sectionSpecs(heading) {
  const lines = suiteMap.split('\n');
  const start = lines.findIndex(line => line.trimEnd() === heading);
  if (start === -1) throw new Error(`heading not found in suite map: ${heading}`);
  const level = heading.length - heading.replace(/^#+/, '').length;
  const found = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i];
    const isHeading = line.startsWith('#');
    if (isHeading && line.length - line.replace(/^#+/, '').length <= level) break;
    const cell = /^\| `(apps\/[^`]+\.spec\.ts)`/.exec(line);
    if (cell) found.push(cell[1]);
  }
  return found;
}

/**
 * Specs named directly by a shell script or workflow rather than selected by a
 * config array — `run-nightly-health.sh` launches route-health-by-role.spec.ts
 * that way. Without this, those read as unrun and the check emits a false
 * positive, which on a gate is worse than no check: a noisy gate gets muted.
 */
function invokedByName() {
  const roots = [path.join(repoRoot, 'scripts'), path.join(repoRoot, '.github/workflows')];
  const named = new Set();
  const visit = dir => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(full);
        continue;
      }
      const text = fs.readFileSync(full, 'utf8');
      for (const m of text.matchAll(/([A-Za-z0-9._/-]+\.spec\.ts)/g)) {
        named.add(path.basename(m[1]));
      }
    }
  };
  roots.forEach(visit);
  return named;
}

const namedInScripts = invokedByName();

const misfiled = [];
for (const { heading, constant } of CI_SECTIONS) {
  const configured = configuredSpecs(constant);
  for (const spec of sectionSpecs(heading)) {
    const selectedByConfig = configured.some(pattern => spec.endsWith(pattern));
    const launchedByName = namedInScripts.has(path.basename(spec));
    if (!selectedByConfig && !launchedByName) {
      misfiled.push({ spec, heading, constant });
    }
  }
}

if (missingFromMap.length === 0 && staleInMap.length === 0 && misfiled.length === 0) {
  console.log(
    `E2E suite map covers ${actualSpecs.size} spec files; ` +
      `its CI sections agree with playwright.ci.config.ts.`
  );
  process.exit(0);
}

if (misfiled.length > 0) {
  console.error('Suite map lists specs under a CI section that does not run them:');
  for (const { spec, heading, constant } of misfiled) {
    console.error(`  - ${spec}`);
    console.error(`      filed under "${heading}" but absent from ${constant}`);
  }
}

if (missingFromMap.length > 0) {
  console.error('Spec files missing from docs/qa/e2e-suite-map.md:');
  for (const spec of missingFromMap) {
    console.error(`  - ${spec}`);
  }
}

if (staleInMap.length > 0) {
  console.error('Suite map entries that do not match a spec file:');
  for (const spec of staleInMap) {
    console.error(`  - ${spec}`);
  }
}

process.exit(1);
