import { describe, expect, it } from 'vitest';
import { detectDirtyRowConflict, instantFieldsFor } from './detectDirtyRowConflict';

const BASE_STAMP = '2024-12-31T00:00:00Z';

/** Both devices moved `field` off its base: does the pair read as a same-field conflict? */
function conflictsOnInstant(table: string, field: string, localValue: string, remoteValue: string) {
  return detectDirtyRowConflict({
    base: { [field]: BASE_STAMP },
    local: { [field]: localValue },
    remote: { [field]: remoteValue },
    instantFields: instantFieldsFor(table),
    ignoredFields: [],
  }).hasConflict;
}

describe('default ignored fields never conflict', () => {
  it.each([
    'id',
    'created_at',
    'updated_at',
    '_version',
    '_lastModified',
    '_lastModifiedBy',
    '_syncStatus',
    '_localOnly',
  ])('a dirty row and a pulled row that differ only in %s do not conflict', field => {
    const result = detectDirtyRowConflict({
      base: { [field]: 'base' },
      local: { [field]: 'local' },
      remote: { [field]: 'remote' },
    });

    expect(result).toEqual({ hasConflict: false, fields: [] });
  });
});

describe('instant fields per table: two renderings of one instant do not conflict', () => {
  const SAME_INSTANT_Z = '2025-03-04T15:30:00Z';
  const SAME_INSTANT_OFFSET = '2025-03-04T15:30:00+00:00';

  const entriesFields = [
    'confirmation_email_sent_at',
    'createdAt',
    'created_at',
    'deletedAt',
    'deleted_at',
    'judge_signature_timestamp',
    'last_synced_at',
    'refundedAt',
    'refund_decided_at',
    'refunded_at',
    'ring_entry_time',
    'ring_exit_time',
    'scoringCompletedAt',
    'scoring_completed_at',
    'scoring_started_at',
    'showDeletedAt',
    'show_deleted_at',
    'submittedAt',
    'submitted_at',
    'updated_at',
    'withdrawn_at',
  ];
  const classesFields = [
    'judgeSignedOffAt',
    'judge_signed_off_at',
    'reopenedAfterCloseoutAt',
    'reopened_after_closeout_at',
    'resultsReleasedAt',
    'results_released_at',
    'resultsVerifiedAt',
    'results_verified_at',
    'revisedExpectedStart',
    'revised_expected_start',
  ];

  it.each(entriesFields)('entries.%s compares as an instant', field => {
    expect(conflictsOnInstant('entries', field, SAME_INSTANT_Z, SAME_INSTANT_OFFSET)).toBe(false);
  });

  it.each(classesFields)('classes.%s compares as an instant', field => {
    expect(conflictsOnInstant('classes', field, SAME_INSTANT_Z, SAME_INSTANT_OFFSET)).toBe(false);
  });

  it.each(['judge_notes', 'actual_start_time', 'notes'])(
    'entries.%s is text: the same two spellings conflict',
    field => {
      expect(conflictsOnInstant('entries', field, SAME_INSTANT_Z, SAME_INSTANT_OFFSET)).toBe(true);
    }
  );

  it('a class-only instant field is text on entries, and an entry-only one is text on classes', () => {
    expect(
      conflictsOnInstant('entries', 'results_released_at', SAME_INSTANT_Z, SAME_INSTANT_OFFSET)
    ).toBe(true);
    expect(
      conflictsOnInstant('classes', 'scoring_completed_at', SAME_INSTANT_Z, SAME_INSTANT_OFFSET)
    ).toBe(true);
  });

  it('a table with no instant fields compares every field as text', () => {
    expect(
      conflictsOnInstant('unlisted_table', 'updated_at', SAME_INSTANT_Z, SAME_INSTANT_OFFSET)
    ).toBe(true);
  });

  it('different instants in an instant field still conflict', () => {
    expect(
      conflictsOnInstant('entries', 'scoring_completed_at', SAME_INSTANT_Z, '2025-03-04T15:31:00Z')
    ).toBe(true);
  });
});

