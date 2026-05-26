/**
 * Unit Tests for Entry-related Status Utility Functions.
 *
 * The class-related test cases moved to
 * `packages/ringside/src/utils/classStatus.test.ts` during PR E1a
 * (alongside the implementation move). What's left here covers the
 * entry-related helpers that still live in `apps/myk9q/src/utils/statusUtils.ts`
 * pending PR E2 (EntryList page move).
 */

import {
  determineEntryStatus,
  getCheckInStatusIcon,
  getEntryStatusColor,
  getEntryStatusLabel,
} from './statusUtils';

describe('determineEntryStatus', () => {
  test('should return entry_status when provided', () => {
    expect(determineEntryStatus('checked-in')).toBe('checked-in');
    expect(determineEntryStatus('in-ring')).toBe('in-ring');
    expect(determineEntryStatus('conflict')).toBe('conflict');
    expect(determineEntryStatus('pulled')).toBe('pulled');
    expect(determineEntryStatus('at-gate')).toBe('at-gate');
    expect(determineEntryStatus('come-to-gate')).toBe('come-to-gate');
    expect(determineEntryStatus('scored')).toBe('scored');
  });

  test('should return in-ring when entry_status is undefined and isInRing is true', () => {
    expect(determineEntryStatus(undefined, true)).toBe('in-ring');
    expect(determineEntryStatus(null, true)).toBe('in-ring');
  });

  test('should return no-status when entry_status is undefined and isInRing is false', () => {
    expect(determineEntryStatus(undefined, false)).toBe('no-status');
    expect(determineEntryStatus(null, false)).toBe('no-status');
  });

  test('should return no-status when both entry_status and isInRing are undefined', () => {
    expect(determineEntryStatus()).toBe('no-status');
    expect(determineEntryStatus(undefined, undefined)).toBe('no-status');
    expect(determineEntryStatus(null, undefined)).toBe('no-status');
  });

  test('should prioritize entry_status over isInRing', () => {
    // Even if isInRing is true, entry_status takes priority
    expect(determineEntryStatus('checked-in', true)).toBe('checked-in');
    expect(determineEntryStatus('conflict', true)).toBe('conflict');
    expect(determineEntryStatus('pulled', false)).toBe('pulled');
  });

  test('should normalize scratch and absence statuses to pulled', () => {
    expect(determineEntryStatus('scratch')).toBe('pulled');
    expect(determineEntryStatus('scratched')).toBe('pulled');
    expect(determineEntryStatus('withdrawn')).toBe('pulled');
    expect(determineEntryStatus('absent')).toBe('pulled');
    expect(determineEntryStatus('Scratched')).toBe('pulled');
  });

  test('should handle empty string as falsy', () => {
    expect(determineEntryStatus('', false)).toBe('no-status');
    expect(determineEntryStatus('', true)).toBe('in-ring');
  });

  test('should cast any string to EntryStatus', () => {
    // Even unknown statuses get cast to EntryStatus
    expect(determineEntryStatus('custom-status')).toBe('custom-status');
  });
});

describe('entry status display utilities', () => {
  test('maps check-in statuses to entry colors and labels', () => {
    expect(getEntryStatusColor({ check_in_status: 'checked-in' })).toBe('checked-in');
    expect(getEntryStatusLabel({ check_in_status: 'checked-in' })).toBe('Checked-in');
    expect(getEntryStatusColor({ check_in_status: 'conflict' })).toBe('conflict');
    expect(getEntryStatusLabel({ check_in_status: 'conflict' })).toBe('Conflict');
    expect(getEntryStatusColor({ check_in_status: 'pulled' })).toBe('pulled');
    expect(getEntryStatusLabel({ check_in_status: 'pulled' })).toBe('Pulled');
    expect(getEntryStatusColor({ check_in_status: 'at-gate' })).toBe('at-gate');
    expect(getEntryStatusLabel({ check_in_status: 'at-gate' })).toBe('At Gate');
    expect(getEntryStatusColor({ check_in_status: 'come-to-gate' })).toBe('come-to-gate');
    expect(getEntryStatusLabel({ check_in_status: 'come-to-gate' })).toBe('Come to Gate');
  });

  test('maps scored result text to entry colors and labels', () => {
    expect(getEntryStatusColor({ is_scored: true, result_text: 'Q' })).toBe('qualified');
    expect(getEntryStatusLabel({ is_scored: true, result_text: 'qualified' })).toBe('Qualified');
    expect(getEntryStatusColor({ is_scored: true, result_text: 'NQ' })).toBe('not-qualified');
    expect(getEntryStatusLabel({ is_scored: true, result_text: 'not qualified' })).toBe(
      'Not Qualified'
    );
    expect(getEntryStatusColor({ is_scored: true, result_text: 'EX' })).toBe('excused');
    expect(getEntryStatusLabel({ is_scored: true, result_text: 'excused' })).toBe('Excused');
    expect(getEntryStatusColor({ is_scored: true, result_text: 'ABS' })).toBe('absent');
    expect(getEntryStatusColor({ is_scored: true, result_text: 'WD' })).toBe('withdrawn');
    expect(getEntryStatusLabel({ is_scored: true, result_text: 'custom' })).toBe('Custom');
    expect(getEntryStatusLabel({ is_scored: true, result_text: 'abs' })).toBe('Abs');
    expect(getEntryStatusLabel({ is_scored: true, result_text: 'wd' })).toBe('Wd');
    expect(getEntryStatusLabel({ is_scored: true, result_text: 'e' })).toBe('E');
  });

  test('returns default status displays when no status applies', () => {
    expect(getEntryStatusColor({})).toBe('no-status');
    expect(getEntryStatusLabel({})).toBe('No Status');
    expect(getEntryStatusColor({ is_scored: true, result_text: null })).toBe('no-status');
    expect(getEntryStatusLabel({ is_scored: true, result_text: null })).toBe('No Status');
  });

  test('maps check-in statuses to icon names', () => {
    expect(getCheckInStatusIcon('checked-in')).toBe('Check');
    expect(getCheckInStatusIcon('conflict')).toBe('AlertTriangle');
    expect(getCheckInStatusIcon('pulled')).toBe('XCircle');
    expect(getCheckInStatusIcon('at-gate')).toBe('Star');
    expect(getCheckInStatusIcon('come-to-gate')).toBe('Bell');
    expect(getCheckInStatusIcon()).toBe('Circle');
  });
});
