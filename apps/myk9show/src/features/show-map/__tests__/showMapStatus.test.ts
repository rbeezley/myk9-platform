import { describe, expect, it } from 'vitest';
import {
  buildClassProgress,
  classifyClassWrapUpStatus,
  classifyEntryCheckInStatus,
  classifyEntryRunStatus,
} from '../showMapStatus';

describe('showMapStatus', () => {
  describe('classifyClassWrapUpStatus', () => {
    it('hides wrap-up status until the class is complete', () => {
      expect(classifyClassWrapUpStatus({ status: 'In Progress' }, [])).toBeUndefined();
    });

    it('marks completed classes without closeout metadata as ready for wrap-up', () => {
      expect(classifyClassWrapUpStatus({ status: 'Complete' }, [])).toMatchObject({
        value: 'class-ready-for-wrap-up',
        label: 'Ready for wrap-up',
        kind: 'neutral',
      });
    });

    it('marks completed classes with unsigned entries as attention', () => {
      expect(
        classifyClassWrapUpStatus({ status: 'Complete' }, [{ judge_signature_timestamp: null }])
      ).toMatchObject({
        value: 'needs-judge-signature',
        label: 'Needs judge signature',
        kind: 'attention',
      });
    });

    it('marks signed completed classes before submission', () => {
      expect(
        classifyClassWrapUpStatus({ status: 'Complete' }, [
          { judge_signature_timestamp: '2026-05-18' },
        ])
      ).toMatchObject({
        value: 'signed-by-judge',
        label: 'Signed by judge',
        kind: 'neutral',
      });
    });

    it('marks submitted completed classes as complete', () => {
      expect(
        classifyClassWrapUpStatus({ status: 'Complete' }, [], {
          resultSubmittedAt: '2026-05-18',
        })
      ).toMatchObject({
        value: 'submitted-to-registry',
        label: 'Submitted to registry',
        kind: 'complete',
      });
    });

    it('uses completed entry progress as the completion fallback', () => {
      expect(
        classifyClassWrapUpStatus({ status: 'Scheduled' }, [
          { is_scored: true, judge_signature_timestamp: '2026-05-18' },
        ])
      ).toMatchObject({
        value: 'signed-by-judge',
        label: 'Signed by judge',
        kind: 'neutral',
      });
    });

    it('counts pulled entries as accounted for without requiring judge signatures', () => {
      const entries = [
        { is_scored: true, judge_signature_timestamp: '2026-05-18' },
        { entry_status: 'scratched', check_in_status: 'pulled' },
      ];

      expect(buildClassProgress({ status: 'In Progress' }, entries)).toMatchObject({
        completed: 2,
        total: 2,
        label: '2/2 entries complete',
      });
      expect(classifyClassWrapUpStatus({ status: 'In Progress' }, entries)).toMatchObject({
        value: 'signed-by-judge',
        label: 'Signed by judge',
        kind: 'neutral',
      });
    });

    it('skips signature requirement when all entries are scratched', () => {
      expect(
        classifyClassWrapUpStatus({ status: 'In Progress' }, [
          { entry_status: 'scratched', check_in_status: 'pulled' },
        ])
      ).toMatchObject({
        value: 'class-ready-for-wrap-up',
        label: 'Ready for wrap-up',
        kind: 'neutral',
      });
    });
  });

  it('keeps check-in and run status independent', () => {
    const entry = {
      id: 'entry-1',
      entry_status: 'accepted',
      check_in_status: 'checked-in',
    };

    expect(classifyEntryRunStatus(entry)?.label).toBe('Pending');
    expect(classifyEntryCheckInStatus(entry)?.label).toBe('Checked in');
  });

  it('no longer routes check-in conflict through the secretary run-status classifier (myK9Q owns that signal)', () => {
    const entry = {
      id: 'entry-1',
      entry_status: 'accepted',
      check_in_status: 'conflict',
      is_scored: true,
    };

    // Conflict is now informational only — scored completion wins in the
    // secretary's view since the gate steward (myK9Q) owns conflict response.
    expect(classifyEntryRunStatus(entry)?.label).toBe('Complete');
  });

  it.each([
    [
      'scored completion beats check-in conflict',
      { entry_status: 'accepted', check_in_status: 'conflict', is_scored: true },
      'Complete',
    ],
    [
      'scratch beats scored completion',
      { entry_status: 'scratch', check_in_status: 'completed', is_scored: true },
      'Pulled',
    ],
    [
      'completed beats in-ring timing',
      { entry_status: 'accepted', check_in_status: 'in-ring', is_scored: true },
      'Complete',
    ],
  ])('applies precedence: %s', (_name, entry, expectedLabel) => {
    expect(classifyEntryRunStatus(entry)?.label).toBe(expectedLabel);
  });

  it('maps backed check-in gate states', () => {
    expect(classifyEntryCheckInStatus({ check_in_status: 'come-to-gate' })?.label).toBe(
      'Called to gate'
    );
    expect(classifyEntryCheckInStatus({ check_in_status: 'at-gate' })?.label).toBe('At gate');
    expect(classifyEntryCheckInStatus({ check_in_status: 'pulled' })?.label).toBe('Pulled');
  });

  it('hides unknown statuses instead of guessing', () => {
    expect(classifyEntryCheckInStatus({ check_in_status: 'mystery' })).toBeUndefined();
    expect(classifyEntryRunStatus({ entry_status: 'mystery' })).toBeUndefined();
  });
});
