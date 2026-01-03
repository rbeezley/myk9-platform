/**
 * Unit Tests for Status Utility Functions
 */

import { determineEntryStatus } from './statusUtils';

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

  test('should handle empty string as falsy', () => {
    expect(determineEntryStatus('', false)).toBe('no-status');
    expect(determineEntryStatus('', true)).toBe('in-ring');
  });

  test('should cast any string to EntryStatus', () => {
    // Even unknown statuses get cast to EntryStatus
    expect(determineEntryStatus('custom-status' as any)).toBe('custom-status');
  });
});
