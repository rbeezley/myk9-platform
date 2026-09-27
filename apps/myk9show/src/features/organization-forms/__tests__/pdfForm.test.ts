import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument } from 'pdf-lib';
import { fillPdfForm } from '../pdfForm';
import { UKC_NOSEWORK_TRIAL_REPORT_FIELDS } from '../ukcNoseworkTrialReportFields';
import { AKC_TRIAL_SECRETARY_REPORT_FIELDS } from '../akcTrialSecretaryReportFields';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../../..');

async function loadTemplateBytes(relativePath: string): Promise<Uint8Array> {
  return new Uint8Array(await readFile(resolve(repoRoot, relativePath)));
}

describe('fillPdfForm — WinAnsi-unencodable characters (MYK9-846)', () => {
  it('does not throw on save when a UKC template field contains a non-WinAnsi letter and an emoji', async () => {
    const templateBytes = await loadTemplateBytes('docs/UKC-forms/NW-TrialReport.pdf');

    const filledBytes = await fillPdfForm(templateBytes, {
      text: {
        [UKC_NOSEWORK_TRIAL_REPORT_FIELDS.chairpersonName]: 'Łukasz 😀',
        [UKC_NOSEWORK_TRIAL_REPORT_FIELDS.clubName]: 'Zoë Müller Club',
      },
    });

    expect(filledBytes).toBeInstanceOf(Uint8Array);
  });

  it('saves the transliterated value and preserves already-encodable accents (UKC template)', async () => {
    const templateBytes = await loadTemplateBytes('docs/UKC-forms/NW-TrialReport.pdf');

    const filledBytes = await fillPdfForm(templateBytes, {
      text: {
        [UKC_NOSEWORK_TRIAL_REPORT_FIELDS.chairpersonName]: 'Łukasz 😀',
        [UKC_NOSEWORK_TRIAL_REPORT_FIELDS.clubName]: 'Zoë Müller Club',
      },
    });

    const form = (await PDFDocument.load(filledBytes)).getForm();
    expect(
      form.getTextField(UKC_NOSEWORK_TRIAL_REPORT_FIELDS.chairpersonName).getText()
    ).toBe('Lukasz ');
    expect(form.getTextField(UKC_NOSEWORK_TRIAL_REPORT_FIELDS.clubName).getText()).toBe(
      'Zoë Müller Club'
    );
  });

  it('still fills every other field when one field has an unencodable character (UKC template)', async () => {
    const templateBytes = await loadTemplateBytes('docs/UKC-forms/NW-TrialReport.pdf');

    const filledBytes = await fillPdfForm(templateBytes, {
      text: {
        [UKC_NOSEWORK_TRIAL_REPORT_FIELDS.chairpersonName]: 'Łukasz 😀',
        [UKC_NOSEWORK_TRIAL_REPORT_FIELDS.city]: 'Springfield',
        [UKC_NOSEWORK_TRIAL_REPORT_FIELDS.state]: 'IL',
      },
    });

    const form = (await PDFDocument.load(filledBytes)).getForm();
    expect(form.getTextField(UKC_NOSEWORK_TRIAL_REPORT_FIELDS.city).getText()).toBe('Springfield');
    expect(form.getTextField(UKC_NOSEWORK_TRIAL_REPORT_FIELDS.state).getText()).toBe('IL');
  });

  it('does not throw on save when an AKC template field contains a non-WinAnsi letter and an emoji', async () => {
    const templateBytes = await loadTemplateBytes('docs/AKC-forms/SW-TSReport.pdf');

    const filledBytes = await fillPdfForm(templateBytes, {
      text: {
        [AKC_TRIAL_SECRETARY_REPORT_FIELDS.trialSecretary]: 'Łukasz 😀',
      },
    });

    const form = (await PDFDocument.load(filledBytes)).getForm();
    expect(form.getTextField(AKC_TRIAL_SECRETARY_REPORT_FIELDS.trialSecretary).getText()).toBe(
      'Lukasz '
    );
  });
});
