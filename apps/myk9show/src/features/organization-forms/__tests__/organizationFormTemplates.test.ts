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
  it('points each mapped template at a real fillable PDF with the required fields', async () => {
    for (const template of ORGANIZATION_FORM_TEMPLATES) {
      const fields = await listPdfFormFields(await readTemplatePdf(template.sourcePath));
      const fieldNames = new Set(fields.map(field => field.name));

      expect(fields.length, template.label).toBeGreaterThan(0);
      for (const fieldName of template.requiredFields) {
        expect(fieldNames.has(fieldName), `${template.label}: ${fieldName}`).toBe(true);
      }
    }
  });

  it('returns the AKC trial secretary report mapping by id', () => {
    expect(getOrganizationFormTemplate('akc-scent-work-trial-secretary-report')).toMatchObject({
      label: 'AKC Scent Work Trial Secretary Report',
      sourcePath: 'docs/AKC-forms/SW-TSReport.pdf',
    });
  });

  it('resolves the AKC trial secretary report runtime URL from the registry id', () => {
    expect(getOrganizationFormTemplateUrl('akc-scent-work-trial-secretary-report')).toContain(
      'SW-TSReport.pdf'
    );
  });
});
