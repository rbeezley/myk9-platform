import { useState } from 'react';
import { PDFDownloadLink } from '@react-pdf/renderer';
import { Download, AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { AKCPremiumTemplate } from './pdf/AKCPremiumTemplate';
import { UKCPremiumTemplate } from './pdf/UKCPremiumTemplate';
import { useGeneratePremium } from './useGeneratePremium';
import { useLogPremiumGeneration } from '../../hooks/queries/usePremiumGenerations';
import { computePremiumDiff } from './logPremiumGeneration';
import type { GeneratedPremium, PremiumStyle } from '../../types/premium-types';

interface Props {
  open: boolean;
  onClose: () => void;
  showId: string;
  clubId: string;
  showOrg: 'AKC' | 'UKC' | null;
}

const STYLES: PremiumStyle[] = ['classic', 'modern', 'minimal'];

export function GeneratePremiumPanel({ open, onClose, showId, clubId, showOrg }: Props) {
  const { generate, isLoading, error } = useGeneratePremium();
  const logMutation = useLogPremiumGeneration(clubId);

  // Original generated values (for diff computation)
  const [original, setOriginal] = useState<GeneratedPremium | null>(null);
  // Editable copies
  const [supplemental, setSupplemental] = useState<GeneratedPremium['supplemental'] | null>(null);
  const [narratives, setNarratives] = useState<{
    showHours: string;
    trialInformation: string;
  } | null>(null);
  const [styleOverride, setStyleOverride] = useState<PremiumStyle | null>(null);
  const [hasNarrativeError, setHasNarrativeError] = useState(false);

  async function handleGenerate() {
    const result = await generate(showId);
    setOriginal(result);
    setSupplemental(result.supplemental);
    setNarratives(result.narratives);
    setStyleOverride(null);
    setHasNarrativeError(result.narratives.showHours.startsWith('['));
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
      // Non-blocking — PDF already downloaded; losing the log is preferable to blocking download
      console.error('[premium-bridge] Failed to log premium generation');
    }
  }

  const finalPremium = original ? buildFinalPremium() : null;
  const PdfTemplate = finalPremium?.org === 'UKC' ? UKCPremiumTemplate : AKCPremiumTemplate;
  const activeStyle = styleOverride ?? original?.style ?? 'classic';

  function handleClose() {
    // Reset state on close so next open starts fresh
    setOriginal(null);
    setSupplemental(null);
    setNarratives(null);
    setStyleOverride(null);
    setHasNarrativeError(false);
    onClose();
  }

  return (
    <Sheet
      open={open}
      onOpenChange={o => {
        if (!o) handleClose();
      }}
    >
      <SheetContent className="w-[500px] sm:max-w-[500px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Generate Premium</SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          {/* Initial generate button */}
          {!original && !isLoading && (
            <>
              {!showOrg && (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    This show has no organization set. Set AKC or UKC before generating a premium.
                  </AlertDescription>
                </Alert>
              )}
              <Button
                onClick={() => {
                  void handleGenerate();
                }}
                disabled={!showOrg}
                className="w-full"
              >
                Generate from Show Data
              </Button>
            </>
          )}

          {/* Loading state */}
          {isLoading && (
            <div className="flex flex-col items-center gap-3 py-8 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
              <p className="text-sm">Generating narratives… (~5–10 seconds)</p>
            </div>
          )}

          {/* Error */}
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Generated content */}
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

              {/* Style picker */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Style</Label>
                <div className="flex gap-2">
                  {STYLES.map(s => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setStyleOverride(s)}
                      className={`flex-1 py-1.5 text-xs rounded border capitalize transition-colors ${
                        activeStyle === s
                          ? 'border-primary bg-primary/10 text-primary font-medium'
                          : 'border-border text-muted-foreground hover:border-primary/50'
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
                {styleOverride && styleOverride !== original.style && (
                  <p className="text-xs text-muted-foreground">
                    Template default: {original.style}. Override applies to this premium only.
                  </p>
                )}
              </div>

              {/* Supplemental overrides */}
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
              </div>

              {/* Narrative editing */}
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

              {/* Download button */}
              <PDFDownloadLink
                document={<PdfTemplate premium={finalPremium!} />}
                fileName={`${original.show.name.replace(/\s+/g, '-')}-premium.pdf`}
                onClick={() => {
                  void handleDownloaded();
                }}
              >
                {({ loading, error: pdfError }) => {
                  if (pdfError)
                    return (
                      <Button className="w-full" variant="destructive" disabled>
                        PDF generation failed — check console
                      </Button>
                    );
                  return (
                    <Button className="w-full" disabled={loading}>
                      <Download className="h-4 w-4 mr-2" />
                      {loading ? 'Preparing PDF…' : 'Download Premium PDF'}
                    </Button>
                  );
                }}
              </PDFDownloadLink>

              {/* Regenerate option */}
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
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
