import { useEffect } from 'react';
import { PDFDownloadLink } from '@react-pdf/renderer';
import { Download, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AKCPremiumTemplate } from './pdf/AKCPremiumTemplate';
import { UKCPremiumTemplate } from './pdf/UKCPremiumTemplate';
import type { GeneratedPremium } from '../../types/premium-types';

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

  return (
    <PDFDownloadLink
      document={<Template premium={premium} inkSaver={inkSaver} />}
      fileName={fileName}
      className="block"
      onClick={onDownloaded}
    >
      {({ loading, error: pdfError, url }) => (
        <>
          <DownloadLinkErrorWatcher error={pdfError ?? null} onError={onError} />
          <DownloadLinkUrlCapture url={url ?? null} loading={loading} onUrl={onUrl} />
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
              <Button className="w-full" disabled={loading}>
                <Download className="h-4 w-4 mr-2" />
                Download PDF
              </Button>
            </div>
          )}
        </>
      )}
    </PDFDownloadLink>
  );
}
