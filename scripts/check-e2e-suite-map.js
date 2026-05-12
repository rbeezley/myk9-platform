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

if (missingFromMap.length === 0 && staleInMap.length === 0) {
  console.log(`E2E suite map covers ${actualSpecs.size} spec files.`);
  process.exit(0);
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
