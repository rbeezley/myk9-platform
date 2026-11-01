/**
 * MYK9-1648: every ADDED or MODIFIED OpenSpec scenario names the test that
 * proves it, and the named test exists.
 *
 * Pointer format, a bullet inside the scenario after its WHEN/THEN bullets:
 *
 *   - **PROOF** <repo-relative test path> :: <test name substring>
 *
 * `:: <name>` may be omitted only for `.sql` files, where the file is the test.
 * A scenario may carry several PROOF bullets.
 *
 * Change mode: `tsx scripts/qa/openspec-scenario-proof.ts <change-id>` exits 1
 * listing each failing scenario, and on success prints the distinct proof files
 * (one per line) so the caller can run them. Whether they ran green is the
 * caller's job (`opsx:verify`).
 *
 * Report mode: `--report` counts proven/unproven scenarios per main spec so
 * backfill can be prioritised. Always exits 0.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

export interface ProofPointer {
  path: string;
  testName: string | null;
}

export interface Scenario {
  name: string;
  section: string;
  proofs: ProofPointer[];
}

export interface ScenarioFailure {
  scenario: string;
  spec: string;
  reason: string;
}

const PROOF_LINE = /^\s*[-*]\s+\*\*PROOF\*\*\s+(.+?)\s*$/;

export function parseProofPointer(text: string): ProofPointer {
  const idx = text.indexOf(' :: ');
  if (idx === -1) return { path: text.trim(), testName: null };
  const name = text.slice(idx + 4).trim();
  return { path: text.slice(0, idx).trim(), testName: name === '' ? null : name };
}

/** All scenarios in a spec file, with the `## ` section each sits under. */
export function parseScenarios(markdown: string): Scenario[] {
  const scenarios: Scenario[] = [];
  let section = '';
  let current: Scenario | null = null;
  let inFence = false;
  for (const line of markdown.split(/\r?\n/)) {
    if (/^\s*```/.test(line)) inFence = !inFence;
    if (inFence) continue;
    const sectionMatch = /^## (.+?)\s*$/.exec(line);
    if (sectionMatch) {
      section = sectionMatch[1] ?? '';
      current = null;
      continue;
    }
    const scenarioMatch = /^#### Scenario:\s*(.*?)\s*$/.exec(line);
    if (scenarioMatch) {
      const created: Scenario = { name: scenarioMatch[1] ?? '', section, proofs: [] };
      scenarios.push(created);
      current = created;
      continue;
    }
    if (/^#{1,4} /.test(line)) {
      current = null;
      continue;
    }
    const proofText = current ? PROOF_LINE.exec(line)?.[1] : undefined;
    if (current && proofText) current.proofs.push(parseProofPointer(proofText));
  }
  return scenarios;
}

/** Only ADDED and MODIFIED requirements owe proof; REMOVED and RENAMED do not. */
export function scenariosOwingProof(markdown: string): Scenario[] {
  return parseScenarios(markdown).filter(s => /^(ADDED|MODIFIED) Requirements\b/i.test(s.section));
}

export function checkScenario(scenario: Scenario, repoRoot: string): string[] {
  if (scenario.proofs.length === 0) return ['no PROOF bullet'];
  const reasons: string[] = [];
  for (const proof of scenario.proofs) {
    const abs = resolve(repoRoot, proof.path);
    if (!existsSync(abs)) {
      reasons.push(`PROOF file does not exist: ${proof.path}`);
      continue;
    }
    if (proof.testName === null) {
      if (!proof.path.endsWith('.sql'))
        reasons.push(`PROOF needs ":: <test name>" (only .sql files may omit it): ${proof.path}`);
      continue;
    }
    if (!readFileSync(abs, 'utf8').includes(proof.testName))
      reasons.push(`test name not found in ${proof.path}: "${proof.testName}"`);
  }
  return reasons;
}

function specFilesUnder(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...specFilesUnder(full));
    else if (entry.name === 'spec.md') out.push(full);
  }
  return out.sort();
}

export interface ChangeResult {
  failures: ScenarioFailure[];
  proofFiles: string[];
  scenarioCount: number;
}

export function checkChange(repoRoot: string, changeId: string): ChangeResult {
  const specsDir = join(repoRoot, 'openspec/changes', changeId, 'specs');
  if (!existsSync(join(repoRoot, 'openspec/changes', changeId)))
    throw new Error(`No such change: openspec/changes/${changeId}`);
  const failures: ScenarioFailure[] = [];
  const proofFiles = new Set<string>();
  let scenarioCount = 0;
  for (const file of specFilesUnder(specsDir)) {
    const rel = file.slice(repoRoot.length + 1);
    for (const scenario of scenariosOwingProof(readFileSync(file, 'utf8'))) {
      scenarioCount += 1;
      const reasons = checkScenario(scenario, repoRoot);
      for (const reason of reasons) failures.push({ scenario: scenario.name, spec: rel, reason });
      if (reasons.length === 0) scenario.proofs.forEach(p => proofFiles.add(p.path));
    }
  }
  return { failures, proofFiles: [...proofFiles].sort(), scenarioCount };
}

export interface SpecReport {
  spec: string;
  total: number;
  proven: number;
  unproven: number;
}

export function reportSpecs(repoRoot: string): SpecReport[] {
  const rows = specFilesUnder(join(repoRoot, 'openspec/specs')).map(file => {
    const scenarios = parseScenarios(readFileSync(file, 'utf8'));
    const proven = scenarios.filter(s => checkScenario(s, repoRoot).length === 0).length;
    const spec = file.slice(join(repoRoot, 'openspec/specs').length + 1).replace(/\/spec\.md$/, '');
    return { spec, total: scenarios.length, proven, unproven: scenarios.length - proven };
  });
  return rows.sort((a, b) => b.unproven - a.unproven || a.spec.localeCompare(b.spec));
}

export const GRANDFATHERED_FILE = 'scripts/qa/openspec-proof-grandfathered.txt';

/** Change ids that predate the gate; their unproven scenarios warn, never fail. */
export function grandfatheredIds(repoRoot: string): string[] {
  const file = join(repoRoot, GRANDFATHERED_FILE);
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l !== '' && !l.startsWith('#'));
}

export interface ChangeVerdict {
  code: number;
  stdout: string[];
  stderr: string[];
}

export function evaluateChange(repoRoot: string, changeId: string): ChangeVerdict {
  const result = checkChange(repoRoot, changeId);
  if (result.failures.length > 0) {
    const unproven = new Set(result.failures.map(f => `${f.spec}\0${f.scenario}`)).size;
    if (grandfatheredIds(repoRoot).includes(changeId))
      return {
        code: 0,
        stdout: [
          `WARNING: change "${changeId}" is grandfathered (MYK9-1648) with ${unproven} unproven scenario(s); not failing.`,
        ],
        stderr: [],
      };
    return {
      code: 1,
      stdout: [],
      stderr: [
        `Unproven scenarios in change "${changeId}":`,
        ...result.failures.map(f => `- ${f.spec}: "${f.scenario}": ${f.reason}`),
      ],
    };
  }
  return { code: 0, stdout: result.proofFiles, stderr: [] };
}

function main(argv: string[]): number {
  const repoRoot = resolve(__dirname, '../..');
  if (argv.includes('--report')) {
    const rows = reportSpecs(repoRoot);
    for (const r of rows) console.log(`${r.unproven}\t${r.proven}/${r.total}\t${r.spec}`);
    const total = rows.reduce((n, r) => n + r.total, 0);
    const unproven = rows.reduce((n, r) => n + r.unproven, 0);
    console.log(`TOTAL unproven ${unproven} of ${total} scenarios across ${rows.length} specs`);
    return 0;
  }
  const changeId = argv.find(a => !a.startsWith('-'));
  if (!changeId) {
    console.error('Usage: openspec-scenario-proof.ts <change-id> | --report');
    return 2;
  }
  const verdict = evaluateChange(repoRoot, changeId);
  verdict.stdout.forEach(l => console.log(l));
  verdict.stderr.forEach(l => console.error(l));
  return verdict.code;
}

if (process.argv[1]?.endsWith('/openspec-scenario-proof.ts')) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 2;
  }
}
