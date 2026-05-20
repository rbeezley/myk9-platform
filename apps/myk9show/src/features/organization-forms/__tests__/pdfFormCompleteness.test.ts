import { describe, expect, it } from 'vitest';
import type { ReportProps } from '@/lib/reports/types';
import { buildAKCJudgeReportValues } from '../akcJudgeReport';
import { AKC_JUDGE_REPORT_REQUIRED_FIELDS } from '../akcJudgeReportFields';
import { buildAKCTrialChairmanReportValues } from '../akcTrialChairmanReport';
import { AKC_TRIAL_CHAIRMAN_REPORT_REQUIRED_FIELDS } from '../akcTrialChairmanReportFields';
import { buildAKCTrialSecretaryReportValues } from '../akcTrialSecretaryReport';
import { AKC_TRIAL_SECRETARY_REPORT_REQUIRED_FIELDS } from '../akcTrialSecretaryReportFields';
import {
  findMissingPdfRequiredFieldLabels,
  findMissingPdfRequiredFields,
  formatPdfFieldLabel,
} from '../pdfFormCompleteness';

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
  showName: 'Demo Trial',
  sortOrder: '',
  trial: {
    date: '2026-06-12',
    judgeName: 'Pat Judge',
    trialNumber: '2026123401',
  },
} satisfies ReportProps;

describe('findMissingPdfRequiredFields', () => {
  it('surfaces the AKC Trial Secretary fields that must still be completed', () => {
    const missing = findMissingPdfRequiredFields(
      AKC_TRIAL_SECRETARY_REPORT_REQUIRED_FIELDS,
      buildAKCTrialSecretaryReportValues(reportProps)
    );

    expect(missing).toEqual([
      {
        fieldName: 'TrialSecretary',
        label: 'Trial Secretary',
      },
    ]);
  });

  it('surfaces AKC Judge Report fields intentionally left for the secretary', () => {
    const missing = findMissingPdfRequiredFieldLabels(
      AKC_JUDGE_REPORT_REQUIRED_FIELDS,
      buildAKCJudgeReportValues(reportProps)
    );

    expect(missing).toEqual(['Location', 'Judge Email']);
  });

  it('surfaces AKC Trial Chairman fields intentionally left for the secretary', () => {
    const missing = findMissingPdfRequiredFields(
      AKC_TRIAL_CHAIRMAN_REPORT_REQUIRED_FIELDS,
      buildAKCTrialChairmanReportValues(reportProps)
    );

    expect(missing.map(field => field.label)).toEqual(['Trial Chair']);
  });

  it('treats numbers, selected radio options, and false checkboxes as filled values', () => {
    const missing = findMissingPdfRequiredFields(['Runs', 'EventType', 'IsFinal'], {
      checkboxes: { IsFinal: false },
      radioGroups: { EventType: 'Trial' },
      text: { Runs: 0 },
    });

    expect(missing).toEqual([]);
  });
});

describe('formatPdfFieldLabel', () => {
  it('turns official PDF field names into readable labels', () => {
    expect(formatPdfFieldLabel('TotalRunsAtClosing')).toBe('Total Runs At Closing');
    expect(formatPdfFieldLabel('Club Name do not abbreviate')).toBe('Club Name do not abbreviate');
  });
});
