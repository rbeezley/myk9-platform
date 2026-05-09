import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PDFDownloadLink } from '@react-pdf/renderer';
import { AlertTriangle, Download, Eye, Loader2 } from 'lucide-react';
import { notifications } from '@/lib/notifications';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { AKCPremiumTemplate } from './pdf/AKCPremiumTemplate';
import { UKCPremiumTemplate } from './pdf/UKCPremiumTemplate';
import { useGeneratePremium } from './useGeneratePremium';
import { useLogPremiumGeneration } from '../../hooks/queries/usePremiumGenerations';
import { computePremiumDiff } from './logPremiumGeneration';
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

function withGenerationTimeout<T>(promise: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      reject(
        new Error(
          'We could not finish generating this content. Please try again in a moment.'
        )
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
}: PremiumContentEditorProps) {
  const { generate, isLoading, error, reset } = useGeneratePremium();
  const logMutation = useLogPremiumGeneration(clubId);
  const [original, setOriginal] = useState<GeneratedPremium | null>(() => initialPremium ?? null);
  const [supplemental, setSupplemental] = useState<GeneratedPremium['supplemental'] | null>(
    () => initialPremium?.supplemental ?? null
  );
  const [narratives, setNarratives] = useState<GeneratedPremium['narratives'] | null>(
    () => initialPremium?.narratives ?? null
  );
  const [hasNarrativeError, setHasNarrativeError] = useState(false);
  const [inkSaver, setInkSaver] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [autoGenerateAttemptedFor, setAutoGenerateAttemptedFor] = useState<string | null>(null);
  const onPremiumChangeRef = useRef(onPremiumChange);
  const onInkSaverChangeRef = useRef(onInkSaverChange);

  useEffect(() => {
    onPremiumChangeRef.current = onPremiumChange;
  }, [onPremiumChange]);

  useEffect(() => {
    onInkSaverChangeRef.current = onInkSaverChange;
  }, [onInkSaverChange]);

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
    try {
      const result = await withGenerationTimeout(generate(showId));
      setOriginal(result);
      setSupplemental(result.supplemental);
      setNarratives(result.narratives);
      setHasNarrativeError(
        result.narratives.showHours === 'Show hours to be announced.' ||
          result.narratives.trialInformation === 'Trial information to be announced.'
      );
    } catch (err) {
      setGenerationError(err instanceof Error ? err.message : 'We could not generate that content.');
    } finally {
      setIsGenerating(false);
    }
  }, [generate, showId]);

  useEffect(() => {
    if (!active || original || !initialPremium) return;
    setOriginal(initialPremium);
    setSupplemental(initialPremium.supplemental);
    setNarratives(initialPremium.narratives);
    setGenerationError(null);
    setIsGenerating(false);
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
    reset();
    setOriginal(null);
    setSupplemental(null);
    setNarratives(null);
    setHasNarrativeError(false);
    setInkSaver(false);
    setPdfUrl(null);
    setPreviewOpen(false);
    setGenerationError(null);
    setIsGenerating(false);
    setAutoGenerateAttemptedFor(null);
    onPremiumChangeRef.current?.(undefined);
    onInkSaverChangeRef.current?.(false);
  }, [active, reset]);

  function buildFinalPremium(): GeneratedPremium | null {
    if (!original || !supplemental || !narratives) return null;
    return {
      ...original,
      style: style ?? original.style,
      supplemental,
      narratives,
    };
  }

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

  const pdfDocument = useMemo(() => {
    if (!finalPremium) return null;
    const Template = finalPremium.org === 'UKC' ? UKCPremiumTemplate : AKCPremiumTemplate;
    return <Template premium={finalPremium} inkSaver={inkSaver} />;
  }, [finalPremium, inkSaver]);

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
          <div className="flex flex-col items-center gap-3 py-8 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
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
                <AlertDescription>
                  Couldn&apos;t generate narrative sections - edit the fields below before
                  downloading.
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

            <div className="space-y-3">
              <Label className="text-sm font-medium">Supplemental Fields</Label>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Vet Clinic Name</Label>
                <Input
                  value={supplemental.vetClinic?.name ?? ''}
                  onChange={e =>
                    setSupplemental(s => ({
                      ...s!,
                      vetClinic: {
                        ...(s!.vetClinic ?? { address: '', phone: '' }),
                        name: e.target.value,
                      },
                    }))
                  }
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Address</Label>
                  <Input
                    value={supplemental.vetClinic?.address ?? ''}
                    onChange={e =>
                      setSupplemental(s => ({
                        ...s!,
                        vetClinic: {
                          ...(s!.vetClinic ?? { name: '', phone: '' }),
                          address: e.target.value,
                        },
                      }))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Phone</Label>
                  <Input
                    value={supplemental.vetClinic?.phone ?? ''}
                    onChange={e =>
                      setSupplemental(s => ({
                        ...s!,
                        vetClinic: {
                          ...(s!.vetClinic ?? { name: '', address: '' }),
                          phone: e.target.value,
                        },
                      }))
                    }
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Hospitality Notes</Label>
                <Textarea
                  rows={2}
                  value={supplemental.hospitalityNotes ?? ''}
                  onChange={e =>
                    setSupplemental(s => ({ ...s!, hospitalityNotes: e.target.value || null }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Awards Description</Label>
                <Textarea
                  rows={2}
                  value={supplemental.awardsDescription ?? ''}
                  onChange={e =>
                    setSupplemental(s => ({ ...s!, awardsDescription: e.target.value || null }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Additional Notes</Label>
                <Textarea
                  rows={2}
                  value={supplemental.additionalNotes ?? ''}
                  onChange={e =>
                    setSupplemental(s => ({ ...s!, additionalNotes: e.target.value || null }))
                  }
                />
              </div>
            </div>

            <div className="space-y-3">
              <Label className="text-sm font-medium">Generated Narratives (editable)</Label>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Show Hours</Label>
                <Textarea
                  rows={3}
                  value={narratives.showHours}
                  onChange={e => setNarratives(n => ({ ...n!, showHours: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Trial Information</Label>
                <Textarea
                  rows={4}
                  value={narratives.trialInformation}
                  onChange={e => setNarratives(n => ({ ...n!, trialInformation: e.target.value }))}
                />
              </div>
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                checked={inkSaver}
                onCheckedChange={checked => setInkSaver(Boolean(checked))}
              />
              <span className="text-sm">Print-friendly (saves ink)</span>
            </label>

            <div className="mt-4 flex flex-col gap-3">
              <PDFDownloadLink
                document={pdfDocument!}
                fileName={`${original.show.name.replace(/\s+/g, '-')}-premium.pdf`}
                className="block"
                onClick={() => {
                  void handleDownloaded();
                }}
              >
                {({ loading, error: pdfError, url }) => (
                  <>
                    <DownloadLinkErrorWatcher error={pdfError ?? null} onError={handlePdfError} />
                    <DownloadLinkUrlCapture url={url ?? null} loading={loading} onUrl={setPdfUrl} />
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
                            setPreviewOpen(true);
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

              <Button
                variant="ghost"
                size="sm"
                className="w-full"
                onClick={() => {
                  setOriginal(null);
                  setSupplemental(null);
                  setNarratives(null);
                  setPdfUrl(null);
                  void handleGenerate();
                }}
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
