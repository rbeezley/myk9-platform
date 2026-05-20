import { describe, expect, it } from 'vitest';
import { buildAKCTrialSecretaryReportFilename } from '../akcTrialSecretaryReportPdf';
import type { ReportProps } from '@/lib/reports/types';

describe('buildAKCTrialSecretaryReportFilename', () => {
  it('uses the trial number when present', () => {
    expect(
      buildAKCTrialSecretaryReportFilename({
        showName: 'Spring Trial',
        sortOrder: '',
        entries: [],
        trial: {
          date: '2026-04-12',
          judgeName: 'Pat Judge',
          trialNumber: '2026123401',
        },
      } satisfies ReportProps)
    ).toBe('akc-trial-secretary-report-2026123401.pdf');
  });

  it('falls back to trial when the trial number is missing', () => {
    expect(
      buildAKCTrialSecretaryReportFilename({
        showName: 'Spring Trial',
        sortOrder: '',
        entries: [],
      } satisfies ReportProps)
    ).toBe('akc-trial-secretary-report-trial.pdf');
  });

  it('sanitizes the trial number for filesystem-safe downloads', () => {
    expect(
      buildAKCTrialSecretaryReportFilename({
        showName: 'Spring Trial',
        sortOrder: '',
        entries: [],
        trial: {
          date: '2026-04-12',
          judgeName: 'Pat Judge',
          trialNumber: ' 2026/1234 A ',
        },
      } satisfies ReportProps)
    ).toBe('akc-trial-secretary-report-2026-1234-A.pdf');
  });
});
