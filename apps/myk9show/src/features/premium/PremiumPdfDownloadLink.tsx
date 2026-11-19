import { useEffect, useState } from 'react';
import { PDFDownloadLink } from '@react-pdf/renderer';
import { Download, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AKCPremiumTemplate } from './pdf/AKCPremiumTemplate';
import { UKCPremiumTemplate } from './pdf/UKCPremiumTemplate';
import type { GeneratedPremium } from '../../types/premium-types';
import { appendAkcEntryForm, premiumHasAkcEntryForm } from './akcEntryFormAppendix';

interface PremiumPdfDownloadLinkProps {
  premium: GeneratedPremium;
  inkSaver: boolean;
  fileName: string;
  onDownloaded: () => void;
  onError: (error: Error) => void;
  onUrl: (url: string) => void;
  onPreview: () => void;
}

function DownloadLinkErrorWatcher({
  error,
  onError,
}: {
  error: Error | null;
  onError: (e: Error) => void;
}) {
  useEffect(() => {
    if (error) onError(error);
  }, [error, error?.message, onError]);
  return null;
}

function DownloadLinkUrlCapture({
  url,
  loading,
  onUrl,
}: {
  url: string | null;
  loading: boolean;
  onUrl: (url: string) => void;
}) {
  useEffect(() => {
    if (url && !loading) onUrl(url);
  }, [url, loading, onUrl]);
  return null;
}

/**
 * MYK9-2057: an AKC Scent Work premium ends with the official entry form, here as in the
 * published copy. react-pdf renders the premium; this joins the form onto that rendered file,
 * so Preview and Download show what publishing will post. Other premiums pass through.
 */
function useFinalPremiumUrl(
  rawUrl: string | null,
  loading: boolean,
  withEntryForm: boolean,
  onError: (error: Error) => void
): { url: string | null; finalizing: boolean } {
  const [finalUrl, setFinalUrl] = useState<{ raw: string; url: string } | null>(null);
  useEffect(() => {
    if (!withEntryForm || !rawUrl || loading) return undefined;
    let cancelled = false;
    let created: string | null = null;
    void (async () => {
      try {
        const blob = await appendAkcEntryForm(await (await fetch(rawUrl)).blob());
        if (cancelled) return;
        created = URL.createObjectURL(blob);
        setFinalUrl({ raw: rawUrl, url: created });
      } catch (err) {
        if (!cancelled) onError(err instanceof Error ? err : new Error(String(err)));
      }
    })();
    return () => {
      cancelled = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [rawUrl, loading, withEntryForm, onError]);

  if (!withEntryForm) return { url: rawUrl, finalizing: false };
  const ready = finalUrl && finalUrl.raw === rawUrl ? finalUrl.url : null;
  return { url: ready, finalizing: !ready };
}

/**
 * The premium editor's PDF preview and download buttons.
 *
 * Its own module so `PremiumContentEditor` can load it with React.lazy: this
 * file (with the two premium templates) is the only place the editor reaches
 * `@react-pdf/renderer`, and a static import would put that ~1.2 MB renderer
 * on the static path of every secretary show page.
 */
export default function PremiumPdfDownloadLink({
  premium,
  inkSaver,
  fileName,
  onDownloaded,
  onError,
  onUrl,
  onPreview,
}: PremiumPdfDownloadLinkProps) {
  const Template = premium.org === 'UKC' ? UKCPremiumTemplate : AKCPremiumTemplate;
  const withEntryForm = premiumHasAkcEntryForm(premium);

  return (
    <PDFDownloadLink
      document={<Template premium={premium} inkSaver={inkSaver} />}
      fileName={fileName}
      className="block"
      onClick={onDownloaded}
    >
      {({ loading, error: pdfError, url }) => (
        <PremiumPdfButtons
          rawUrl={url ?? null}
          loading={loading}
          pdfError={pdfError ?? null}
          withEntryForm={withEntryForm}
          fileName={fileName}
          onDownloaded={onDownloaded}
          onError={onError}
          onUrl={onUrl}
          onPreview={onPreview}
        />
      )}
    </PDFDownloadLink>
  );
}

function PremiumPdfButtons({
  rawUrl,
  loading: rendering,
  pdfError,
  withEntryForm,
  fileName,
  onDownloaded,
  onError,
  onUrl,
  onPreview,
}: {
  rawUrl: string | null;
  loading: boolean;
  pdfError: Error | null;
  withEntryForm: boolean;
  fileName: string;
  onDownloaded: () => void;
  onError: (error: Error) => void;
  onUrl: (url: string) => void;
  onPreview: () => void;
}) {
  const { url, finalizing } = useFinalPremiumUrl(rawUrl, rendering, withEntryForm, onError);
  const loading = rendering || (withEntryForm && finalizing);
  return (
    <>
      <DownloadLinkErrorWatcher error={pdfError} onError={onError} />
      <DownloadLinkUrlCapture url={url} loading={loading} onUrl={onUrl} />
      {pdfError ? (
        <Button className="w-full" variant="destructive" disabled>
          PDF generation failed - try another style
        </Button>
      ) : (
        <div className="flex flex-col gap-2">
          <Button
            variant="outline"
            className="w-full"
            disabled={loading || !url}
            onClick={e => {
              e.preventDefault();
              e.stopPropagation();
              onPreview();
            }}
          >
            <Eye className="h-4 w-4 mr-2" />
            {loading ? 'Preparing PDF...' : 'Preview PDF'}
          </Button>
          <Button
            className="w-full"
            disabled={loading}
            onClick={
              withEntryForm
                ? e => {
                    // The link's own href is the premium without the form; save the joined file.
                    e.preventDefault();
                    e.stopPropagation();
                    if (!url) return;
                    const anchor = document.createElement('a');
                    anchor.href = url;
                    anchor.download = fileName;
                    anchor.click();
                    onDownloaded();
                  }
                : undefined
            }
          >
            <Download className="h-4 w-4 mr-2" />
            Download PDF
          </Button>
        </div>
      )}
    </>
  );
}
