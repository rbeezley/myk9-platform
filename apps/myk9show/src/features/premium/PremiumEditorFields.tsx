import { ImageIcon, Upload, X } from 'lucide-react';
import type { Dispatch, SetStateAction } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { GeneratedPremium } from '../../types/premium-types';

interface PremiumEditorFieldsProps {
  supplemental: GeneratedPremium['supplemental'];
  narratives: GeneratedPremium['narratives'];
  setSupplemental: Dispatch<SetStateAction<GeneratedPremium['supplemental'] | null>>;
  setNarratives: Dispatch<SetStateAction<GeneratedPremium['narratives'] | null>>;
  isUploadingCover: boolean;
  coverImageResolveFailed: boolean;
  /** True while a Regenerate is pending: the draft stays visible but cannot change. */
  readOnly: boolean;
  onCoverUpload: (file: File | null) => void;
  onCoverRemove: () => void;
}

/** The supplemental fields and narrative text areas of the premium editor. */
export function PremiumEditorFields({
  supplemental,
  narratives,
  setSupplemental: setSupplementalState,
  setNarratives: setNarrativesState,
  isUploadingCover,
  coverImageResolveFailed,
  readOnly,
  onCoverUpload,
  onCoverRemove,
}: PremiumEditorFieldsProps) {
  // A pending Regenerate owns the draft: nothing typed meanwhile may reach it.
  const setSupplemental: PremiumEditorFieldsProps['setSupplemental'] = update => {
    if (!readOnly) setSupplementalState(update);
  };
  const setNarratives: PremiumEditorFieldsProps['setNarratives'] = update => {
    if (!readOnly) setNarrativesState(update);
  };
  return (
    <>
      <div className="space-y-3">
        <Label className="text-sm font-medium">Supplemental Fields</Label>
        <div className="space-y-2 rounded-md border p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2">
              <ImageIcon className="mt-0.5 h-4 w-4 text-muted-foreground" />
              <div>
                <Label className="text-xs text-muted-foreground">Cover Image</Label>
                <p className="text-xs text-muted-foreground">
                  Used on Gazette and Magazine covers.
                </p>
              </div>
            </div>
            {supplemental.coverImageUrl && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={isUploadingCover || readOnly}
                onClick={() => onCoverRemove()}
              >
                <X className="mr-1 h-3.5 w-3.5" />
                Remove
              </Button>
            )}
          </div>
          {supplemental.coverImageUrl && (
            <img
              src={supplemental.coverImageUrl}
              alt="Premium cover"
              className="h-24 w-full rounded-md object-cover"
            />
          )}
          {supplemental.coverImageUrl && coverImageResolveFailed && (
            <p className="text-xs text-destructive">
              Saved cover image could not be loaded for the PDF. The cover will use the At a Glance
              panel until the image is replaced.
            </p>
          )}
          <Label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted">
            <Upload className="h-4 w-4" />
            {isUploadingCover ? 'Uploading...' : 'Upload cover image'}
            <Input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              disabled={isUploadingCover || readOnly}
              onChange={e => {
                const file = e.target.files?.[0] ?? null;
                onCoverUpload(file);
                e.target.value = '';
              }}
            />
          </Label>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Vet Clinic Name</Label>
          <Input
            readOnly={readOnly}
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
              readOnly={readOnly}
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
              readOnly={readOnly}
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
            readOnly={readOnly}
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
            readOnly={readOnly}
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
            readOnly={readOnly}
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
            readOnly={readOnly}
            rows={3}
            value={narratives.showHours}
            onChange={e => setNarratives(n => ({ ...n!, showHours: e.target.value }))}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Trial Information</Label>
          <Textarea
            readOnly={readOnly}
            rows={4}
            value={narratives.trialInformation}
            onChange={e => setNarratives(n => ({ ...n!, trialInformation: e.target.value }))}
          />
        </div>
      </div>
    </>
  );
}
