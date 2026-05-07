import { useCallback, useEffect, useRef, useState } from 'react';
import { PDFDownloadLink } from '@react-pdf/renderer';
import { Download, AlertTriangle, Loader2, Globe, Check, Eye } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { publishPremium } from './publishPremium';
import { notifications } from '@/lib/notifications';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Checkbox } from '@/components/ui/checkbox';

import { AKCPremiumTemplate } from './pdf/AKCPremiumTemplate';
import { UKCPremiumTemplate } from './pdf/UKCPremiumTemplate';
import { useGeneratePremium } from './useGeneratePremium';
import { useLogPremiumGeneration } from '../../hooks/queries/usePremiumGenerations';
import { computePremiumDiff } from './logPremiumGeneration';
import { STYLE_ORG_SUPPORT } from './pdf/pdfStyles';
import { isStyleEnabled } from './premiumFeatureFlags';
import type { GeneratedPremium, PremiumStyle } from '../../types/premium-types';

interface Props {
  open: boolean;
  onClose: () => void;
  showId: string;
  clubId: string;
  showOrg: 'AKC' | 'UKC' | null;
}

/**
 * Watches the PDFDownloadLink render-prop's `error` value and forwards each
 * distinct error to `onError` exactly once. Lives as a child component so the
 * effect runs outside the render-prop body — calling notifications inline
 * fires repeatedly because PDFDownloadLink re-invokes its render prop on
 * every internal state tick.
 */
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

// Captures the PDF blob URL from the PDFDownloadLink render-prop, forwarding
// each distinct URL to onUrl once. Same "child component effect" pattern as
// DownloadLinkErrorWatcher above — calling setState inline in a render prop
// causes repeated firings.
function DownloadLinkUrlCapture({
  url,
  onUrl,
}: {
  url: string | null;
  onUrl: (url: string) => void;
}) {
  useEffect(() => {
    if (url) onUrl(url);
  }, [url, onUrl]);
  return null;
}

interface StyleOption {
  key: PremiumStyle;
  name: string;
  tagline: string;
}

const STYLE_OPTIONS: StyleOption[] = [
  {
    key: 'monogram',
    name: 'Monogram',
    tagline: 'Centered TC monogram, large serif title — conservative classic.',
  },
  {
    key: 'banner',
    name: 'Banner',
    tagline: 'Black bar across top, left-aligned title — clean and direct.',
  },
  {
    key: 'headline',
    name: 'Headline',
    tagline: 'Stacked header with double-rule divider — quietly bold.',
  },
  {
    key: 'magazine',
    name: 'Magazine',
    tagline: 'Editorial spread — display serif cover, pull quotes inside.',
  },
  {
    key: 'poster',
    name: 'Poster',
    tagline: 'Bold single-page hero — tight uppercase, ink-blot accents.',
  },
  {
    key: 'gazette',
    name: 'Gazette',
    tagline: 'Newspaper broadsheet — masthead, multi-column body.',
  },
  {
    key: 'fieldGuide',
    name: 'Field Guide',
    tagline: 'Utility reference — §-numbered sections, dense data tables.',
  },
  {
    key: 'heritage',
    name: 'Heritage',
    tagline: 'Traditional kennel club — ivory paper, ornamental rules.',
  },
];