describe('instant spellings', () => {
  const same = (a: string, b: string) => conflictsOnInstant('entries', 'submitted_at', a, b);

  it('seconds present or absent name the same instant', () => {
    expect(same('2025-01-01T10:00Z', '2025-01-01T10:00:00Z')).toBe(false);
    expect(same('2025-01-01T10:00Z', '2025-01-01T10:01Z')).toBe(true);
  });

  it('fractional seconds compare by value, not by digit count', () => {
    expect(same('2025-01-01T10:00:00.5Z', '2025-01-01T10:00:00.500+00:00')).toBe(false);
    expect(same('2025-01-01T10:00:00Z', '2025-01-01T10:00:00.000Z')).toBe(false);
    expect(same('2025-01-01T10:00:00.5Z', '2025-01-01T10:00:00.6Z')).toBe(true);
  });

  it('microseconds inside one millisecond are different values', () => {
    expect(same('2025-01-01T10:00:00.123456Z', '2025-01-01T10:00:00.123Z')).toBe(true);
    expect(same('2025-01-01T10:00:00.123456Z', '2025-01-01T10:00:00.123457Z')).toBe(true);
    expect(same('2025-01-01T10:00:00.123456Z', '2025-01-01T10:00:00.123456+00:00')).toBe(false);
  });

  it('trailing zeros after the milliseconds are ignored, interior zeros are not', () => {
    expect(same('2025-01-01T10:00:00.1230000Z', '2025-01-01T10:00:00.123Z')).toBe(false);
    expect(same('2025-01-01T10:00:00.123450Z', '2025-01-01T10:00:00.12345Z')).toBe(false);
    expect(same('2025-01-01T10:00:00.123405Z', '2025-01-01T10:00:00.12345Z')).toBe(true);
  });

  it('numeric offsets with and without a colon, either sign, name the same instant as Z', () => {
    expect(same('2025-01-01T11:00:00+01:00', '2025-01-01T10:00:00Z')).toBe(false);
    expect(same('2025-01-01T11:00:00+0100', '2025-01-01T10:00:00Z')).toBe(false);
    expect(same('2025-01-01T05:00:00-05:00', '2025-01-01T10:00:00Z')).toBe(false);
    expect(same('2025-01-01T05:00:00-0500', '2025-01-01T10:00:00Z')).toBe(false);
    expect(same('2025-01-01T15:30:00+05:30', '2025-01-01T10:00:00Z')).toBe(false);
    expect(same('2025-01-01T11:00:00+01:00', '2025-01-01T11:00:00Z')).toBe(true);
  });

  it.each([
    ['a date only', '2025-01-01'],
    ['a zone-less date-time', '2025-01-01T10:00:00'],
    ['text after the zone', '2025-01-01T10:00:00Z!'],
    ['text after an offset', '2025-01-01T10:00:00+00:00x'],
    ['text before the date', 'x2025-01-01T10:00:00Z'],
    ['a space instead of T', '2025-01-01 10:00:00Z'],
    ['a two-digit year', '25-01-01T10:00:00Z'],
    ['a bare fraction point', '2025-01-01T10:00:00.Z'],
    ['an hour-only zone', '2025-01-01T10:00:00+01'],
    ['not a date at all', 'pending'],
    ['an impossible date', '2025-13-45T10:00:00Z'],
  ])('%s is never read as an instant', (_label, value) => {
    expect(same(value, '2025-01-01T10:00:00+00:00')).toBe(true);
    expect(same('2025-01-01T10:00:00Z', value)).toBe(true);
  });

  it('two different impossible instants conflict rather than throw', () => {
    expect(same('2025-13-45T10:00:00Z', '2025-13-45T10:00:00+00:00')).toBe(true);
  });

  it('non-string values are never instants', () => {
    const lookalike = { toString: () => '2025-01-01T10:00:00Z' };
    const result = detectDirtyRowConflict({
      base: { submitted_at: BASE_STAMP },
      local: { submitted_at: lookalike },
      remote: { submitted_at: '2025-01-01T10:00:00+00:00' },
      instantFields: instantFieldsFor('entries'),
    });

    expect(result.hasConflict).toBe(true);
  });
});
