import { PDFDocument } from 'pdf-lib';
import type { GeneratedPremium } from '@/types/premium-types';
import { getOrganizationFormTemplateUrl } from '@/features/organization-forms/organizationFormTemplates';

/**
 * MYK9-2057: AKC Ch. 3 §15 wants "an official AKC entry form" in the premium. The official form is
 * the AKC Scent Work fillable PDF the Reports page fills per dog (`akc-scent-work-entry-form`), so
 * the premium appends that same blank template. react-pdf cannot embed an existing PDF page, so
 * the append happens on the rendered bytes, after the style-specific layout, which is why every
 * style gets it.
 */

/**
 * AKC premiums only (`premium.org` is the registry id the premium was generated for), and only when
 * a trial is Scent Work: the template is the Scent Work form, so an AKC show of another sport
 * does not get it.
 */
export function premiumHasAkcEntryForm(premium: GeneratedPremium): boolean {
  return premium.org === 'AKC' && premium.trials.some(trial => /scent\s*work/i.test(trial.type));
}

async function fetchAkcEntryFormTemplate(): Promise<Uint8Array> {
  const response = await fetch(getOrganizationFormTemplateUrl('akc-scent-work-entry-form'));
  if (!response.ok) throw new Error('Unable to load the AKC Scent Work entry form template.');
  return new Uint8Array(await response.arrayBuffer());
}

/** The premium PDF with the blank official AKC entry form appended as its last page(s). */
export async function appendAkcEntryForm(
  premiumPdf: Blob,
  loadTemplate: () => Promise<Uint8Array> = fetchAkcEntryFormTemplate
): Promise<Blob> {
  const [premiumDoc, templateDoc] = await Promise.all([
    PDFDocument.load(await premiumPdf.arrayBuffer()),
    loadTemplate().then(bytes => PDFDocument.load(bytes)),
  ]);
  const pages = await premiumDoc.copyPages(templateDoc, templateDoc.getPageIndices());
  for (const page of pages) premiumDoc.addPage(page);
  const bytes = await premiumDoc.save();
  return new Blob([bytes as BlobPart], { type: 'application/pdf' });
}
