import { useEffect, useRef, useState } from 'react';
import { Download, Eye, Loader2 } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { renderPremiumPdf } from './publishPremium';
import type { GeneratedPremium } from '../../types/premium-types';

interface PremiumPdfDownloadLinkProps {
  showId: string;
  premium: GeneratedPremium;
  inkSaver: boolean;
  fileName: string;
  onDownloaded: () => void;
  onError: (error: Error) => void;
  onUrl: (url: string) => void;
  onPreview: () => void;
}

/** How long the inputs must be still before a PDF build starts (MYK9-2215). */
export const PDF_BUILD_SETTLE_MS = 300;

type PdfKey = { premium: GeneratedPremium; inkSaver: boolean; showId: string; attempt: number };
type PdfResult = { url: string } | { error: Error };
type PdfBuild = { status: 'preparing' } | { status: 'ready'; url: string } | { status: 'failed' };

/**
 * Builds the PDF with `renderPremiumPdf`, the same function publishing uses, so
 * Preview and Download carry the same bytes exhibitors get (AKC entry form
 * included). One Blob, one object URL; the URL is never fetched.
 */
function usePremiumPdfBuild(
  showId: string,
  premium: GeneratedPremium,
  inkSaver: boolean,
  onError: (error: Error) => void,
  onUrl: (url: string) => void
) {
  // The result is tagged with the inputs it was built for, so a changed premium reads as
  // "preparing" without a synchronous reset inside the effect.
  const [attempt, setAttempt] = useState(0);
  const builtAttemptRef = useRef(attempt);
  const [result, setResult] = useState<{ key: PdfKey; value: PdfResult } | null>(null);
  // Callers pass inline callbacks; the build must not restart when they change.
  const onErrorRef = useRef(onError);
  const onUrlRef = useRef(onUrl);
  useEffect(() => {
    onErrorRef.current = onError;
    onUrlRef.current = onUrl;
  }, [onError, onUrl]);

  useEffect(() => {
    const key = { premium, inkSaver, showId, attempt };
    let cancelled = false;
    let objectUrl: string | null = null;
    const retrying = attempt !== builtAttemptRef.current;
    builtAttemptRef.current = attempt;
    // Coalesce edits: the secretary's typing changes `premium` on every keystroke, and a full
    // render (plus the AKC entry-form join) per character is wasted work. Build only once the
    // inputs have been still for a moment; a retry builds at once.
    const timer = setTimeout(
      () => {
        renderPremiumPdf(showId, premium, inkSaver).then(
          blob => {
            if (cancelled) return;
            objectUrl = URL.createObjectURL(blob);
            setResult({ key, value: { url: objectUrl } });
            onUrlRef.current(objectUrl);
          },
          (err: unknown) => {
            if (cancelled) return;
            const error = err instanceof Error ? err : new Error(String(err));
            setResult({ key, value: { error } });
            onErrorRef.current(error);
          }
        );
      },
      retrying ? 0 : PDF_BUILD_SETTLE_MS
    );
    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (objectUrl) {
        const revoked = objectUrl;
        URL.revokeObjectURL(revoked);
        // A revoked URL must never be offered again: if the inputs flip back to these, the
        // cached result would match and point Preview and Download at a dead link.
        setResult(prev =>
          prev && 'url' in prev.value && prev.value.url === revoked ? null : prev
        );
      }
    };
  }, [showId, premium, inkSaver, attempt]);

  const current =
    result &&
    result.key.premium === premium &&
    result.key.inkSaver === inkSaver &&
    result.key.showId === showId &&
    result.key.attempt === attempt
      ? result.value
      : null;
  const build: PdfBuild = !current
    ? { status: 'preparing' }
    : 'url' in current
      ? { status: 'ready', url: current.url }
      : { status: 'failed' };
  return { build, retry: () => setAttempt(n => n + 1) };
}

/**
 * The premium editor's PDF preview and download buttons.
 *
 * Its own module so `PremiumContentEditor` can load it with React.lazy: this
 * file (through `publishPremium` and the two premium templates) is the only
 * place the editor reaches `@react-pdf/renderer`, and a static import would put
 * that ~1.2 MB renderer on the static path of every secretary show page.
 */
export default function PremiumPdfDownloadLink({
  showId,
  premium,
  inkSaver,
  fileName,
  onDownloaded,
  onError,
  onUrl,
  onPreview,
}: PremiumPdfDownloadLinkProps) {
  const { build, retry } = usePremiumPdfBuild(showId, premium, inkSaver, onError, onUrl);

  if (build.status === 'failed') {
    return (
      <div className="flex flex-col gap-2" role="alert">
        <p className="text-sm text-destructive">
          We could not build the PDF. Try again in a moment.
        </p>
        <Button className="w-full" variant="outline" onClick={retry}>
          Try again
        </Button>
      </div>
    );
  }

  const ready = build.status === 'ready';
  return (
    <div className="flex flex-col gap-2">
      <Button variant="outline" className="w-full" disabled={!ready} onClick={onPreview}>
        {ready ? (
          <Eye className="h-4 w-4 mr-2" />
        ) : (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        )}
        {ready ? 'Preview PDF' : 'Preparing PDF...'}
      </Button>
      {ready ? (
        <a
          href={build.url}
          download={fileName}
          className={cn(buttonVariants(), 'w-full')}
          onClick={onDownloaded}
        >
          <Download className="h-4 w-4 mr-2" />
          Download PDF
        </a>
      ) : (
        <Button className="w-full" disabled>
          <Download className="h-4 w-4 mr-2" />
          Download PDF
        </Button>
      )}
    </div>
  );
}
