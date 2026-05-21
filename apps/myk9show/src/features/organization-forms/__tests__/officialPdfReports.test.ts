import { describe, expect, it } from 'vitest';
import type { ReportProps } from '@/lib/reports/types';
import {
  buildOfficialPdfFilename,
  getOfficialPdfMissingFieldLabels,
  getOfficialPdfReportConfig,
} from '../officialPdfReports';

const reportProps = {
  allClasses: [
    {
      element: 'Container',
      id: 'class-1',
      judgeName: 'Pat Judge',
      level: 'Novice',
      trialId: 'trial-1',
    },
  ],
  clubName: 'Demo Scent Work Club',
  entries: [],
  organization: 'AKC',
  showName: 'Demo Trial',
  sortOrder: '',
  trial: {
    date: '2026-06-12',
    judgeName: 'Pat Judge',
    registryId: 'AKC',
    trialNumber: '2026/1234 A',
  },
} satisfies ReportProps;

describe('getOfficialPdfReportConfig', () => {
  it('uses the AKC Trial Secretary PDF for AKC trial secretary reports', () => {
    const config = getOfficialPdfReportConfig('trial-secretary-report', reportProps);

    expect(config?.templateId).toBe('akc-scent-work-trial-secretary-report');
    expect(config?.actionLabel).toBe('Download AKC Trial Secretary PDF');
  });

  it('uses the UKC Nosework PDF for UKC trial secretary reports', () => {
    const config = getOfficialPdfReportConfig('trial-secretary-report', {
      ...reportProps,
      organization: 'AKC',
      trial: { ...reportProps.trial, registryId: 'UKC' },
    });

    expect(config?.templateId).toBe('ukc-nosework-trial-report');
    expect(config?.actionLabel).toBe('Download UKC Trial Report PDF');
  });

  it('uses the trial registry instead of the show organization label', () => {
    const config = getOfficialPdfReportConfig('trial-secretary-report', {
      ...reportProps,
      organization: 'UKC (United Kennel Club)',
    });

    expect(config?.templateId).toBe('akc-scent-work-trial-secretary-report');
  });

  it('maps AKC judge and chairman report ids to their official PDFs', () => {
    expect(getOfficialPdfReportConfig('akc-judge-report', reportProps)?.templateId).toBe(
      'akc-scent-work-judge-report'
    );
    expect(getOfficialPdfReportConfig('trial-chairman-report', reportProps)?.templateId).toBe(
      'akc-scent-work-trial-chairman-report'
    );
  });

  it('returns null for reports without official PDFs', () => {
    expect(getOfficialPdfReportConfig('check-in-sheet', reportProps)).toBeNull();
  });
});

describe('buildOfficialPdfFilename', () => {
  it('sanitizes trial numbers for official filenames', () => {
    const config = getOfficialPdfReportConfig('trial-secretary-report', reportProps);

    expect(config ? buildOfficialPdfFilename(config, reportProps) : '').toBe(
      'akc-trial-secretary-report-2026-1234-A.pdf'
    );
  });

  it('falls back to trial when the trial number is missing', () => {
    const config = getOfficialPdfReportConfig('trial-chairman-report', reportProps);

    expect(
      config
        ? buildOfficialPdfFilename(config, {
            ...reportProps,
            trial: { ...reportProps.trial, trialNumber: '' },
          })
        : ''
    ).toBe('akc-trial-chairman-report-trial.pdf');
  });
});

describe('getOfficialPdfMissingFieldLabels', () => {
  it('reuses the generic missing-field warning contract', () => {
    expect(getOfficialPdfMissingFieldLabels('akc-judge-report', reportProps)).toEqual([
      'Location',
      'Judge Email',
    ]);
    expect(getOfficialPdfMissingFieldLabels('check-in-sheet', reportProps)).toEqual([]);
  });
});
