import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument } from 'pdf-lib';
import type { ReportProps } from '@/lib/reports/types';
import { buildAKCJudgeReportValues } from '../akcJudgeReport';
import { AKC_JUDGE_REPORT_FIELDS } from '../akcJudgeReportFields';
import { fillPdfForm } from '../pdfForm';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../../..');

const reportProps = {
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

describe('buildAKCJudgeReportValues', () => {
  it('maps report props into the official AKC Judge Report field names', () => {
    expect(buildAKCJudgeReportValues(reportProps)).toEqual({
      radioGroups: {
        [AKC_JUDGE_REPORT_FIELDS.eventType]: 'Trial',
      },
      text: {
        [AKC_JUDGE_REPORT_FIELDS.clubName]: 'Demo Scent Work Club',
        [AKC_JUDGE_REPORT_FIELDS.eventDates]: '6/12/2026',
        [AKC_JUDGE_REPORT_FIELDS.eventNumbers]: '2026123401',
        [AKC_JUDGE_REPORT_FIELDS.judgeName]: 'Pat Judge',
      },
    });
  });

  it('omits fields that require missing source data', () => {
    const values = buildAKCJudgeReportValues({
      ...reportProps,
      clubName: undefined,
      trial: undefined,
    });

    expect(values.text).not.toHaveProperty(AKC_JUDGE_REPORT_FIELDS.clubName);
    expect(values.text).not.toHaveProperty(AKC_JUDGE_REPORT_FIELDS.eventNumbers);
    expect(values.text).not.toHaveProperty(AKC_JUDGE_REPORT_FIELDS.judgeName);
  });

  it('fills the official AKC judge PDF with mapped values', async () => {
    const templateBytes = new Uint8Array(
      await readFile(resolve(repoRoot, 'docs/AKC-forms/SW-JudgeReport.pdf'))
    );
    const filledBytes = await fillPdfForm(templateBytes, buildAKCJudgeReportValues(reportProps));
    const pdf = await PDFDocument.load(filledBytes);
    const form = pdf.getForm();

    expect(form.getRadioGroup(AKC_JUDGE_REPORT_FIELDS.eventType).getSelected()).toBe('Trial');
    expect(form.getTextField(AKC_JUDGE_REPORT_FIELDS.clubName).getText()).toBe(
      'Demo Scent Work Club'
    );
    expect(form.getTextField(AKC_JUDGE_REPORT_FIELDS.eventDates).getText()).toBe('6/12/2026');
    expect(form.getTextField(AKC_JUDGE_REPORT_FIELDS.eventNumbers).getText()).toBe('2026123401');
    expect(form.getTextField(AKC_JUDGE_REPORT_FIELDS.judgeName).getText()).toBe('Pat Judge');
  });
});
