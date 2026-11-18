import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { getErrorMessage } from '@myk9/core';
import { notifications } from '@/lib/notifications';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { useGeneratePremium } from './useGeneratePremium';
import { PremiumEditorFields } from './PremiumEditorFields';
import { PREMIUM_PENDING_REASON } from './premiumPendingCopy';
import { useLogPremiumGeneration } from '../../hooks/queries/usePremiumGenerations';
import { useUpdatePremiumTemplate } from '../../hooks/queries/usePremiumTemplates';
import { uploadShowCover } from '../../services/imageUploadService';
import { computePremiumDiff } from './logPremiumGeneration';
import { fileToDataUrl, resolvePdfCoverImageSrc } from './coverImageDataUrl';
import { narrativeGenerationFailed, stripPlaceholderNarratives } from './premiumNarratives';
import type { GeneratedPremium, PremiumStyle } from '../../types/premium-types';

const GENERATION_TIMEOUT_MS = 20_000;

interface PremiumContentEditorProps {
  showId: string;
  clubId: string;
  showOrg: 'AKC' | 'UKC' | null;
  style?: PremiumStyle;
  active?: boolean;
  initialPremium?: GeneratedPremium;
  deferGeneration?: boolean;
  onPremiumChange?: (premium: GeneratedPremium | undefined) => void;
  onInkSaverChange?: (inkSaver: boolean) => void;
  /** True while a Regenerate is pending, so the parent can hold Save-with-publish. */
  onPendingChange?: (pending: boolean) => void;
}

// Loaded on demand: the PDF buttons (and the templates) pull in @react-pdf/renderer.
const PremiumPdfDownloadLink = lazy(() => import('./PremiumPdfDownloadLink'));

function withGenerationTimeout<T>(promise: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      reject(
        new Error('We could not finish generating this content. Please try again in a moment.')
      );
    }, GENERATION_TIMEOUT_MS);

    promise.then(
      value => {
        window.clearTimeout(timeout);
        resolve(value);
      },
      err => {
        window.clearTimeout(timeout);
        reject(err);
      }
    );
  });
}

