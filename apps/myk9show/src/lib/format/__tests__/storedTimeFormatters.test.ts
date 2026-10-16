import { describe, it, expect } from 'vitest';
import { msToDisplay } from '@/lib/timeUtils';
import { convertTimeToStandardFormat, formatTimeFromMs } from '@/utils/entryValidation';
import { dbSecondsToInputFormat } from '@/utils/scoringMappings';
import { convertTimeToInputFormat as convertResultsGridTime } from '@/components/classes/ClassResultsTable/utils';
import { convertTimeToInputFormat as convertBulkTime } from '@/components/secretary/bulk-result-entry/helpers';
import { convertTimeToInputFormat as convertBulkUtilsTime } from '@/components/secretary/bulk-result-entry-utils';
import { formatMsToTime } from '@/types/unified-entry-types';

// MYK9-1225: every stored-time display rounds to integer centiseconds, so 61.23
// reads 1:01.23 (not 1:01.22) and 59.999 carries to 1:00.00 (not 0:59.100).
describe('stored time formatters share one centisecond rule (MYK9-1225)', () => {
  const secondsFormatters: Array<[string, (s: number) => string]> = [
    ['dbSecondsToInputFormat', dbSecondsToInputFormat],
    ['convertTimeToStandardFormat', s => convertTimeToStandardFormat(String(s))],
    ['ClassResultsTable convertTimeToInputFormat', s => convertResultsGridTime(String(s))],
    ['bulk-result-entry/helpers convertTimeToInputFormat', s => convertBulkTime(String(s))],
    ['bulk-result-entry-utils convertTimeToInputFormat', s => convertBulkUtilsTime(String(s))],
  ];

  it.each(secondsFormatters)('%s keeps 61.23 and carries 59.999', (_name, format) => {
    expect(format(61.23)).toBe('1:01.23');
    expect(format(59.999)).toBe('1:00.00');
    expect(format(59.995)).toBe('1:00.00');
    expect(format(61.25)).toBe('1:01.25');
    expect(format(59.99)).toBe('0:59.99');
  });

  const msFormatters: Array<[string, (ms: number) => string]> = [
    ['msToDisplay(hundredths)', ms => msToDisplay(ms, 'hundredths')],
    ['formatTimeFromMs', formatTimeFromMs],
    ['formatMsToTime', formatMsToTime],
  ];

  it.each(msFormatters)('%s rounds analytics seconds*1000 and carries', (_name, format) => {
    expect(format(61.23 * 1000)).toBe('1:01.23');
    expect(format(2.01 * 1000)).toBe('0:02.01');
    expect(format(59999)).toBe('1:00.00');
  });

  it('msToDisplay stays exact for integer-ms callers and keeps its guards', () => {
    expect(msToDisplay(87350, 'hundredths')).toBe('1:27.35');
    expect(msToDisplay(90000, 'hundredths')).toBe('1:30.00');
    expect(msToDisplay(90000)).toBe('1:30');
    expect(msToDisplay(0, 'hundredths')).toBe('0:00.00');
    expect(msToDisplay(-5)).toBe('0:00');
  });

  it('msToDisplay at seconds precision still floors (no carry into the minute)', () => {
    expect(msToDisplay(59999)).toBe('0:59');
  });

  it('dbSecondsToInputFormat keeps its empty guard', () => {
    expect(dbSecondsToInputFormat(null)).toBe('');
    expect(dbSecondsToInputFormat(0)).toBe('');
  });
});
