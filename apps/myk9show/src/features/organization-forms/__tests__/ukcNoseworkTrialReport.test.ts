import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument } from 'pdf-lib';
import type { ReportEntry, ReportProps } from '@/lib/reports/types';
import {
  buildUKCNoseworkTrialReportValues,
  countUKCNoseworkEntries,
} from '../ukcNoseworkTrialReport';
import { UKC_NOSEWORK_TRIAL_REPORT_FIELDS } from '../ukcNoseworkTrialReportFields';
import { fillPdfForm } from '../pdfForm';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../../..');

const baseEntry = {
  armband: 101,
  breed: 'Beagle',
  callName: 'Rocket',
  checkInStatus: null,
  finalPlacement: null,
  handler: 'Jamie Walker',
  isScored: false,
  registrationNumber: null,
  resultText: null,
  runOrder: 1,
  searchTimeSeconds: null,
  section: null,
  totalFaults: null,
} satisfies Omit<ReportEntry, 'id'>;

function makeEntry(overrides: Partial<ReportEntry> = {}): ReportEntry {
  return {
    ...baseEntry,
    id: overrides.id ?? 'entry-1',
    ...overrides,
  };
}

const reportProps = {
  clubName: 'Demo Nosework Club',
  entries: [
    makeEntry({ id: 'online-1', paymentMethod: 'online' }),
    makeEntry({ id: 'pre-1' }),
    makeEntry({ id: 'pre-2', isDayOfShow: false }),
    makeEntry({ id: 'day-1', isDayOfShow: true }),
    makeEntry({ id: 'day-2', isDayOfShow: true, paymentMethod: 'cash' }),
  ],
  showName: 'Demo UKC Trial',
  sortOrder: '',
  trial: {
    date: '2026-06-12',
    judgeName: 'Pat Judge',
    trialNumber: '2026123401',
  },
} satisfies ReportProps;

describe('countUKCNoseworkEntries', () => {
  it('splits entries into UKC online, pre-entry, and day-of-show buckets', () => {
    expect(countUKCNoseworkEntries(reportProps.entries)).toEqual({
      dayOfShowEntries: 2,
      onlineEntries: 1,
      preEntries: 2,
      totalEntries: 5,
    });
  });
});

describe('buildUKCNoseworkTrialReportValues', () => {
  it('maps report props into the official UKC Nosework Trial Report field names', () => {
    expect(buildUKCNoseworkTrialReportValues(reportProps)).toEqual({
      checkboxes: {
        [UKC_NOSEWORK_TRIAL_REPORT_FIELDS.oneTrial]: true,
      },
      text: {
        [UKC_NOSEWORK_TRIAL_REPORT_FIELDS.clubName]: 'Demo Nosework Club',
        [UKC_NOSEWORK_TRIAL_REPORT_FIELDS.dayOfShowEntries]: 2,
        [UKC_NOSEWORK_TRIAL_REPORT_FIELDS.dayOfShowSubtotal]: '8.00',
        [UKC_NOSEWORK_TRIAL_REPORT_FIELDS.eventDate]: '6/12/2026',
        [UKC_NOSEWORK_TRIAL_REPORT_FIELDS.grandTotalDue]: '16.00',
        [UKC_NOSEWORK_TRIAL_REPORT_FIELDS.onlineEntries]: 1,
        [UKC_NOSEWORK_TRIAL_REPORT_FIELDS.onlineSubtotal]: '4.00',
        [UKC_NOSEWORK_TRIAL_REPORT_FIELDS.preEntries]: 2,
        [UKC_NOSEWORK_TRIAL_REPORT_FIELDS.preEntrySubtotal]: '8.00',
        [UKC_NOSEWORK_TRIAL_REPORT_FIELDS.totalEntries]: 5,
      },
    });
  });

  it('omits fields that require missing source data while preserving zero totals', () => {
    const values = buildUKCNoseworkTrialReportValues({
      ...reportProps,
      clubName: undefined,
      entries: [],
      trial: undefined,
    });

    expect(values.text).not.toHaveProperty(UKC_NOSEWORK_TRIAL_REPORT_FIELDS.clubName);
    expect(values.text).not.toHaveProperty(UKC_NOSEWORK_TRIAL_REPORT_FIELDS.eventDate);
    expect(values.text).toMatchObject({
      [UKC_NOSEWORK_TRIAL_REPORT_FIELDS.dayOfShowEntries]: 0,
      [UKC_NOSEWORK_TRIAL_REPORT_FIELDS.grandTotalDue]: '0.00',
      [UKC_NOSEWORK_TRIAL_REPORT_FIELDS.preEntries]: 0,
      [UKC_NOSEWORK_TRIAL_REPORT_FIELDS.totalEntries]: 0,
    });
  });

  it('fills the official UKC Nosework Trial Report PDF with mapped values', async () => {
    const templateBytes = new Uint8Array(
      await readFile(resolve(repoRoot, 'docs/UKC-forms/NW-TrialReport.pdf'))
    );
    const filledBytes = await fillPdfForm(
      templateBytes,
      buildUKCNoseworkTrialReportValues(reportProps)
    );
    const pdf = await PDFDocument.load(filledBytes);
    const form = pdf.getForm();

    expect(form.getCheckBox(UKC_NOSEWORK_TRIAL_REPORT_FIELDS.oneTrial).isChecked()).toBe(true);
    expect(form.getTextField(UKC_NOSEWORK_TRIAL_REPORT_FIELDS.clubName).getText()).toBe(
      'Demo Nosework Club'
    );
    expect(form.getTextField(UKC_NOSEWORK_TRIAL_REPORT_FIELDS.eventDate).getText()).toBe(
      '6/12/2026'
    );
    expect(form.getTextField(UKC_NOSEWORK_TRIAL_REPORT_FIELDS.preEntries).getText()).toBe('2');
    expect(form.getTextField(UKC_NOSEWORK_TRIAL_REPORT_FIELDS.dayOfShowEntries).getText()).toBe(
      '2'
    );
    expect(form.getTextField(UKC_NOSEWORK_TRIAL_REPORT_FIELDS.totalEntries).getText()).toBe('5');
    expect(form.getTextField(UKC_NOSEWORK_TRIAL_REPORT_FIELDS.grandTotalDue).getText()).toBe(
      '16.00'
    );
  });
});
