import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export type Phase4Status = 'ok' | 'fail';

export interface Phase4Check {
  key: string;
  status: Phase4Status;
  detail: string;
}

interface CliOptions {
  allowBlocked: boolean;
  rootDir: string;
}

const CHECKLIST_TOKENS = [
  '4.1 Show-Day Re-Walk',
  '4.2 Offline Reconnect Rehearsal',
  '4.3 Venue Hardware Print Test',
  '4.5 Real-User Testing',
  '4.6 Scorecard Close-Out',
  'Evidence slot',
] as const;

const LIVE_EVIDENCE_TOKENS = [
  'show-day re-walk evidence:',
  'offline reconnect evidence:',
  'venue hardware print evidence:',
  'real-user testing evidence:',
  'scorecard close-out evidence:',
] as const;

export function buildPhase4Checks(rootDir: string): Phase4Check[] {
  return [
    checkChecklistCoverage(rootDir),
    checkRunbookCoverage(rootDir),
    checkScorecardYellowGates(rootDir),
    checkReportTestCoverage(rootDir),
    checkLiveEvidenceRecorded(rootDir),
  ];
}

export function checkChecklistCoverage(rootDir: string): Phase4Check {
  const checklist = readOptional(
    path.join(rootDir, 'docs/operations/go-live-phase-4-evidence-checklist.md')
  );
  const missing = missingTokens(checklist, CHECKLIST_TOKENS);

  return {
    key: 'phase4_checklist_coverage',
    status: missing.length === 0 ? 'ok' : 'fail',
    detail:
      missing.length === 0
        ? 'operator checklist covers all Phase 4 gates'
        : `missing: ${missing.join(', ')}`,
  };
}

export function checkRunbookCoverage(rootDir: string): Phase4Check {
  const runbook = readOptional(path.join(rootDir, 'docs/operations/go-live-runbook.md'));
  const requiredTokens = [
    '4.1 Show-day re-walk',
    '4.2 Offline',
    '4.3 Venue hardware print test',
    '4.5 Real-user testing',
    '4.6 Scorecard close-out',
  ];
  const missing = missingTokens(runbook, requiredTokens);

  return {
    key: 'phase4_runbook_coverage',
    status: missing.length === 0 ? 'ok' : 'fail',
    detail:
      missing.length === 0
        ? 'runbook lists all Phase 4 evidence gates'
        : `missing: ${missing.join(', ')}`,
  };
}

export function checkScorecardYellowGates(rootDir: string): Phase4Check {
  const scorecard = readOptional(
    path.join(rootDir, 'docs/goals/fall-2026-launch-readiness-scorecard.md')
  );
  const requiredTokens = [
    'Show-day reliability',
    'Offline-first behavior',
    'Reports and official forms',
    'UX clarity',
    'Yellow',
  ];
  const missing = missingTokens(scorecard, requiredTokens);

  return {
    key: 'scorecard_yellow_gate_tracking',
    status: missing.length === 0 ? 'ok' : 'fail',
    detail:
      missing.length === 0
        ? 'scorecard still tracks Phase 4 evidence dimensions'
        : `missing: ${missing.join(', ')}`,
  };
}

export function checkReportTestCoverage(rootDir: string): Phase4Check {
  const reportTestPaths = [
    'apps/myk9show/src/components/reports/__tests__/CheckInSheet.test.tsx',
    'apps/myk9show/src/components/reports/__tests__/ScoresheetReport.test.tsx',
    'apps/myk9show/src/lib/reports/__tests__/reportRenderer.test.ts',
  ];
  const missing = reportTestPaths.filter(file => !existsSync(path.join(rootDir, file)));

  return {
    key: 'print_report_source_test_coverage',
    status: missing.length === 0 ? 'ok' : 'fail',
    detail:
      missing.length === 0
        ? 'representative report tests exist; hardware proof still required'
        : `missing: ${missing.join(', ')}`,
  };
}

export function checkLiveEvidenceRecorded(rootDir: string): Phase4Check {
  const tracker = readOptional(path.join(rootDir, 'docs/operations/go-live-opsx-batches.md'));
  const missing = LIVE_EVIDENCE_TOKENS.filter(token => !hasRecordedEvidence(tracker, token));

  return {
    key: 'phase4_live_evidence_recorded',
    status: missing.length === 0 ? 'ok' : 'fail',
    detail:
      missing.length === 0
        ? 'live evidence links are recorded'
        : `missing evidence slots: ${missing.join(', ')}`,
  };
}

function hasRecordedEvidence(text: string, token: string): boolean {
  const line = text
    .split(/\r?\n/)
    .find(candidate => candidate.includes(token) && !candidate.includes('missing evidence slots'));
  if (!line) return false;

  const afterToken = line.slice(line.indexOf(token) + token.length).trim();
  return (
    afterToken.length > 0 &&
    !afterToken.includes('<link>') &&
    !afterToken.includes('TBD') &&
    !afterToken.includes('missing')
  );
}

function readOptional(filePath: string): string {
  return existsSync(filePath) ? readFileSync(filePath, 'utf8') : '';
}

function missingTokens(text: string, tokens: readonly string[]): string[] {
  return tokens.filter(token => !text.includes(token));
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    allowBlocked: false,
    rootDir: process.cwd(),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--allow-blocked') {
      options.allowBlocked = true;
      continue;
    }

    if (arg === '--root') {
      options.rootDir = path.resolve(requireValue(argv, index, arg));
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function requireValue(argv: string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (!value) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

function formatChecks(checks: Phase4Check[]): string {
  return checks.map(check => `${check.status.padEnd(4)} ${check.key}: ${check.detail}`).join('\n');
}

export function runCli(argv: string[]): number {
  const options = parseArgs(argv);
  const checks = buildPhase4Checks(options.rootDir);
  const hasFailure = checks.some(check => check.status === 'fail');

  console.log('Go Live Phase 4 evidence-pass readiness');
  console.log(formatChecks(checks));
  console.log('');
  console.log(
    'Staging walks, hardware tests, real-user sessions, and scorecard Green flips remain operator evidence gates.'
  );

  return hasFailure && !options.allowBlocked ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = runCli(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
