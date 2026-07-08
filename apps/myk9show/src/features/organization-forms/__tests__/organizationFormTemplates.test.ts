import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getOrganizationFormTemplateUrl,
  getOrganizationFormTemplate,
  ORGANIZATION_FORM_TEMPLATES,
} from '../organizationFormTemplates';
import { listPdfFormFields } from '../pdfForm';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../../..');

async function readTemplatePdf(sourcePath: string): Promise<Uint8Array> {
  const buffer = await readFile(resolve(repoRoot, sourcePath));
  return new Uint8Array(buffer);
}

describe('organization form templates', () => {
  it('points each fillable mapped template at a real PDF with the required fields', async () => {
    for (const template of ORGANIZATION_FORM_TEMPLATES) {
      if (template.requiredFields.length === 0) continue;

      const fields = await listPdfFormFields(await readTemplatePdf(template.sourcePath));
      const fieldNames = new Set(fields.map(field => field.name));

      expect(fields.length, template.label).toBeGreaterThan(0);
      for (const fieldName of template.requiredFields) {
        expect(fieldNames.has(fieldName), `${template.label}: ${fieldName}`).toBe(true);
      }
    }
  });

  it('maps the AKC Scent Work score sheet as a drawable non-AcroForm template', async () => {
    const template = getOrganizationFormTemplate('akc-scent-work-score-sheet');
    const fields = await listPdfFormFields(await readTemplatePdf(template.sourcePath));

    expect(template).toMatchObject({
      label: 'AKC Scent Work Score Sheet',
      sourcePath: 'docs/AKC-forms/SW-Scoresheet.pdf',
      requiredFields: [],
    });
    expect(fields).toEqual([]);
  });

  it('returns the AKC trial secretary report mapping by id', () => {
    expect(getOrganizationFormTemplate('akc-scent-work-trial-secretary-report')).toMatchObject({
      label: 'AKC Scent Work Trial Secretary Report',
      sourcePath: 'docs/AKC-forms/SW-TSReport.pdf',
    });
  });

  it('returns the AKC Scent Work entry form mapping by id', () => {
    expect(getOrganizationFormTemplate('akc-scent-work-entry-form')).toMatchObject({
      label: 'AKC Scent Work Entry Form',
      sourcePath: 'docs/AKC-forms/SW-EntryForm.pdf',
    });
  });

  it('returns the AKC Scent Work certification page mapping by id', () => {
    expect(getOrganizationFormTemplate('akc-scent-work-certification-page')).toMatchObject({
      label: 'AKC Scent Work Certification Page',
      sourcePath: 'docs/AKC-forms/SW-CertificationPage.pdf',
    });
  });

  it('resolves the AKC trial secretary report runtime URL from the registry id', () => {
    expect(getOrganizationFormTemplateUrl('akc-scent-work-trial-secretary-report')).toContain(
      'SW-TSReport.pdf'
    );
  });

  it('resolves the AKC Scent Work entry form runtime URL from the registry id', () => {
    expect(getOrganizationFormTemplateUrl('akc-scent-work-entry-form')).toContain(
      'SW-EntryForm.pdf'
    );
  });

  it('resolves the AKC Scent Work score sheet runtime URL from the registry id', () => {
    expect(getOrganizationFormTemplateUrl('akc-scent-work-score-sheet')).toContain(
      'SW-Scoresheet.pdf'
    );
  });

  it('resolves the AKC Scent Work certification page runtime URL from the registry id', () => {
    expect(getOrganizationFormTemplateUrl('akc-scent-work-certification-page')).toContain(
      'SW-CertificationPage.pdf'
    );
  });
});
