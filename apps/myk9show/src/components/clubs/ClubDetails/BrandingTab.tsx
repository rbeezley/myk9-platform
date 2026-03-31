import { useState, useMemo, useEffect } from 'react';
import { Camera, Palette, Image as ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AccentColorPicker } from '@/components/ui/accent-color-picker';
import { CoverImageUpload } from '@/components/ui/cover-image-upload';
import { ShowCardVertical } from '@/components/shows/ShowCardVertical';
import { generatePalette } from '@/lib/branding';
import type { Club } from '@/types/club-types';
import type { Show } from '@/types/show-types';

/** Build a minimal Show object for the branding preview card */
function buildPreviewShow(club: Club, draftColor: string | null): Show {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const fmt = (d: Date) => d.toISOString().split('T')[0];

  return {
    id: 'preview',
    name: `${club.name} Spring Trial`,
    organization: 'AKC',
    startDate: fmt(today),
    endDate: fmt(tomorrow),
    location: 'City, State',
    status: 'upcoming',
    events: ['Agility'],
    source: 'myK9Show',
    entryOpenDate: fmt(today),
    entryCloseDate: fmt(tomorrow),
    preEntryFee: '30',
    clubId: club.id || '',
    clubName: club.name,
    clubAddress: '',
    clubEmail: '',
    logoUrl: club.logo || '',
    coverImageUrl: club.coverImage || '',
    accentColor: draftColor || '',
    assignedJudges: [],
    stats: [],
    trials: [],
  };
}

interface BrandingTabProps {
  club: Club;
  onSaveAccentColor: (color: string | null) => void;
  onEditPhoto: () => void;
  onCoverUpload: (file: File) => void;
  onCoverRemove: () => void;
  isUploadingCover: boolean;
}

export function BrandingTab({
  club,
  onSaveAccentColor,
  onEditPhoto,
  onCoverUpload,
  onCoverRemove,
  isUploadingCover,
}: BrandingTabProps) {
  const [draftColor, setDraftColor] = useState<string | null>(club.accentColor || null);

  // Sync draft when club prop updates (e.g. after save or external change)
  const savedColor = club.accentColor || null;
  useEffect(() => {
    setDraftColor(savedColor);
  }, [savedColor]);

  const isDirty = draftColor !== savedColor;

  const handleSave = () => {
    onSaveAccentColor(draftColor);
  };
  const handleDiscard = () => {
    setDraftColor(savedColor);
  };

  const previewPalette = useMemo(
    () => (draftColor ? generatePalette(draftColor) : null),
    [draftColor]
  );

  return (
    <div className="space-y-8">
      {/* Accent Color */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <Palette className="h-5 w-5 text-muted-foreground" />
          <h3 className="text-lg font-semibold text-foreground">Brand Color</h3>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Choose a color that represents your club. It appears on show cards, detail pages, and
          shared links.
        </p>
        <AccentColorPicker value={draftColor} onChange={setDraftColor} />
        {isDirty && (
          <div className="flex gap-3 mt-4">
            <Button onClick={handleSave}>Save</Button>
            <Button variant="outline" onClick={handleDiscard}>
              Discard
            </Button>
          </div>
        )}
      </section>

      {/* Logo */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <Camera className="h-5 w-5 text-muted-foreground" />
          <h3 className="text-lg font-semibold text-foreground">Club Logo</h3>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Your logo appears on show cards and detail pages. Click to change.
        </p>
        <div
          className="inline-block cursor-pointer hover:opacity-80 transition-opacity"
          onClick={onEditPhoto}
        >
          {club.logo ? (
            <img
              src={club.logo}
              alt={club.name}
              className="w-20 h-20 rounded-xl border-2 border-border object-cover"
            />
          ) : (
            <div
              className="w-20 h-20 rounded-xl border-2 border-dashed border-border flex items-center justify-center text-muted-foreground hover:border-primary/50 transition-colors"
              style={{ backgroundColor: previewPalette?.primaryDark ?? '#1e293b' }}
            >
              <Camera className="h-6 w-6" />
            </div>
          )}
        </div>
      </section>

      {/* Cover Image */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <ImageIcon className="h-5 w-5 text-muted-foreground" />
          <h3 className="text-lg font-semibold text-foreground">Cover Image</h3>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          A banner image that appears at the top of your club&apos;s profile.
        </p>
        <CoverImageUpload
          editable
          hasCover={Boolean(club.coverImage)}
          isUploading={isUploadingCover}
          onUpload={onCoverUpload}
          onRemove={onCoverRemove}
        >
          <div className="h-32 w-full max-w-md rounded-lg overflow-hidden border border-border">
            {club.coverImage ? (
              <img src={club.coverImage} alt="Cover" className="h-full w-full object-cover" />
            ) : (
              <div
                className="h-full w-full"
                style={{
                  background: previewPalette
                    ? `linear-gradient(135deg, ${previewPalette.primaryDark}, ${previewPalette.primary}, ${previewPalette.primaryLight})`
                    : 'linear-gradient(135deg, #1e293b, #334155, #475569)',
                }}
              />
            )}
          </div>
        </CoverImageUpload>
      </section>

      {/* Live Preview */}
      <section>
        <h3 className="text-lg font-semibold text-foreground mb-4">Preview</h3>
        <p className="text-sm text-muted-foreground mb-4">
          How your club&apos;s shows will appear on browse pages:
        </p>
        <div className="max-w-[340px]">
          <ShowCardVertical show={buildPreviewShow(club, draftColor)} />
        </div>
      </section>
    </div>
  );
}
