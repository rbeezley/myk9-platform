import React, { useMemo } from 'react';
import {
  MapPin,
  Mail,
  Phone,
  Globe,
  Award,
  Shield,
  MoreVertical,
  Trash2,
  Camera,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { CoverImageUpload } from '@/components/ui/cover-image-upload';
import { Club } from '@/types/club-types';
import { generatePalette } from '@/lib/branding';
import { getClubInitials } from './utils';

interface ClubHeaderProps {
  club: Club;
  onEditClub: () => void;
  onEditPhoto: () => void;
  onDeleteClub: () => void;
  // Cover image upload props (optional — wired in Task 12)
  onCoverUpload?: (file: File) => void;
  onCoverRemove?: () => void;
  isUploadingCover?: boolean;
  canEditClub?: boolean;
  canEditBranding?: boolean;
  canDeleteClub?: boolean;
}

export const ClubHeader: React.FC<ClubHeaderProps> = ({
  club,
  onEditClub,
  onEditPhoto,
  onDeleteClub,
  onCoverUpload,
  onCoverRemove,
  isUploadingCover = false,
  canEditClub = false,
  canEditBranding = false,
  canDeleteClub = false,
}) => {
  const palette = useMemo(
    () => (club.accentColor ? generatePalette(club.accentColor) : null),
    [club.accentColor]
  );

  const foundedYear = club.founded
    ? club.founded instanceof Date
      ? club.founded.getFullYear()
      : new Date(club.founded).getFullYear()
    : null;

  // Gradient fallback when no cover image — uses org-inspired dark gradient
  const gradientFallback = palette
    ? `linear-gradient(135deg, ${palette.primaryDark} 0%, ${palette.primary} 60%, ${palette.primaryLight} 100%)`
    : 'linear-gradient(135deg, #1e293b 0%, #334155 60%, #475569 100%)';

  // Provide safe no-op handlers so CoverImageUpload never receives undefined
  const handleUpload = onCoverUpload ?? (() => {});
  const handleRemove = onCoverRemove ?? (() => {});

  return (
    <div className="mb-10 bg-card border border-border rounded-2xl relative overflow-hidden">
      {/* Actions positioned absolutely in top-right corner (above cover) */}
      <div className="absolute top-4 right-4 z-20 flex items-center gap-1">
        {canEditClub && (
          <Button
            variant="ghost"
            size="sm"
            className="bg-black/30 hover:bg-black/50 text-white"
            onClick={onEditClub}
          >
            Edit
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild nativeButton>
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 p-0 bg-black/30 hover:bg-black/50 text-white"
              aria-label="Club options"
            >
              <MoreVertical className="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {canEditBranding && (
              <>
                <DropdownMenuItem onClick={onEditPhoto}>
                  <Camera className="mr-2 h-4 w-4" />
                  Change Photo
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}
            <DropdownMenuItem onClick={() => window.open(`mailto:${club.email}`, '_self')}>
              <Mail className="mr-2 h-4 w-4" />
              Email Club
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => window.open(`tel:${club.phone}`, '_self')}>
              <Phone className="mr-2 h-4 w-4" />
              Call Club
            </DropdownMenuItem>
            {club.website && (
              <DropdownMenuItem
                onClick={() =>
                  window.open(
                    club.website?.startsWith('http') ? club.website : `https://${club.website}`,
                    '_blank',
                    'noopener,noreferrer'
                  )
                }
              >
                <Globe className="mr-2 h-4 w-4" />
                Visit Website
              </DropdownMenuItem>
            )}
            {canDeleteClub && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onDeleteClub} className="text-red-600">
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete Club
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Accent color bar at very top */}
      {palette && (
        <div
          data-testid="accent-bar"
          className="absolute left-0 right-0 top-0 z-10 h-[3px]"
          style={{ backgroundColor: palette.primary }}
        />
      )}

      {/* Cover image / gradient banner (~140px) */}
      <CoverImageUpload
        editable={canEditBranding}
        hasCover={Boolean(club.coverImage)}
        isUploading={isUploadingCover}
        onUpload={handleUpload}
        onRemove={handleRemove}
      >
        <div className="relative h-[140px] overflow-hidden">
          {club.coverImage ? (
            <img
              src={club.coverImage}
              alt={`${club.name} cover`}
              className="h-full w-full object-cover"
            />
          ) : (
            <div
              data-testid="gradient-placeholder"
              className="h-full w-full"
              style={{ background: gradientFallback }}
            />
          )}
          {/* Dark gradient overlay for readability */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
        </div>
      </CoverImageUpload>

      {/* Info area with overlapping logo */}
      <div className="relative px-8 pb-8 pt-10">
        {/* Floating logo — overlaps cover/info boundary */}
        <div className="absolute -top-8 left-8">
          {club.logo ? (
            <img
              src={club.logo}
              alt={club.name}
              className={`w-16 h-16 rounded-xl border-[3px] border-card object-cover shadow-lg transition-opacity ${
                canEditBranding ? 'cursor-pointer hover:opacity-80' : ''
              }`}
              onClick={canEditBranding ? onEditPhoto : undefined}
              title={canEditBranding ? 'Click to edit club logo' : undefined}
            />
          ) : (
            <div
              className={`w-16 h-16 rounded-xl border-[3px] border-card shadow-lg flex items-center justify-center transition-opacity ${
                canEditBranding ? 'cursor-pointer hover:opacity-80' : ''
              }`}
              style={{ backgroundColor: palette?.primaryDark ?? '#1e293b' }}
              onClick={canEditBranding ? onEditPhoto : undefined}
              title={canEditBranding ? 'Click to add club logo' : undefined}
            >
              <span
                className="text-lg font-bold"
                style={{ color: palette?.onPrimary ?? '#94a3b8' }}
              >
                {getClubInitials(club.name)}
              </span>
            </div>
          )}
        </div>

        {/* Club details */}
        <div className="flex flex-col md:flex-row items-start gap-4">
          <div className="flex-1 text-left">
            {foundedYear && (
              <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-1">
                Founded {foundedYear}
              </p>
            )}
            <h1 className="text-3xl font-bold text-foreground mb-2">{club.name}</h1>
            {(club.address?.city || club.address?.state) && (
              <div className="flex items-center gap-2 text-muted-foreground mb-2">
                <MapPin className="w-4 h-4" />
                {[club.address?.city, club.address?.state].filter(Boolean).join(', ')}
              </div>
            )}
            {club.clubNumber && (
              <div className="flex items-center gap-2 text-muted-foreground mb-4">
                <Shield className="w-4 h-4" />
                Club #{club.clubNumber}
              </div>
            )}
            <div className="flex gap-2 flex-wrap">
              {club.clubType && (
                <div className="flex items-center gap-1 px-3 py-1 bg-primary/10 text-primary rounded-full text-xs font-medium">
                  <Award className="w-3 h-3" />
                  {club.clubType.charAt(0).toUpperCase() + club.clubType.slice(1)} Club
                </div>
              )}
              {foundedYear && (
                <div className="flex items-center gap-1 px-3 py-1 bg-secondary/10 text-secondary-foreground rounded-full text-xs font-medium">
                  <Shield className="w-3 h-3" />
                  Founded {foundedYear}
                </div>
              )}
            </div>
            {/* Quick contact actions */}
            {(club.email || club.phone) && (
              <div className="flex gap-2 mt-4">
                {club.email && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 px-3"
                    onClick={() => window.open(`mailto:${club.email}`, '_self')}
                    title={`Email: ${club.email}`}
                  >
                    <Mail className="w-4 h-4 mr-2" />
                    Email
                  </Button>
                )}
                {club.phone && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 px-3"
                    onClick={() => window.open(`tel:${club.phone}`, '_self')}
                    title={`Call: ${club.phone}`}
                  >
                    <Phone className="w-4 h-4 mr-2" />
                    Call
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
