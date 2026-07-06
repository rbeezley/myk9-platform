import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  checkChecklistCoverage,
  checkLiveEvidenceRecorded,
  checkRunbookCoverage,
} from './phase-4-evidence-pass';

function makeRoot(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'myk9-phase4-'));
  mkdirSync(path.join(root, 'docs/operations'), { recursive: true });
  return root;
}

describe('phase 4 evidence verifier', () => {
  it('passes checklist coverage when every evidence gate is present', () => {
    const root = makeRoot();
    writeFileSync(
      path.join(root, 'docs/operations/go-live-phase-4-evidence-checklist.md'),
      [
        '4.1 Show-Day Re-Walk',
        '4.2 Offline Reconnect Rehearsal',
        '4.3 Venue Hardware Print Test',
        '4.5 Real-User Testing',
        '4.6 Scorecard Close-Out',
        'Evidence slot',
      ].join('\n')
    );

    expect(checkChecklistCoverage(root)).toEqual({
      key: 'phase4_checklist_coverage',
      status: 'ok',
      detail: 'operator checklist covers all Phase 4 gates',
    });
  });

  it('fails when the runbook is missing a Phase 4 gate', () => {
    const root = makeRoot();
    writeFileSync(path.join(root, 'docs/operations/go-live-runbook.md'), '4.1 Show-day re-walk');

    expect(checkRunbookCoverage(root)).toMatchObject({
      key: 'phase4_runbook_coverage',
      status: 'fail',
    });
  });

  it('blocks when live evidence slots are not recorded', () => {
    const root = makeRoot();
    writeFileSync(
      path.join(root, 'docs/operations/go-live-opsx-batches.md'),
      'show-day re-walk evidence: screenshot'
    );

    expect(checkLiveEvidenceRecorded(root)).toMatchObject({
      key: 'phase4_live_evidence_recorded',
      status: 'fail',
    });
  });

  it('treats placeholder evidence links as blocked', () => {
    const root = makeRoot();
    writeFileSync(
      path.join(root, 'docs/operations/go-live-opsx-batches.md'),
      [
        'show-day re-walk evidence: <link>',
        'offline reconnect evidence: <link>',
        'venue hardware print evidence: <link>',
        'real-user testing evidence: <link>',
        'scorecard close-out evidence: <link>',
      ].join('\n')
    );

    expect(checkLiveEvidenceRecorded(root)).toMatchObject({
      key: 'phase4_live_evidence_recorded',
      status: 'fail',
    });
  });
});
