import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import type { ReportProps } from '@/lib/reports/types';
import { fillPdfForm } from '../pdfForm';
import { buildASCAScentDetectionGrossReceiptsValues } from '../ascaScentDetectionGrossReceipts';
import { ASCA_SCENT_DETECTION_GROSS_RECEIPTS_FIELDS } from '../ascaScentDetectionGrossReceiptsFields';
import {
  buildASCAScentDetectionPostEventEvaluationValues,
  countASCAPostEventRuns,
} from '../ascaScentDetectionPostEventEvaluation';
import { ASCA_SCENT_DETECTION_POST_EVENT_EVALUATION_FIELDS } from '../ascaScentDetectionPostEventEvaluationFields';

const reportProps = {
  clubName: 'Demo ASCA Club',
  entries: [
    {
      armband: 101,
      breed: 'Australian Shepherd',
      callName: 'Star',
      checkInStatus: 'present',
      dogId: 'dog-1',
      finalPlacement: 1,
      handler: 'Alice Handler',
      id: 'entry-1',
      isScored: true,
      resultText: 'Q',
      runOrder: 1,
      searchTimeSeconds: 45,
      section: null,
      totalFaults: 0,
      registrationNumber: 'E12345',
    },
    {
      armband: 102,
      breed: 'Border Collie',
      callName: 'Dash',
      checkInStatus: 'present',
      dogId: 'dog-2',
      finalPlacement: null,
      handler: 'Bob Handler',
      id: 'entry-2',
      isScored: true,
      resultText: 'NQ',
      runOrder: 2,
      searchTimeSeconds: null,
      section: null,
      totalFaults: null,
      registrationNumber: 'E67890',
    },
    {
      armband: 103,
      breed: 'Poodle',
      callName: 'Pip',
      checkInStatus: 'present',
      dogId: 'dog-3',
      finalPlacement: null,
      handler: 'Alice Handler',
      id: 'entry-3',
      isScored: true,
      resultText: 'Excused',
      runOrder: 3,
      searchTimeSeconds: null,
      section: null,
      totalFaults: null,
      registrationNumber: null,
    },
  ],
  organization: 'ASCA',
  showDates: 'June 12-13, 2026',
  showName: 'Demo ASCA Trial',
  sortOrder: '',
  trial: {
    date: '2026-06-12',
    judgeName: 'Pat Judge',
    registryId: 'ASCA',
    trialNumber: 'ASCA-2026-1',
  },
} satisfies ReportProps;

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../../..');

async function readTemplatePdf(sourcePath: string): Promise<Uint8Array> {
  const buffer = await readFile(resolve(repoRoot, sourcePath));
  return new Uint8Array(buffer);
}

describe('ASCA Scent Detection closeout PDFs', () => {
  it('maps derivable gross receipts header values and leaves fee rows unmapped', () => {
    expect(buildASCAScentDetectionGrossReceiptsValues(reportProps)).toEqual({
      text: {
        [ASCA_SCENT_DETECTION_GROSS_RECEIPTS_FIELDS.clubName]: 'Demo ASCA Club',
        [ASCA_SCENT_DETECTION_GROSS_RECEIPTS_FIELDS.eventDates]: 'June 12-13, 2026',
      },
    });
  });

  it('fills the official ASCA gross receipts PDF with derivable header values', async () => {
    const bytes = await fillPdfForm(
      await readTemplatePdf(
        'docs/rulebooks/asca-scent-detection-forms/ASCA_ScentDetectionGrossReceiptsReport.pdf'
      ),
      buildASCAScentDetectionGrossReceiptsValues(reportProps)
    );
    const form = (await PDFDocument.load(bytes)).getForm();

    expect(form.getTextField(ASCA_SCENT_DETECTION_GROSS_RECEIPTS_FIELDS.clubName).getText()).toBe(
      'Demo ASCA Club'
    );
    expect(form.getTextField(ASCA_SCENT_DETECTION_GROSS_RECEIPTS_FIELDS.eventDates).getText()).toBe(
      'June 12-13, 2026'
    );
  });

  it('counts ASCA post-event run outcomes from result text', () => {
    expect(countASCAPostEventRuns(reportProps.entries)).toEqual({
      excusals: 1,
      nonQualifyingRuns: 1,
      qualifyingRuns: 1,
    });
  });

  it('does not guess unknown ASCA post-event run outcomes', () => {
    expect(
      countASCAPostEventRuns([
        ...reportProps.entries,
        {
          ...reportProps.entries[0],
          callName: 'Mystery',
          dogId: 'dog-4',
          handler: 'Cara Handler',
          id: 'entry-4',
          resultText: 'ABS',
        },
      ])
    ).toEqual({
      excusals: 1,
      nonQualifyingRuns: 1,
      qualifyingRuns: 1,
    });
  });

  it('fills the official ASCA post-event PDF with derivable count values', async () => {
    const values = buildASCAScentDetectionPostEventEvaluationValues(reportProps);
    const bytes = await fillPdfForm(
      await readTemplatePdf(
        'docs/rulebooks/asca-scent-detection-forms/ASCA_scentpostevaluationform.pdf'
      ),
      values
    );
    const form = (await PDFDocument.load(bytes)).getForm();

    expect(
      form.getTextField(ASCA_SCENT_DETECTION_POST_EVENT_EVALUATION_FIELDS.clubName).getText()
    ).toBe('Demo ASCA Club');
    expect(
      form.getTextField(ASCA_SCENT_DETECTION_POST_EVENT_EVALUATION_FIELDS.eventDate).getText()
    ).toBe('June 12-13, 2026');
    expect(
      form.getTextField(ASCA_SCENT_DETECTION_POST_EVENT_EVALUATION_FIELDS.dogsEntered).getText()
    ).toBe('3');
    expect(
      form.getTextField(ASCA_SCENT_DETECTION_POST_EVENT_EVALUATION_FIELDS.handlers).getText()
    ).toBe('2');
    expect(
      form.getTextField(ASCA_SCENT_DETECTION_POST_EVENT_EVALUATION_FIELDS.qualifyingRuns).getText()
    ).toBe('1');
    expect(
      form
        .getTextField(ASCA_SCENT_DETECTION_POST_EVENT_EVALUATION_FIELDS.nonQualifyingRuns)
        .getText()
    ).toBe('1');
    expect(
      form.getTextField(ASCA_SCENT_DETECTION_POST_EVENT_EVALUATION_FIELDS.excusals).getText()
    ).toBe('1');
    expect(values.text).not.toHaveProperty(
      ASCA_SCENT_DETECTION_POST_EVENT_EVALUATION_FIELDS.signature
    );
    expect(
      form.getField(ASCA_SCENT_DETECTION_POST_EVENT_EVALUATION_FIELDS.signature).constructor.name
    ).toBe('PDFSignature');
  });
});
