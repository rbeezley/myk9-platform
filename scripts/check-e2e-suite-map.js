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
 * Specs a script launches BY NAME rather than through a config array, declared
 * explicitly and per-section.
 *
 * An earlier version inferred this by grepping scripts and workflows for spec
 * filenames. That was wrong twice over, and both ways were found in review.
 * It scoped globally, so an invocation belonging to one suite vouched for a
 * spec filed under a different one. And it could not tell code from prose: it
 * stripped `#` comments but not `//`, so this file's own comments — which name
 * spec files, as this one does — fed the whitelist. Text scanning cannot
 * distinguish "this runs" from "this is mentioned", and three review rounds
 * went to patching that before the approach itself was the answer.
 *
 * A declaration is exact. It is also an allowlist, which this repo has been
 * bitten by before — but it fails in the safe direction: a new script-launched
 * spec filed under a CI section makes this check RED until someone declares
 * it, rather than silently passing. One line of maintenance, loudly enforced.
 */
const SCRIPT_LAUNCHED = {
  'route-health-by-role.spec.ts': {
    heading: '### Playwright',
    why: 'launched by name in scripts/qa/run-nightly-health.sh',
  },
};

const misfiled = [];
const undocumented = [];
for (const { heading, constant } of CI_SECTIONS) {
  const configured = configuredSpecs(constant);
  const documented = sectionSpecs(heading);

  // Both directions, because each one hides a different lie. A spec filed
  // under a CI section that does not run it OVERSTATES coverage; a spec the
  // config runs but the section omits UNDERSTATES it, leaving a gated spec
  // with no documented owner. The one-directional version of this check
  // passed while my-entries-page-ui.spec.ts was gating every PR and appeared
  // nowhere under "PR Smoke".
  for (const pattern of configured) {
    if (!documented.some(spec => spec.endsWith(pattern))) {
      undocumented.push({ pattern, heading, constant });
    }
  }

  for (const spec of documented) {
    const selectedByConfig = configured.some(pattern => spec.endsWith(pattern));
    const declared = SCRIPT_LAUNCHED[path.basename(spec)];
    const launchedForThisSection = declared !== undefined && declared.heading === heading;
    if (!selectedByConfig && !launchedForThisSection) {
      misfiled.push({ spec, heading, constant });
    }
  }
}

if (
  missingFromMap.length === 0 &&
  staleInMap.length === 0 &&
  misfiled.length === 0 &&
  undocumented.length === 0
) {
  console.log(
    `E2E suite map covers ${actualSpecs.size} spec files; ` +
      `its CI sections agree with playwright.ci.config.ts.`
  );
  process.exit(0);
}

if (undocumented.length > 0) {
  console.error('Specs that CI runs but the suite map does not document there:');
  for (const { pattern, heading, constant } of undocumented) {
    console.error(`  - ${pattern}`);
    console.error(`      selected by ${constant} but absent from "${heading}"`);
  }
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
