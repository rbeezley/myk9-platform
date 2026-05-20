import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument } from 'pdf-lib';
import type { ReportEntry, ReportProps } from '@/lib/reports/types';
import { buildAKCTrialSecretaryReportValues } from '../akcTrialSecretaryReport';
import { AKC_TRIAL_SECRETARY_REPORT_FIELDS } from '../akcTrialSecretaryReportFields';
import { fillPdfForm } from '../pdfForm';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../../..');

const baseEntry = {
  armband: 1,
  breed: 'Beagle',
  callName: 'Rocket',
  classElement: 'Container',
  classLevel: 'Novice',
  classSection: 'A',
  finalPlacement: null,
  handler: 'Jamie Walker',
  isScored: true,
  registrationNumber: 'PAL123',
  runOrder: 1,
  searchTimeSeconds: null,
  section: 'A',
  totalFaults: null,
  trialId: 'trial-1',
} satisfies Omit<ReportEntry, 'checkInStatus' | 'id' | 'resultText'>;

function makeEntry(overrides: Partial<ReportEntry> = {}): ReportEntry {
  return {
    ...baseEntry,
    checkInStatus: 'checked-in',
    id: 'entry-1',
    resultText: 'Q',
    ...overrides,
  };
}

const reportProps = {
  clubName: 'Demo Scent Work Club',
  entries: [
    makeEntry({ id: 'entry-1' }),
    makeEntry({ id: 'entry-2', resultText: 'WD' }),
    makeEntry({ id: 'entry-3' }),
  ],
  showName: 'Demo Trial',
  sortOrder: '',
  trial: {
    date: '2026-06-12',
    judgeName: 'Pat Judge',
    trialNumber: '2026123401',
  },
} satisfies ReportProps;

describe('buildAKCTrialSecretaryReportValues', () => {
  it('maps report props into the official AKC PDF field names', () => {
    expect(buildAKCTrialSecretaryReportValues(reportProps)).toEqual({
      text: {
        [AKC_TRIAL_SECRETARY_REPORT_FIELDS.club]: 'Demo Scent Work Club',
        [AKC_TRIAL_SECRETARY_REPORT_FIELDS.eventNumber]: '2026123401',
        [AKC_TRIAL_SECRETARY_REPORT_FIELDS.runsPaid]: 2,
        [AKC_TRIAL_SECRETARY_REPORT_FIELDS.totalFee]: '7.00',
        [AKC_TRIAL_SECRETARY_REPORT_FIELDS.totalRunsAtClosing]: 3,
        [AKC_TRIAL_SECRETARY_REPORT_FIELDS.trialDate]: '6/12/2026',
        [AKC_TRIAL_SECRETARY_REPORT_FIELDS.trialSecretary]: '',
        [AKC_TRIAL_SECRETARY_REPORT_FIELDS.withdrawn]: 1,
      },
    });
  });

  it('fills the official AKC trial secretary PDF with mapped values', async () => {
    const templateBytes = new Uint8Array(
      await readFile(resolve(repoRoot, 'docs/AKC-forms/SW-TSReport.pdf'))
    );
    const filledBytes = await fillPdfForm(
      templateBytes,
      buildAKCTrialSecretaryReportValues(reportProps)
    );
    const pdf = await PDFDocument.load(filledBytes);
    const form = pdf.getForm();

    expect(form.getTextField(AKC_TRIAL_SECRETARY_REPORT_FIELDS.club).getText()).toBe(
      'Demo Scent Work Club'
    );
    expect(form.getTextField(AKC_TRIAL_SECRETARY_REPORT_FIELDS.trialDate).getText()).toBe(
      '6/12/2026'
    );
    expect(form.getTextField(AKC_TRIAL_SECRETARY_REPORT_FIELDS.eventNumber).getText()).toBe(
      '2026123401'
    );
    expect(form.getTextField(AKC_TRIAL_SECRETARY_REPORT_FIELDS.totalRunsAtClosing).getText()).toBe(
      '3'
    );
    expect(form.getTextField(AKC_TRIAL_SECRETARY_REPORT_FIELDS.withdrawn).getText()).toBe('1');
    expect(form.getTextField(AKC_TRIAL_SECRETARY_REPORT_FIELDS.runsPaid).getText()).toBe('2');
    expect(form.getTextField(AKC_TRIAL_SECRETARY_REPORT_FIELDS.totalFee).getText()).toBe('7.00');
  });
});
