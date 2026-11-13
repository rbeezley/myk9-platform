/**
 * MYK9-1844: what Reports says when an official PDF cannot be made. Making a PDF
 * changes nothing, so trying again is safe. The raw error goes to the console,
 * where the download paths have always logged it.
 */
import { toast } from 'sonner';

export const OFFICIAL_PDF_DOWNLOAD_FAILED = "We couldn't make the official PDF. Try again.";

/** Logs the raw error under the form's name (e.g. "AKC score sheet") and shows the fixed sentence. */
export function reportOfficialPdfDownloadFailed(error: unknown, form?: string): void {
  console.error(`[reports] official ${form ? `${form} ` : ''}PDF download failed`, error);
  toast.error(OFFICIAL_PDF_DOWNLOAD_FAILED);
}
