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
  return buildOfficialPdfBytesFromValues(config.templateId, config.values(props));
}

export async function buildOfficialPdfBytesFromValues(
  templateId: OrganizationFormTemplateId,
  values: PdfFormFillValues
): Promise<Uint8Array> {
  const response = await fetch(getOrganizationFormTemplateUrl(templateId));
  if (!response.ok) {
    const template = getOrganizationFormTemplate(templateId);
    throw new Error(`Unable to load the ${template.label} template.`);
  }

  // Keep AcroForm fields editable so secretaries can add official notes before submission.
  return fillPdfForm(new Uint8Array(await response.arrayBuffer()), values, {
    flatten: false,
  });
}
