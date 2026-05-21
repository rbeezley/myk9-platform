import type { ReportProps } from '@/lib/reports/types';
import { fillPdfForm } from './pdfForm';
import {
  getOrganizationFormTemplate,
  getOrganizationFormTemplateUrl,
} from './organizationFormTemplates';
import type { OfficialPdfReportConfig } from './officialPdfReports';

export async function buildOfficialPdfBytes(
  config: OfficialPdfReportConfig,
  props: ReportProps
): Promise<Uint8Array> {
  const response = await fetch(getOrganizationFormTemplateUrl(config.templateId));
  if (!response.ok) {
    const template = getOrganizationFormTemplate(config.templateId);
    throw new Error(`Unable to load the ${template.label} template.`);
  }

  // Keep AcroForm fields editable so secretaries can add official notes before submission.
  return fillPdfForm(new Uint8Array(await response.arrayBuffer()), config.values(props), {
    flatten: false,
  });
}
