/**
 * MYK9-1648: every ADDED or MODIFIED OpenSpec scenario names the test that
 * proves it. Static checks only: a PROOF exists, its file exists, a non-.sql
 * pointer names a test. Whether the named test is live is decided by running it
 * filtered by name (`opsx:verify`), never by this script.
 *
 * Pointer format, a bullet inside the scenario after its WHEN/THEN bullets:
 *
 *   - **PROOF** <repo-relative test path> :: <test name substring>
 *
 * `:: <name>` may be omitted only for `.sql` files, where the file is the test.
 * A scenario may carry several PROOF bullets.
 *
 * Change mode: `tsx scripts/qa/openspec-scenario-proof.ts <change-id>` exits 1
 * listing each failing scenario, and on success prints one `<path> :: <name>` line
 * per distinct pointer (just `<path>` for .sql) so the caller runs each by name.
 *
 * `--change-root <dir>` (absolute or repo-relative) overrides `openspec/changes/<id>`
 * for a resolved planning home. Report mode: `--report` counts proven/unproven scenarios per main spec so
 * backfill can be prioritised. Always exits 0.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

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
  const m = /^(.*?)\s+::(?:\s+(.*))?$/.exec(text.trim());
  if (!m) return { path: text.trim(), testName: null };
  const name = (m[2] ?? '').trim();
  return { path: (m[1] ?? '').trim(), testName: name === '' ? null : name };
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

export function formatPointer(p: ProofPointer): string {
  return p.testName === null ? p.path : `${p.path} :: ${p.testName}`;
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
    if (proof.testName === null && !proof.path.endsWith('.sql'))
      reasons.push(`PROOF needs ":: <test name>" (only .sql files may omit it): ${proof.path}`);
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
  /** Distinct `<path> :: <name>` lines (`<path>` for .sql) for the caller to run by name. */
  pointers: string[];
  scenarioCount: number;
}

export function checkChange(repoRoot: string, changeId: string, changeRoot?: string): ChangeResult {
  const root = changeRoot
    ? resolve(repoRoot, changeRoot)
    : join(repoRoot, 'openspec/changes', changeId);
  const specsDir = join(root, 'specs');
  if (!existsSync(root)) throw new Error(`No such change directory: ${root}`);
  const failures: ScenarioFailure[] = [];
  const pointers = new Set<string>();
  let scenarioCount = 0;
  for (const file of specFilesUnder(specsDir)) {
    const rel = file.slice(repoRoot.length + 1);
    for (const scenario of scenariosOwingProof(readFileSync(file, 'utf8'))) {
      scenarioCount += 1;
      const reasons = checkScenario(scenario, repoRoot);
      for (const reason of reasons) failures.push({ scenario: scenario.name, spec: rel, reason });
      if (reasons.length === 0) scenario.proofs.forEach(p => pointers.add(formatPointer(p)));
    }
  }
  return { failures, pointers: [...pointers].sort(), scenarioCount };
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

export function evaluateChange(
  repoRoot: string,
  changeId: string,
  changeRoot?: string
): ChangeVerdict {
  const result = checkChange(repoRoot, changeId, changeRoot);
  if (result.failures.length > 0) {
    const unproven = new Set(result.failures.map(f => `${f.spec}\0${f.scenario}`)).size;
    if (grandfatheredIds(repoRoot).includes(changeId))
      return {
        code: 0,
        stdout: [
          `WARNING: change "${changeId}" is grandfathered (MYK9-1648) with ${unproven} unproven scenario(s); not failing.`,
          ...result.pointers,
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
  return { code: 0, stdout: result.pointers, stderr: [] };
}

export function runCli(argv: string[], repoRoot: string): ChangeVerdict {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { 'change-root': { type: 'string' }, report: { type: 'boolean' } },
  });
  if (values.report) {
    const rows = reportSpecs(repoRoot);
    const total = rows.reduce((n, r) => n + r.total, 0);
    const unproven = rows.reduce((n, r) => n + r.unproven, 0);
    return {
      code: 0,
      stdout: [
        ...rows.map(r => `${r.unproven}\t${r.proven}/${r.total}\t${r.spec}`),
        `TOTAL unproven ${unproven} of ${total} scenarios across ${rows.length} specs`,
      ],
      stderr: [],
    };
  }
  const changeId = positionals[0];
  if (!changeId)
    return {
      code: 2,
      stdout: [],
      stderr: ['Usage: openspec-scenario-proof.ts <change-id> [--change-root <dir>] | --report'],
    };
  return evaluateChange(repoRoot, changeId, values['change-root']);
}

function main(argv: string[]): number {
  const verdict = runCli(argv, resolve(__dirname, '../..'));
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