export function PremiumContentEditor({
  showId,
  clubId,
  showOrg,
  style,
  active = true,
  initialPremium,
  deferGeneration = false,
  onPremiumChange,
  onInkSaverChange,
  onPendingChange,
}: PremiumContentEditorProps) {
  const { generate, isLoading, error, reset } = useGeneratePremium();
  const logMutation = useLogPremiumGeneration(clubId);
  const updateTemplateMutation = useUpdatePremiumTemplate(clubId);
  const [original, setOriginal] = useState<GeneratedPremium | null>(() => initialPremium ?? null);
  const [supplemental, setSupplemental] = useState<GeneratedPremium['supplemental'] | null>(
    () => initialPremium?.supplemental ?? null
  );
  const [narratives, setNarratives] = useState<GeneratedPremium['narratives'] | null>(() =>
    initialPremium ? stripPlaceholderNarratives(initialPremium.narratives) : null
  );
  const [hasNarrativeError, setHasNarrativeError] = useState(false);
  const [inkSaver, setInkSaver] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfCoverImageSrc, setPdfCoverImageSrc] = useState<string | null>(null);
  const [pdfCoverImageRemoteUrl, setPdfCoverImageRemoteUrl] = useState<string | null>(null);
  const [coverImageResolveFailed, setCoverImageResolveFailed] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isUploadingCover, setIsUploadingCover] = useState(false);
  const [autoGenerateAttemptedFor, setAutoGenerateAttemptedFor] = useState<string | null>(null);
  const onPremiumChangeRef = useRef(onPremiumChange);
  const onInkSaverChangeRef = useRef(onInkSaverChange);
  const onPendingChangeRef = useRef(onPendingChange);
  // MYK9-2144: each request takes the next number; only the latest may apply its result or
  // clear the pending flag, and 0 means nothing is in flight.
  const latestRequestRef = useRef(0);
  const requestCounterRef = useRef(0);

  useEffect(() => {
    onPremiumChangeRef.current = onPremiumChange;
  }, [onPremiumChange]);

  useEffect(() => {
    onInkSaverChangeRef.current = onInkSaverChange;
  }, [onInkSaverChange]);

  useEffect(() => {
    onPendingChangeRef.current = onPendingChange;
  }, [onPendingChange]);

  useEffect(() => {
    // Only regenerating an existing draft holds Save: a first generation has no old premium.
    onPendingChangeRef.current?.(isGenerating && original !== null);
  }, [isGenerating, original]);

  // The Premium tab unmounts its panel when the secretary switches tabs. A request still in
  // flight then belongs to no one: drop its result and release Save, or the whole show edit
  // panel would stay held until closed.
  useEffect(
    () => () => {
      latestRequestRef.current = 0;
      onPendingChangeRef.current?.(false);
    },
    []
  );

  // INTENT: Toast at most once per distinct PDF render error message. The
  // PDFDownloadLink render-prop re-fires on every internal state tick, so the
  // toast must live outside that body.
  const lastPdfErrorMessageRef = useRef<string | null>(null);

  const handlePdfError = useCallback((err: Error) => {
    if (lastPdfErrorMessageRef.current === err.message) return;
    lastPdfErrorMessageRef.current = err.message;
    notifications.error(
      'This style failed to render - please try a different one or report the issue.'
    );
  }, []);

  const handleGenerate = useCallback(async () => {
    lastPdfErrorMessageRef.current = null;
    setGenerationError(null);
    setIsGenerating(true);
    setAutoGenerateAttemptedFor(showId);
    const requestId = ++requestCounterRef.current;
    latestRequestRef.current = requestId;
    try {
      const result = await withGenerationTimeout(generate(showId));
      if (latestRequestRef.current !== requestId) return;
      const cleaned = { ...result, narratives: stripPlaceholderNarratives(result.narratives) };
      setOriginal(cleaned);
      setSupplemental(cleaned.supplemental);
      setNarratives(cleaned.narratives);
      setHasNarrativeError(narrativeGenerationFailed(cleaned));
    } catch (err) {
      if (latestRequestRef.current !== requestId) return;
      setGenerationError(
        err instanceof Error ? err.message : 'We could not generate that content.'
      );
    } finally {
      if (latestRequestRef.current === requestId) {
        latestRequestRef.current = 0;
        setIsGenerating(false);
      }
    }
  }, [generate, showId]);

  useEffect(() => {
    // A request in flight owns the draft; this must not populate over it or clear its flag.
    if (!active || original || !initialPremium || latestRequestRef.current !== 0) return;
    setOriginal(initialPremium);
    setSupplemental(initialPremium.supplemental);
    setNarratives(stripPlaceholderNarratives(initialPremium.narratives));
    setGenerationError(null);
  }, [active, initialPremium, original]);

  useEffect(() => {
    if (
      active &&
      showOrg &&
      showId &&
      !original &&
      !initialPremium &&
      !deferGeneration &&
      !isLoading &&
      autoGenerateAttemptedFor !== showId
    ) {
      void handleGenerate();
    }
  }, [
    active,
    autoGenerateAttemptedFor,
    handleGenerate,
    deferGeneration,
    initialPremium,
    isLoading,
    original,
    showId,
    showOrg,
  ]);

  useEffect(() => {
    if (active) return;
    latestRequestRef.current = 0;
    reset();
    setOriginal(null);
    setSupplemental(null);
    setNarratives(null);
    setHasNarrativeError(false);
    setInkSaver(false);
    setPdfUrl(null);
    setPdfCoverImageSrc(null);
    setPdfCoverImageRemoteUrl(null);
    setCoverImageResolveFailed(false);
    setPreviewOpen(false);
    setGenerationError(null);
    setIsGenerating(false);
    setAutoGenerateAttemptedFor(null);
    onPremiumChangeRef.current?.(undefined);
    onInkSaverChangeRef.current?.(false);
  }, [active, reset]);

  function buildFinalPremium(): GeneratedPremium | null {
    if (!original || !supplemental || !narratives) return null;
    const finalSupplemental = {
      ...supplemental,
      coverImageUrl: pdfCoverImageSrc ?? supplemental.coverImageUrl,
    };
    return {
      ...original,
      style: style ?? original.style,
      supplemental: finalSupplemental,
      narratives,
    };
  }

  const handleCoverUpload = useCallback(
    async (file: File | null) => {
      if (!file || !supplemental) return;
      setIsUploadingCover(true);
      try {
        const [dataUrl, result] = await Promise.all([
          fileToDataUrl(file),
          uploadShowCover(showId, file),
        ]);
        if (!result.success || !result.url) {
          notifications.error('Cover image upload failed', {
            description: result.error ?? 'Please try another JPEG, PNG, or WebP image.',
          });
          return;
        }
        const uploadedUrl = result.url;

        if (original?.templateId) {
          await updateTemplateMutation.mutateAsync({
            id: original.templateId,
            updates: { coverImageUrl: uploadedUrl },
          });
        }

        setPdfCoverImageSrc(dataUrl);
        setPdfCoverImageRemoteUrl(uploadedUrl);
        setCoverImageResolveFailed(false);
        setSupplemental(s => (s ? { ...s, coverImageUrl: uploadedUrl } : s));
        notifications.success(
          original?.templateId ? 'Cover image saved' : 'Cover image ready for this premium'
        );
      } catch (err) {
        notifications.error('Cover image upload failed', { description: getErrorMessage(err) });
      } finally {
        setIsUploadingCover(false);
      }
    },
    [original?.templateId, showId, supplemental, updateTemplateMutation]
  );

  const handleCoverRemove = useCallback(async () => {
    if (!supplemental?.coverImageUrl) return;
    setIsUploadingCover(true);
    try {
      if (original?.templateId) {
        await updateTemplateMutation.mutateAsync({
          id: original.templateId,
          updates: { coverImageUrl: null },
        });
      }
      setPdfCoverImageSrc(null);
      setPdfCoverImageRemoteUrl(null);
      setCoverImageResolveFailed(false);
      setSupplemental(s => (s ? { ...s, coverImageUrl: null } : s));
      notifications.success('Cover image removed');
    } catch (err) {
      notifications.error('Cover image remove failed', { description: getErrorMessage(err) });
    } finally {
      setIsUploadingCover(false);
    }
  }, [original?.templateId, supplemental?.coverImageUrl, updateTemplateMutation]);

  useEffect(() => {
    let cancelled = false;
    const coverImageUrl = supplemental?.coverImageUrl ?? null;
    if (!coverImageUrl) {
      setPdfCoverImageSrc(null);
      setPdfCoverImageRemoteUrl(null);
      setCoverImageResolveFailed(false);
      return;
    }
    if (coverImageUrl === pdfCoverImageRemoteUrl && pdfCoverImageSrc?.startsWith('data:')) {
      setCoverImageResolveFailed(false);
      return;
    }
    setCoverImageResolveFailed(false);
    void resolvePdfCoverImageSrc(coverImageUrl).then(src => {
      if (cancelled) return;
      setPdfCoverImageSrc(src);
      setPdfCoverImageRemoteUrl(src ? coverImageUrl : null);
      setCoverImageResolveFailed(!src);
    });
    return () => {
      cancelled = true;
    };
  }, [pdfCoverImageRemoteUrl, pdfCoverImageSrc, supplemental?.coverImageUrl]);

  async function handleDownloaded() {
    if (!original || !supplemental || !narratives) return;
    const diff = computePremiumDiff(original, supplemental, narratives, style ?? original.style);
    try {
      await logMutation.mutateAsync({
        showId,
        clubId,
        templateId: original.templateId,
        org: original.org,
        fieldOverrides: diff.fieldOverrides,
        narrativeEdits: diff.narrativeEdits,
      });
    } catch {
      console.error('[premium-bridge] Failed to log premium generation');
    }
  }

  const finalPremium = useMemo(
    () => (original ? buildFinalPremium() : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [original, supplemental, narratives, style]
  );
  useEffect(() => {
    onPremiumChangeRef.current?.(finalPremium ?? undefined);
  }, [finalPremium]);

  useEffect(() => {
    onInkSaverChangeRef.current?.(inkSaver);
  }, [inkSaver]);

  return (
    <>
      <div className="space-y-4">
        {!original && !isLoading && !showOrg && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              This show has no organization set. Set AKC or UKC before generating a premium.
            </AlertDescription>
          </Alert>
        )}

        {(isLoading || isGenerating) && (
          <div
            role="status"
            className={
              original
                ? 'flex items-center gap-2 text-sm text-muted-foreground'
                : 'flex flex-col items-center gap-3 py-8 text-muted-foreground'
            }
          >
            <Loader2 className={original ? 'h-4 w-4 animate-spin' : 'h-6 w-6 animate-spin'} />
            <p className="text-sm">Generating narratives... (~5-10 seconds)</p>
          </div>
        )}

        {(error || generationError) && (
          <Alert variant="destructive">
            <AlertDescription>{error ?? generationError}</AlertDescription>
          </Alert>
        )}

        {original && supplemental && narratives && (
          <>
            {hasNarrativeError && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="space-y-3">
                  <p>
                    {original.narrativeGenerationError
                      ? `Couldn't refresh the narratives (${original.narrativeGenerationError}). Check the text below, or try again.`
                      : 'Narrative generation did not return text. You can retry or edit the fields below before downloading.'}
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={isGenerating}
                    onClick={() => void handleGenerate()}
                  >
                    Try narrative generation again
                  </Button>
                </AlertDescription>
              </Alert>
            )}

            {!original.supplemental.vetClinic && (
              <Alert>
                <AlertDescription>
                  No premium template found for this club. Fill in the fields below, or add a
                  template in Club Settings.
                </AlertDescription>
              </Alert>
            )}

            <PremiumEditorFields
              supplemental={supplemental}
              narratives={narratives}
              setSupplemental={setSupplemental}
              setNarratives={setNarratives}
              isUploadingCover={isUploadingCover}
              coverImageResolveFailed={coverImageResolveFailed}
              readOnly={isGenerating}
              onCoverUpload={file => void handleCoverUpload(file)}
              onCoverRemove={() => void handleCoverRemove()}
            />

            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                checked={inkSaver}
                onCheckedChange={checked => setInkSaver(Boolean(checked))}
              />
              <span className="text-sm">Print-friendly (saves ink)</span>
            </label>

            <div className="mt-4 flex flex-col gap-3">
              {isGenerating ? (
                <div className="space-y-1">
                  <Button variant="outline" className="w-full" disabled>
                    Download PDF
                  </Button>
                  <p className="text-xs text-muted-foreground">{PREMIUM_PENDING_REASON}</p>
                </div>
              ) : finalPremium ? (
                <Suspense
                  fallback={
                    <Button variant="outline" className="w-full" disabled>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Preparing PDF...
                    </Button>
                  }
                >
                  <PremiumPdfDownloadLink
                    premium={finalPremium}
                    inkSaver={inkSaver}
                    fileName={`${original.show.name.replace(/\s+/g, '-')}-premium.pdf`}
                    onDownloaded={() => {
                      void handleDownloaded();
                    }}
                    onError={handlePdfError}
                    onUrl={setPdfUrl}
                    onPreview={() => setPreviewOpen(true)}
                  />
                </Suspense>
              ) : null}

              <Button
                variant="ghost"
                size="sm"
                className="w-full"
                disabled={isGenerating}
                onClick={() => void handleGenerate()}
              >
                Regenerate
              </Button>
            </div>
          </>
        )}
      </div>

      {previewOpen && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70"
          onClick={e => {
            if (e.target === e.currentTarget) setPreviewOpen(false);
          }}
        >
          <div className="flex h-[92vh] w-[90vw] max-w-5xl flex-col overflow-hidden rounded-lg bg-white shadow-2xl">
            <div className="flex shrink-0 items-center justify-between border-b px-4 py-2">
              <span className="text-sm font-medium text-gray-900">
                {original?.show.name ?? 'Premium Preview'}
              </span>
              <button
                className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                onClick={() => setPreviewOpen(false)}
                aria-label="Close preview"
              >
                x
              </button>
            </div>
            {pdfUrl && <iframe src={pdfUrl} className="flex-1 border-0" title="PDF Preview" />}
          </div>
        </div>
      )}
    </>
  );
}
