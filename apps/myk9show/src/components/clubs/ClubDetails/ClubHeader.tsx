import React, { useMemo, useState } from 'react';
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
  ShieldCheck,
  ShieldOff,
  ShieldAlert,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { CoverImageUpload } from '@/components/ui/cover-image-upload';
import { Club } from '@/types/club-types';
import { generatePalette } from '@/lib/branding';
import { getClubInitials } from './utils';
import { normalizeContactDestinations } from './contactDestinations';
import { CLUB_UNAUTHORIZED_MESSAGE } from '@/features/payments/onlineEntryGate';

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
  // MYK9-572: site-admin-only authorize/revoke control. canAuthorizeClub
  // gates the affordance (mirrors set_club_authorization's own
  // is_site_admin() check); isClubAuthorized is undefined while loading.
  canAuthorizeClub?: boolean;
  isClubAuthorized?: boolean | undefined;
  isAuthorizationLoading?: boolean;
  isAuthorizationUpdating?: boolean;
  onAuthorizeClub?: () => void;
  onRevokeAuthorization?: () => void;
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
  canAuthorizeClub = false,
  isClubAuthorized,
  isAuthorizationLoading = false,
  isAuthorizationUpdating = false,
  onAuthorizeClub,
  onRevokeAuthorization,
}) => {
  const handleAuthorizeClub = onAuthorizeClub ?? (() => {});
  const handleRevokeAuthorization = onRevokeAuthorization ?? (() => {});
  // P3-C: revoking has no confirm today (unlike Delete Club, right below it
  // in this same menu) even though it immediately blocks the club from
  // publishing any NEW show — cheap to fat-finger from a dropdown item.
  const [showRevokeConfirm, setShowRevokeConfirm] = useState(false);
  const palette = useMemo(
    () => (club.accentColor ? generatePalette(club.accentColor) : null),
    [club.accentColor]
  );
  const contact = useMemo(() => normalizeContactDestinations(club), [club]);
  const hasMenuActions =
    canEditBranding ||
    canDeleteClub ||
    canAuthorizeClub ||
    !!contact.email ||
    !!contact.phone ||
    !!contact.website;
  // P3-3: the separator before the Authorize/Revoke item should only render
  // when something actually precedes it in the menu — otherwise a club with
  // ONLY the authorize affordance (no branding edit, no contact info) shows
  // a leading divider with nothing above it.
  const hasItemsAboveAuthorize =
    canEditBranding || !!contact.email || !!contact.phone || !!contact.website;

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
        {hasMenuActions && (
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
              {contact.email && (
                <DropdownMenuItem onClick={() => window.open(contact.email!, '_self')}>
                  <Mail className="mr-2 h-4 w-4" />
                  Email Club
                </DropdownMenuItem>
              )}
              {contact.phone && (
                <DropdownMenuItem onClick={() => window.open(contact.phone!, '_self')}>
                  <Phone className="mr-2 h-4 w-4" />
                  Call Club
                </DropdownMenuItem>
              )}
              {contact.website && (
                <DropdownMenuItem
                  onClick={() => window.open(contact.website!, '_blank', 'noopener,noreferrer')}
                >
                  <Globe className="mr-2 h-4 w-4" />
                  Visit Website
                </DropdownMenuItem>
              )}
              {canAuthorizeClub && !isAuthorizationLoading && (
                <>
                  {hasItemsAboveAuthorize && <DropdownMenuSeparator />}
                  {isClubAuthorized ? (
                    <DropdownMenuItem
                      onClick={() => setShowRevokeConfirm(true)}
                      disabled={isAuthorizationUpdating}
                    >
                      <ShieldOff className="mr-2 h-4 w-4" />
                      Revoke Authorization
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem
                      onClick={handleAuthorizeClub}
                      disabled={isAuthorizationUpdating}
                    >
                      <ShieldCheck className="mr-2 h-4 w-4" />
                      Authorize Club
                    </DropdownMenuItem>
                  )}
                </>
              )}
              {canDeleteClub && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={onDeleteClub} className="text-destructive">
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete Club
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
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
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <h1 className="text-3xl font-bold text-foreground min-w-0">{club.name}</h1>
              {/* P2-B: visible to ANY viewer who can see this club at all
                  (clubs_select already scopes that) — a club's own
                  admin/secretary needs to know WHY publish is blocked just
                  as much as a site admin does. Only the Authorize/Revoke
                  MENU items above stay site-admin-only. */}
              {isClubAuthorized === false && (
                <span
                  data-testid="club-unauthorized-badge"
                  title={CLUB_UNAUTHORIZED_MESSAGE}
                  className="inline-flex shrink-0 items-center gap-1 rounded-full bg-warning/10 border border-warning/30 px-2.5 py-0.5 text-xs font-medium text-warning"
                >
                  <ShieldAlert className="h-3 w-3" />
                  Unauthorized
                </span>
              )}
            </div>
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
            {(contact.email || contact.phone) && (
              <div className="flex gap-2 mt-4">
                {contact.email && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 px-3"
                    onClick={() => window.open(contact.email!, '_self')}
                    title={`Email: ${club.email}`}
                  >
                    <Mail className="w-4 h-4 mr-2" />
                    Email
                  </Button>
                )}
                {contact.phone && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 px-3"
                    onClick={() => window.open(contact.phone!, '_self')}
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

      <AlertDialog open={showRevokeConfirm} onOpenChange={setShowRevokeConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke this club&apos;s authorization?</AlertDialogTitle>
            <AlertDialogDescription>
              Hide {club.name} from the public club directory. Its published shows stay published;
              new shows cannot be published until it is authorized again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                handleRevokeAuthorization();
                setShowRevokeConfirm(false);
              }}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            >
              Revoke Authorization
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
