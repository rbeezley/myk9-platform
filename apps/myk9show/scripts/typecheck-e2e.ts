import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export type E2EDiagnostic = {
  file: string;
  code: string;
  message: string;
};

export type E2EDiagnosticComparison = {
  current: E2EDiagnostic[];
  newDiagnostics: E2EDiagnostic[];
  resolvedDiagnostics: E2EDiagnostic[];
};

export const DEFAULT_CONFIG_PATH = 'tsconfig.e2e.json';
export const DEFAULT_BASELINE_PATH = 'scripts/typecheck-e2e.baseline.json';

const DIAGNOSTIC_PATTERN = /^(.*)\(\d+,\d+\): error (TS\d+): (.*)$/;

export function parseDiagnostics(output: string): E2EDiagnostic[] {
  return output
    .split(/\r?\n/)
    .flatMap(line => {
      const match = DIAGNOSTIC_PATTERN.exec(line);
      return match ? [{ file: match[1], code: match[2], message: match[3] }] : [];
    })
    .sort(compareDiagnosticKeys);
}

function diagnosticKey(diagnostic: E2EDiagnostic) {
  return `${diagnostic.file}|${diagnostic.code}|${diagnostic.message}`;
}

function compareDiagnosticKeys(a: E2EDiagnostic, b: E2EDiagnostic) {
  return diagnosticKey(a).localeCompare(diagnosticKey(b));
}

function countDiagnostics(diagnostics: E2EDiagnostic[]) {
  const counts = new Map<string, number>();
  for (const diagnostic of diagnostics) {
    const key = diagnosticKey(diagnostic);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function subtractDiagnostics(
  left: E2EDiagnostic[],
  right: E2EDiagnostic[]
): E2EDiagnostic[] {
  const remaining = countDiagnostics(right);
  return left.filter(diagnostic => {
    const key = diagnosticKey(diagnostic);
    const count = remaining.get(key) ?? 0;
    if (count === 0) return true;
    remaining.set(key, count - 1);
    return false;
  });
}

export function compareDiagnostics(
  current: E2EDiagnostic[],
  baseline: E2EDiagnostic[]
): E2EDiagnosticComparison {
  return {
    current,
    newDiagnostics: subtractDiagnostics(current, baseline),
    resolvedDiagnostics: subtractDiagnostics(baseline, current),
  };
}

export function readBaseline(path: string): E2EDiagnostic[] {
  return JSON.parse(readFileSync(path, 'utf8')) as E2EDiagnostic[];
}

export function writeBaseline(path: string, diagnostics: E2EDiagnostic[]) {
  writeFileSync(path, `${JSON.stringify(diagnostics.sort(compareDiagnosticKeys), null, 2)}\n`);
}

function renderDiagnostics(title: string, diagnostics: E2EDiagnostic[]) {
  if (diagnostics.length === 0) return '';
  return `\n${title}:\n${diagnostics
    .map(diagnostic => `- ${diagnostic.file}: ${diagnostic.code} ${diagnostic.message}`)
    .join('\n')}`;
}

export function runCli(
  args: string[] = process.argv.slice(2),
  rootDir = process.cwd()
) {
  const configPath = args.find(arg => arg.startsWith('--config='))?.split('=')[1] ?? DEFAULT_CONFIG_PATH;
  const baselinePath = join(
    rootDir,
    args.find(arg => arg.startsWith('--baseline='))?.split('=')[1] ?? DEFAULT_BASELINE_PATH
  );
  const result = spawnSync('tsc', ['--noEmit', '--project', configPath], {
    cwd: rootDir,
    encoding: 'utf8',
  });
  if (result.error) throw result.error;

  const current = parseDiagnostics(`${result.stdout ?? ''}\n${result.stderr ?? ''}`);
  if (result.status !== 0 && current.length === 0) {
    console.error(`${result.stdout ?? ''}${result.stderr ?? ''}`);
    return 1;
  }
  if (args.includes('--update-baseline')) {
    writeBaseline(baselinePath, current);
    console.log(`Updated ${baselinePath} with ${current.length} diagnostics.`);
    return 0;
  }

  const baseline = readBaseline(baselinePath);
  const comparison = compareDiagnostics(current, baseline);
  console.log(
    `E2E typecheck ratchet: ${current.length} current, ${baseline.length} baselined, ` +
      `${comparison.newDiagnostics.length} new, ${comparison.resolvedDiagnostics.length} resolved.`
  );
  console.log(renderDiagnostics('New diagnostics (gate failure)', comparison.newDiagnostics));
  console.log(renderDiagnostics('Known diagnostics (ratcheted)', current));

  return comparison.newDiagnostics.length > 0 ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = runCli();
}
