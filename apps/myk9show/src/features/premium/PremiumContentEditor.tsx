import { usePremiumContentEdited } from './usePremiumContentEdited';
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
import { withGenerationTimeout } from './withGenerationTimeout';
import { stripPlaceholderNarratives } from './premiumNarratives';
import { PremiumPdfPreviewOverlay } from './PremiumPdfPreviewOverlay';
import { cachedDraftFor, withFreshFacts, type PremiumDraftCache } from './premiumDraftCache';
import { buildFinalPremium } from './buildFinalPremium';
import { usePremiumDraftSync } from './usePremiumDraftSync';
import type { GeneratedPremium, PremiumStyle } from '../../types/premium-types';

interface PremiumContentEditorProps {
  showId: string;
  clubId: string;
  showOrg: 'AKC' | 'UKC' | 'ASCA' | null;
  style?: PremiumStyle;
  active?: boolean;
  initialPremium?: GeneratedPremium;
  deferGeneration?: boolean;
  /** Why generating is held (MYK9-2213); disables Regenerate and shows this line. */
  regenerateBlockedReason?: string;
  /** A narrative input Edit show can change is unsaved (MYK9-2280); holds "Use the show's current details". */
  unsavedShowInputs?: boolean;
  onPremiumChange?: (premium: GeneratedPremium | undefined) => void;
  /** True once the narratives or supplemental details differ from what first loaded (MYK9-2201). */
  onEditedChange?: (edited: boolean) => void;
  onInkSaverChange?: (inkSaver: boolean) => void;
  /** True while a Regenerate is pending, so the parent can hold Save-with-publish. */
  onPendingChange?: (pending: boolean) => void;
  /** Keeps the edits across unmounts (MYK9-2236); without one, inactive resets the editor. */
  draftCache?: PremiumDraftCache;
}

// Loaded on demand: the PDF buttons (and the templates) pull in @react-pdf/renderer.
const PremiumPdfDownloadLink = lazy(() => import('./PremiumPdfDownloadLink'));

export function PremiumContentEditor({
  showId,
  clubId,
  showOrg,
  style,
  active = true,
  initialPremium,
  deferGeneration = false,
  regenerateBlockedReason,
  unsavedShowInputs = false,
  onPremiumChange,
  onEditedChange,
  onInkSaverChange,
  onPendingChange,
  draftCache,
}: PremiumContentEditorProps) {
  const { generate, isLoading, error, reset } = useGeneratePremium();
  const logMutation = useLogPremiumGeneration(clubId);
  const updateTemplateMutation = useUpdatePremiumTemplate(clubId);
  // MYK9-2236: a remount restores what the secretary had, and takes fresh facts once offered.
  const [restored] = useState(() => cachedDraftFor(draftCache, showId, showOrg));
  const factsPendingRef = useRef(restored !== null);
  const [original, setOriginal] = useState<GeneratedPremium | null>(
    () => restored?.original ?? initialPremium ?? null
  );
  const [supplemental, setSupplemental] = useState<GeneratedPremium['supplemental'] | null>(
    () => restored?.supplemental ?? initialPremium?.supplemental ?? null
  );
  const [narratives, setNarratives] = useState<GeneratedPremium['narratives'] | null>(
    () =>
      restored?.narratives ??
      (initialPremium ? stripPlaceholderNarratives(initialPremium.narratives) : null)
  );
  const [inkSaver, setInkSaver] = useState(restored?.inkSaver ?? false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfCoverImageSrc, setPdfCoverImageSrc] = useState<string | null>(null);
  const [pdfCoverImageRemoteUrl, setPdfCoverImageRemoteUrl] = useState<string | null>(null);
  const [coverImageResolveFailed, setCoverImageResolveFailed] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(
    restored?.generationError ?? null
  );
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
    onInkSaverChangeRef.current = onInkSaverChange;
    onPendingChangeRef.current = onPendingChange;
  }, [onPremiumChange, onInkSaverChange, onPendingChange]);

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
  // PDF build reports each failure to this callback, so the dedupe must live here.
  const lastPdfErrorMessageRef = useRef<string | null>(null);

  const handlePdfError = useCallback((err: Error) => {
    if (lastPdfErrorMessageRef.current === err.message) return;
    lastPdfErrorMessageRef.current = err.message;
    notifications.error('We could not build the PDF. Use Try again in the PDF section.');
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
      factsPendingRef.current = false;
      setOriginal(cleaned);
      setSupplemental(cleaned.supplemental);
      setNarratives(cleaned.narratives);
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
    if (!active || !initialPremium || latestRequestRef.current !== 0) return;
    if (original && factsPendingRef.current) {
      factsPendingRef.current = false;
      setOriginal(withFreshFacts(initialPremium, original));
      return;
    }
    if (original) return;
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
      !regenerateBlockedReason &&
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
    regenerateBlockedReason,
    showId,
    showOrg,
  ]);

  usePremiumDraftSync(
    draftCache,
    active,
    { showId, original, supplemental, narratives, generationError, inkSaver },
    () => {
      onPremiumChangeRef.current?.(undefined);
      onInkSaverChangeRef.current?.(false);
    }
  );

  useEffect(() => {
    if (active || draftCache) return;
    latestRequestRef.current = 0;
    reset();
    setOriginal(null);
    setSupplemental(null);
    setNarratives(null);
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
  }, [active, draftCache, reset]);

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
    () =>
      original
        ? buildFinalPremium({
            original,
            supplemental,
            narratives,
            style,
            resolvedCover:
              pdfCoverImageRemoteUrl === supplemental?.coverImageUrl ? pdfCoverImageSrc : null,
          })
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [original, supplemental, narratives, style, pdfCoverImageSrc, pdfCoverImageRemoteUrl]
  );
  useEffect(() => {
    onPremiumChangeRef.current?.(finalPremium ?? undefined);
  }, [finalPremium]);
  usePremiumContentEdited(supplemental, narratives, onEditedChange, draftCache);

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
              This show has no organization set. Set AKC, UKC or ASCA before generating a premium.
            </AlertDescription>
          </Alert>
        )}

        {/* MYK9-2213: first-time generation is held too, so say why here, not only beside Regenerate. */}
        {!original && !isLoading && showOrg && regenerateBlockedReason && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{regenerateBlockedReason}</AlertDescription>
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
            <p className="text-sm">Building from the show details...</p>
          </div>
        )}

        {(error || generationError) && (
          <Alert variant="destructive">
            <AlertDescription>{error ?? generationError}</AlertDescription>
          </Alert>
        )}

        {original && supplemental && narratives && (
          <>
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
              narrativeRefresh={{
                built: original.builtNarratives,
                regenerateBlockedReason,
                unsavedShowInputs,
              }}
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
                    showId={showId}
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

              <div className="space-y-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full"
                  disabled={isGenerating || Boolean(regenerateBlockedReason)}
                  onClick={() => void handleGenerate()}
                >
                  Regenerate
                </Button>
                {regenerateBlockedReason && (
                  <p className="text-xs text-muted-foreground">{regenerateBlockedReason}</p>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {previewOpen && (
        <PremiumPdfPreviewOverlay
          title={original?.show.name ?? 'Premium Preview'}
          pdfUrl={pdfUrl}
          onClose={() => setPreviewOpen(false)}
        />
      )}
    </>
  );
}
