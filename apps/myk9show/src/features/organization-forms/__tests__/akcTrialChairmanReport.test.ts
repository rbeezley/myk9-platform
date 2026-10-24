import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument } from 'pdf-lib';
import type { ReportProps } from '@/lib/reports/types';
import { buildAKCTrialChairmanReportValues } from '../akcTrialChairmanReport';
import { AKC_TRIAL_CHAIRMAN_REPORT_FIELDS } from '../akcTrialChairmanReportFields';
import { fillPdfForm } from '../pdfForm';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../../..');

const reportProps = {
  allClasses: [
    {
      element: 'Container',
      id: 'class-1',
      judgeName: 'Pat Judge',
      level: 'Novice',
      trialId: 'trial-1',
    },
    {
      element: 'Interior',
      id: 'class-2',
      judgeName: 'Avery Judge',
      level: 'Advanced',
      trialId: 'trial-1',
    },
    {
      element: 'Buried',
      id: 'class-3',
      judgeName: ' Pat Judge ',
      level: 'Excellent',
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

describe('buildAKCTrialChairmanReportValues', () => {
  it('maps report props into the official AKC Trial Chairman Report field names', () => {
    expect(buildAKCTrialChairmanReportValues(reportProps)).toEqual({
      text: {
        [AKC_TRIAL_CHAIRMAN_REPORT_FIELDS.clubName]: 'Demo Scent Work Club',
        [AKC_TRIAL_CHAIRMAN_REPORT_FIELDS.eventNumbers]: '2026123401',
        [AKC_TRIAL_CHAIRMAN_REPORT_FIELDS.judge1]: 'Pat Judge',
        [AKC_TRIAL_CHAIRMAN_REPORT_FIELDS.judge2]: 'Avery Judge',
        [AKC_TRIAL_CHAIRMAN_REPORT_FIELDS.trialDates]: '6/12/2026',
      },
    });
  });

  it('omits fields that require missing source data', () => {
    const values = buildAKCTrialChairmanReportValues({
      ...reportProps,
      allClasses: [],
      clubName: undefined,
      trial: undefined,
    });

    expect(values.text).not.toHaveProperty(AKC_TRIAL_CHAIRMAN_REPORT_FIELDS.clubName);
    expect(values.text).not.toHaveProperty(AKC_TRIAL_CHAIRMAN_REPORT_FIELDS.eventNumbers);
    expect(values.text).not.toHaveProperty(AKC_TRIAL_CHAIRMAN_REPORT_FIELDS.judge1);
  });

  it('uses the trial judge as a fallback when class assignments are unavailable', () => {
    const values = buildAKCTrialChairmanReportValues({
      ...reportProps,
      allClasses: [],
    });

    expect(values.text).toMatchObject({
      [AKC_TRIAL_CHAIRMAN_REPORT_FIELDS.judge1]: 'Pat Judge',
    });
  });

  it('uses class-level judge assignments before the trial-level fallback', () => {
    const values = buildAKCTrialChairmanReportValues({
      ...reportProps,
      trial: {
        ...reportProps.trial,
        judgeName: 'Trial-Level Judge',
      },
    });

    expect(values.text).toMatchObject({
      [AKC_TRIAL_CHAIRMAN_REPORT_FIELDS.judge1]: 'Pat Judge',
      [AKC_TRIAL_CHAIRMAN_REPORT_FIELDS.judge2]: 'Avery Judge',
    });
    expect(values.text).not.toHaveProperty(
      AKC_TRIAL_CHAIRMAN_REPORT_FIELDS.judge3,
      'Trial-Level Judge'
    );
  });

  it('fills the official AKC trial chairman PDF with mapped values', async () => {
    const templateBytes = new Uint8Array(
      await readFile(resolve(repoRoot, 'docs/AKC-forms/SW-TCReport.pdf'))
    );
    const filledBytes = await fillPdfForm(
      templateBytes,
      buildAKCTrialChairmanReportValues(reportProps)
    );
    const pdf = await PDFDocument.load(filledBytes);
    const form = pdf.getForm();

    expect(form.getTextField(AKC_TRIAL_CHAIRMAN_REPORT_FIELDS.clubName).getText()).toBe(
      'Demo Scent Work Club'
    );
    expect(form.getTextField(AKC_TRIAL_CHAIRMAN_REPORT_FIELDS.eventNumbers).getText()).toBe(
      '2026123401'
    );
    expect(form.getTextField(AKC_TRIAL_CHAIRMAN_REPORT_FIELDS.trialDates).getText()).toBe(
      '6/12/2026'
    );
    expect(form.getTextField(AKC_TRIAL_CHAIRMAN_REPORT_FIELDS.judge1).getText()).toBe('Pat Judge');
    expect(form.getTextField(AKC_TRIAL_CHAIRMAN_REPORT_FIELDS.judge2).getText()).toBe(
      'Avery Judge'
    );
  });
});

const chairperson = {
  name: 'Casey Chair',
  streetAddress: null,
  city: null,
  state: null,
  zipCode: null,
  phone: '555-0100',
  email: 'casey@example.com',
};

describe('buildAKCTrialChairmanReportValues officials (MYK9-1386)', () => {
  it('fills Chair Name, Telephone and Email from the chairman official', () => {
    const values = buildAKCTrialChairmanReportValues({
      ...reportProps,
      officials: { chairperson, secretary: null },
    });

    expect(values.text).toMatchObject({
      [AKC_TRIAL_CHAIRMAN_REPORT_FIELDS.trialChair]: 'Casey Chair',
      [AKC_TRIAL_CHAIRMAN_REPORT_FIELDS.telephone]: '555-0100',
      [AKC_TRIAL_CHAIRMAN_REPORT_FIELDS.email]: 'casey@example.com',
    });
  });

  it('leaves telephone and email absent when the person record has none', () => {
    const values = buildAKCTrialChairmanReportValues({
      ...reportProps,
      officials: { chairperson: { ...chairperson, phone: null, email: ' ' }, secretary: null },
    });

    expect(values.text).toHaveProperty(AKC_TRIAL_CHAIRMAN_REPORT_FIELDS.trialChair, 'Casey Chair');
    expect(values.text).not.toHaveProperty(AKC_TRIAL_CHAIRMAN_REPORT_FIELDS.telephone);
    expect(values.text).not.toHaveProperty(AKC_TRIAL_CHAIRMAN_REPORT_FIELDS.email);
  });

  it.each([undefined, null, { chairperson: null, secretary: null }])(
    'sets none of the chair fields without a chairman (%j)',
    officials => {
      const values = buildAKCTrialChairmanReportValues({ ...reportProps, officials });
      expect(values.text).not.toHaveProperty(AKC_TRIAL_CHAIRMAN_REPORT_FIELDS.trialChair);
      expect(values.text).not.toHaveProperty(AKC_TRIAL_CHAIRMAN_REPORT_FIELDS.telephone);
      expect(values.text).not.toHaveProperty(AKC_TRIAL_CHAIRMAN_REPORT_FIELDS.email);
    }
  );

  it('writes the chairman into the official PDF fields', async () => {
    const templateBytes = new Uint8Array(
      await readFile(resolve(repoRoot, 'docs/AKC-forms/SW-TCReport.pdf'))
    );
    const filledBytes = await fillPdfForm(
      templateBytes,
      buildAKCTrialChairmanReportValues({
        ...reportProps,
        officials: { chairperson, secretary: null },
      })
    );
    const form = (await PDFDocument.load(filledBytes)).getForm();

    expect(form.getTextField(AKC_TRIAL_CHAIRMAN_REPORT_FIELDS.trialChair).getText()).toBe(
      'Casey Chair'
    );
    expect(form.getTextField(AKC_TRIAL_CHAIRMAN_REPORT_FIELDS.telephone).getText()).toBe(
      '555-0100'
    );
    expect(form.getTextField(AKC_TRIAL_CHAIRMAN_REPORT_FIELDS.email).getText()).toBe(
      'casey@example.com'
    );
  });
});
