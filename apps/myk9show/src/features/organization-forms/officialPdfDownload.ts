import type { ReportProps } from '@/lib/reports/types';
import { fillPdfForm } from './pdfForm';
import {
  getOrganizationFormTemplate,
  getOrganizationFormTemplateUrl,
} from './organizationFormTemplates';
import type { OfficialPdfReportConfig } from './officialPdfReports';
import type { OrganizationFormTemplateId } from './organizationFormTemplates';
import type { PdfFormFillValues } from './pdfForm';

export async function buildOfficialPdfBytes(
  config: OfficialPdfReportConfig,
  props: ReportProps
): Promise<Uint8Array> {
  if (config.downloadMode === 'static') {
    return downloadOfficialPdfTemplateBytes(config.templateId);
  }

  return buildOfficialPdfBytesFromValues(config.templateId, config.values(props));
}

export async function downloadOfficialPdfTemplateBytes(
  templateId: OrganizationFormTemplateId
): Promise<Uint8Array> {
  const response = await fetch(getOrganizationFormTemplateUrl(templateId));
  if (!response.ok) {
    const template = getOrganizationFormTemplate(templateId);
    throw new Error(`Unable to load the ${template.label} template.`);
  }

  return new Uint8Array(await response.arrayBuffer());
}

export async function buildOfficialPdfBytesFromValues(
  templateId: OrganizationFormTemplateId,
  values: PdfFormFillValues
): Promise<Uint8Array> {
  const templateBytes = await downloadOfficialPdfTemplateBytes(templateId);

  // Keep AcroForm fields editable so secretaries can add official notes before submission.
  return fillPdfForm(templateBytes, values, {
    flatten: false,
  });
}
