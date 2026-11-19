import { PDFDocument } from 'pdf-lib';
import type { GeneratedPremium } from '@/types/premium-types';
import { getOrganizationFormTemplateUrl } from '@/features/organization-forms/organizationFormTemplates';

/**
 * MYK9-2057: AKC Ch. 3 §15 wants "an official AKC entry form" in the premium. The official form is
 * the AKC Scent Work fillable PDF the Reports page fills per dog (`akc-scent-work-entry-form`), so
 * the premium ends with that same blank template. react-pdf cannot embed an existing PDF page, so
 * the join happens on the rendered bytes, after the style-specific layout, which is why every
 * style gets it. Published, previewed and downloaded premiums all go through `appendAkcEntryForm`.
 */

/**
 * AKC premiums only (`premium.org` is the registry id the premium was generated for), and only when
 * a trial is Scent Work: the template is the Scent Work form, so an AKC show of another sport
 * does not get it.
 */
export function premiumHasAkcEntryForm(premium: GeneratedPremium): boolean {
  // Stored trial types vary in spelling: `scent_work` (most rows), "Scent Work", "Scent Work Nationals".
  return (
    premium.org === 'AKC' && premium.trials.some(trial => /scent[\s_-]*work/i.test(trial.type))
  );
}

async function fetchAkcEntryFormTemplate(): Promise<Uint8Array> {
  const response = await fetch(getOrganizationFormTemplateUrl('akc-scent-work-entry-form'));
  if (!response.ok) throw new Error('Unable to load the AKC Scent Work entry form template.');
  return new Uint8Array(await response.arrayBuffer());
}

/**
 * The premium PDF with the blank official AKC entry form as its last page(s).
 *
 * The premium's pages are inserted in front of the template's, rather than the template's pages
 * copied onto the premium: `copyPages` brings widget annotations but not the document's AcroForm,
 * so the form would print but no longer fill. Building on the template keeps its field tree.
 */
export async function appendAkcEntryForm(
  premiumPdf: Blob,
  loadTemplate: () => Promise<Uint8Array> = fetchAkcEntryFormTemplate
): Promise<Blob> {
  const [premiumDoc, formDoc] = await Promise.all([
    PDFDocument.load(await premiumPdf.arrayBuffer()),
    loadTemplate().then(bytes => PDFDocument.load(bytes)),
  ]);
  const premiumPages = await formDoc.copyPages(premiumDoc, premiumDoc.getPageIndices());
  premiumPages.forEach((page, index) => formDoc.insertPage(index, page));
  const bytes = await formDoc.save();
  return new Blob([bytes as BlobPart], { type: 'application/pdf' });
}