export function GeneratePremiumPanel({ open, onClose, showId, clubId, showOrg }: Props) {
  const { generate, isLoading, error, reset } = useGeneratePremium();
  const logMutation = useLogPremiumGeneration(clubId);
  const queryClient = useQueryClient();
  const [publishing, setPublishing] = useState(false);
  const [publishedAt, setPublishedAt] = useState<string | null>(null);

  const [original, setOriginal] = useState<GeneratedPremium | null>(null);
  const [supplemental, setSupplemental] = useState<GeneratedPremium['supplemental'] | null>(null);
  const [narratives, setNarratives] = useState<{
    showHours: string;
    trialInformation: string;
  } | null>(null);
  const [styleOverride, setStyleOverride] = useState<PremiumStyle | null>(null);
  const [hasNarrativeError, setHasNarrativeError] = useState(false);
  const [inkSaver, setInkSaver] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  // INTENT: Toast at most once per distinct PDF render error message. The
  // PDFDownloadLink render-prop re-fires on every internal state tick, so the
  // toast must live outside that body (see DownloadLinkErrorWatcher below).
  const lastPdfErrorMessageRef = useRef<string | null>(null);
  const handlePdfError = useCallback((err: Error) => {
    if (lastPdfErrorMessageRef.current === err.message) return;
    lastPdfErrorMessageRef.current = err.message;
    notifications.error(
      'This style failed to render — please try a different one or report the issue.'
    );
  }, []);

  // Auto-generate when the panel opens (org must be set first).
  // This removes the need for a second "Generate from Show Data" click.
  useEffect(() => {
    if (open && showOrg && !original && !isLoading) {
      void handleGenerate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function handleGenerate() {
    lastPdfErrorMessageRef.current = null;
    const result = await generate(showId);
    setOriginal(result);
    setSupplemental(result.supplemental);
    setNarratives(result.narratives);
    setStyleOverride(null);
    setHasNarrativeError(
      result.narratives.showHours === 'Show hours to be announced.' ||
        result.narratives.trialInformation === 'Trial information to be announced.'
    );
  }

  function buildFinalPremium(): GeneratedPremium {
    if (!original || !supplemental || !narratives) return original!;
    return {
      ...original,
      style: styleOverride ?? original.style,
      supplemental,
      narratives,
    };
  }

  async function handlePublish() {
    const finalPremium = buildFinalPremium();
    if (!finalPremium) return;
    setPublishing(true);
    try {
      const { publishedAt: at } = await publishPremium(showId, finalPremium, { inkSaver });
      setPublishedAt(at);
      await queryClient.invalidateQueries({ queryKey: ['shows', showId] });
      notifications.success('Premium published — exhibitors can now download it.');
    } catch (err) {
      notifications.error(
        `This style failed to render — please try a different one or report the issue. (${err instanceof Error ? err.message : String(err)})`
      );
    } finally {
      setPublishing(false);
    }
  }

  async function handleDownloaded() {
    if (!original || !supplemental || !narratives) return;
    const activeStyle = styleOverride ?? original.style;
    const diff = computePremiumDiff(original, supplemental, narratives, activeStyle);
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

  const finalPremium = original ? buildFinalPremium() : null;
  const PdfTemplate = finalPremium?.org === 'UKC' ? UKCPremiumTemplate : AKCPremiumTemplate;
  const activeStyle = styleOverride ?? original?.style ?? 'monogram';

  function handleClose() {
    reset();
    setOriginal(null);
    setSupplemental(null);
    setNarratives(null);
    setStyleOverride(null);
    setHasNarrativeError(false);
    setInkSaver(false);
    onClose();
  }

  const visibleStyles = STYLE_OPTIONS.filter(opt => {
    if (!isStyleEnabled(opt.key)) return false;
    const orgKey = original?.org ?? showOrg;
    if (!orgKey) return true;
    return STYLE_ORG_SUPPORT[opt.key].includes(orgKey);
  });

  return (
    <>
      <Sheet
        open={open}
        onOpenChange={o => {
          if (!o) handleClose();
        }}
      >
        <SheetContent className="w-[500px] sm:max-w-[500px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Premium List</SheetTitle>
          </SheetHeader>

          <div className="mt-6 space-y-4">
            {!original && !isLoading && !showOrg && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  This show has no organization set. Set AKC or UKC before generating a premium.
                </AlertDescription>
              </Alert>
            )}

            {isLoading && (
              <div className="flex flex-col items-center gap-3 py-8 text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin" />
                <p className="text-sm">Generating narratives… (~5–10 seconds)</p>
              </div>
            )}

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {original && supplemental && narratives && (
              <>
                {hasNarrativeError && (
                  <Alert>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      Couldn&apos;t generate narrative sections — edit the fields below before
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

                <div className="space-y-2">
                  <Label className="text-sm font-medium">Style</Label>
                  <div
                    role="radiogroup"
                    aria-label="Premium style"
                    className="grid grid-cols-2 gap-2"
                  >
                    {visibleStyles.map(opt => {
                      const selected = activeStyle === opt.key;
                      return (
                        <button
                          key={opt.key}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          onClick={() => setStyleOverride(opt.key)}
                          className={`text-left p-3 rounded-md border transition-colors ${
                            selected
                              ? 'border-primary bg-primary/10'
                              : 'border-border hover:border-primary/50'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-sm font-medium ${selected ? 'text-primary' : ''}`}
                            >
                              {opt.name}
                            </span>
                            {selected && <Check className="h-3.5 w-3.5 text-primary" />}
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground leading-snug">
                            {opt.tagline}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                  {styleOverride && styleOverride !== original.style && (
                    <p className="text-xs text-muted-foreground">
                      Template default: {original.style}. Override applies to this premium only.
                    </p>
                  )}
                </div>

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
                      onChange={e =>
                        setNarratives(n => ({ ...n!, trialInformation: e.target.value }))
                      }
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

                <div className="mt-4 flex flex-col gap-2">
                  <PDFDownloadLink
                    document={<PdfTemplate premium={finalPremium!} inkSaver={inkSaver} />}
                    fileName={`${original.show.name.replace(/\s+/g, '-')}-premium.pdf`}
                    onClick={() => {
                      void handleDownloaded();
                    }}
                  >
                    {({ loading, error: pdfError, url }) => (
                      <>
                        <DownloadLinkErrorWatcher
                          error={pdfError ?? null}
                          onError={handlePdfError}
                        />
                        <DownloadLinkUrlCapture url={url ?? null} onUrl={setPdfUrl} />
                        {pdfError ? (
                          <Button className="w-full" variant="destructive" disabled>
                            PDF generation failed — try another style
                          </Button>
                        ) : (
                          <>
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
                              {loading ? 'Preparing PDF…' : 'Preview PDF'}
                            </Button>
                            <Button className="w-full" disabled={loading}>
                              <Download className="h-4 w-4 mr-2" />
                              Download PDF
                            </Button>
                          </>
                        )}
                      </>
                    )}
                  </PDFDownloadLink>

                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                      void handlePublish();
                    }}
                    disabled={publishing}
                  >
                    {publishing ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : publishedAt ? (
                      <Check className="h-4 w-4 mr-2" />
                    ) : (
                      <Globe className="h-4 w-4 mr-2" />
                    )}
                    {publishing
                      ? 'Publishing…'
                      : publishedAt
                        ? 'Published — Re-publish'
                        : 'Publish for Exhibitors'}
                  </Button>
                  <p className="text-xs text-muted-foreground -mt-1">
                    Publishing uploads this PDF to a public link on the show page so exhibitors can
                    download it. The link is stable across re-publishes.
                  </p>

                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full"
                    onClick={() => {
                      setOriginal(null);
                      setSupplemental(null);
                      setNarratives(null);
                      setStyleOverride(null);
                    }}
                  >
                    ↺ Regenerate
                  </Button>
                </div>
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Plain overlay — avoids Radix Dialog focus-trap closing the parent Sheet */}
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
                ✕
              </button>
            </div>
            {pdfUrl && <iframe src={pdfUrl} className="flex-1 border-0" title="PDF Preview" />}
          </div>
        </div>
      )}
    </>
  );
}
