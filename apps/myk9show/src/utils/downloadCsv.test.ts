import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadCsv } from './downloadCsv';
import * as downloadCsvModule from './downloadCsv';
import { exportRowsCsv, exportFilename } from './downloadCsv';
import { classExportRows, CLASS_EXPORT_HEADERS } from '@/components/classes/classesExport';
import { dogExportHeaders, dogExportRows } from '@/components/dogs/browse/dogsExport';
import type { Dog } from '@/types/dog-types';

// MYK9-929 review: every list export goes through the ONE guarded builder (utils/csvEscape.ts),
// so a cell that starts with = + - @ can never run as a spreadsheet formula.

function captureDownload() {
  const parts: string[] = [];
  vi.stubGlobal(
    'Blob',
    class {
      constructor(chunks: string[]) {
        parts.push(...chunks);
      }
    }
  );
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:x');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  return parts;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('exportRowsCsv', () => {
  it.each(['=1+1', '+1', '-1', '@SUM(A1)'])('neutralises a leading formula character: %s', cell => {
    const parts = captureDownload();
    exportRowsCsv('dogs', ['Name'], [[cell]]);
    const csv = parts.join('');
    // Quoted and prefixed with a tab, so the spreadsheet reads text.
    expect(csv).toContain(`"\t${cell}"`);
    expect(csv).not.toContain(`\n"${cell}"`);
  });

  it('quotes commas and quotes, and writes a dated file name', () => {
    const parts = captureDownload();
    exportRowsCsv('dogs', ['Name', 'Note'], [['Rex, Jr.', 'says "hi"']]);
    expect(parts.join('')).toBe('Name,Note\n"Rex, Jr.","says ""hi"""');
    expect(exportFilename('dogs')).toMatch(/^dogs-export-\d{4}-\d{2}-\d{2}\.csv$/);
  });

  it('has no second, unguarded CSV builder', () => {
    expect('buildCsv' in downloadCsvModule).toBe(false);
  });
});

describe('class export columns', () => {
  it('carries section, judge, time, ring and the entry count', () => {
    expect(CLASS_EXPORT_HEADERS).toEqual([
      'Trial',
      'Element',
      'Level',
      'Section',
      'Judge',
      'Time',
      'Ring',
      'Status',
      'Entries',
    ]);
    const [row] = classExportRows([
      {
        id: 'c1',
        name: 'x',
        status: 'Scheduled',
        trialLabel: 'Saturday Trial 1',
        element: 'Containers',
        level: 'Novice',
        section: 'A',
        judgeName: 'Jane Judge',
        time: '9:00 AM',
        ring: 2,
        entryCount: 7,
      },
    ]);
    expect(row).toEqual([
      'Saturday Trial 1',
      'Containers',
      'Novice',
      'A',
      'Jane Judge',
      '9:00 AM',
      2,
      'Scheduled',
      7,
    ]);
  });
});

describe('dog export columns', () => {
  const dog = {
    id: '1',
    name: 'Rex',
    callName: 'Rex',
    breed: 'Lab',
    sex: 'male',
    ownerName: 'Ann',
    status: 'active',
  } as unknown as Dog;

  it('includes Owner only when asked', () => {
    expect(dogExportHeaders(true)).toEqual(['Name', 'Breed', 'Sex', 'Owner', 'Status']);
    expect(dogExportHeaders(false)).toEqual(['Name', 'Breed', 'Sex', 'Status']);
    expect(dogExportRows([dog], true)[0]).toEqual(['Rex', 'Lab', 'male', 'Ann', 'active']);
    expect(dogExportRows([dog], false)[0]).toEqual(['Rex', 'Lab', 'male', 'active']);
  });
});

describe('downloadCsv cleanup', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  // The deferred cleanup used to touch `document` inside a timer, which outlives a test
  // environment (an unhandled ReferenceError in CI). Only the URL revoke may be deferred.
  it('removes the link synchronously and defers only revokeObjectURL', () => {
    vi.useFakeTimers();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:x');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    downloadCsv('a.csv', 'x');

    expect(document.querySelector('a[download="a.csv"]')).toBeNull();
    expect(revoke).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(revoke).toHaveBeenCalledWith('blob:x');
  });
});
