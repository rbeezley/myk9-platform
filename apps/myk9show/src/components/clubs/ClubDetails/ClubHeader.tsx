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
import { DetailHero, type HeroBadge } from '@/components/common/DetailHero';
import { Club } from '@/types/club-types';
import { generatePalette } from '@/lib/branding';
import { getClubInitials } from './utils';
import { normalizeContactDestinations } from './contactDestinations';
import { CLUB_UNAUTHORIZED_MESSAGE } from '@/features/payments/onlineEntryGate';
import { useClubOfficials } from './useClubOfficials';
import { ClubOfficialsLine } from './ClubOfficialsLine';

interface ClubHeaderProps {
  club: Club;
  onEditPhoto: () => void;
  onDeleteClub: () => void;
  // Cover image upload props (optional — wired in Task 12)
  onCoverUpload?: (file: File) => void;
  onCoverRemove?: () => void;
  isUploadingCover?: boolean;
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
  onEditPhoto,
  onDeleteClub,
  onCoverUpload,
  onCoverRemove,
  isUploadingCover = false,
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
  const {
    data: officials,
    isError: officialsError,
    refetch: refetchOfficials,
  } = useClubOfficials(club.id);
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

  // The options menu and the accent bar sit over the cover banner, inside the
  // hero card (DetailHero's `banner` slot).
  const banner = (
    <div className="relative">
      {/* Edit club is the first item of the header Actions menu (MYK9-928), not a button here. */}
      <div className="absolute top-4 right-4 z-20 flex items-center gap-1">
        {hasMenuActions && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild nativeButton>
              <Button
                variant="ghost"
                size="icon"
                className="h-11 w-11 p-0 bg-black/30 hover:bg-black/50 text-white"
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
    </div>
  );

  const logo = club.logo ? (
    <img
      src={club.logo}
      alt={club.name}
      className={`w-16 h-16 rounded-xl object-cover shadow-sm transition-opacity ${
        canEditBranding ? 'cursor-pointer hover:opacity-80' : ''
      }`}
      onClick={canEditBranding ? onEditPhoto : undefined}
      title={canEditBranding ? 'Click to edit club logo' : undefined}
    />
  ) : (
    <div
      className={`w-16 h-16 rounded-xl shadow-sm flex items-center justify-center transition-opacity ${
        canEditBranding ? 'cursor-pointer hover:opacity-80' : ''
      }`}
      style={{ backgroundColor: palette?.primaryDark ?? '#1e293b' }}
      onClick={canEditBranding ? onEditPhoto : undefined}
      title={canEditBranding ? 'Click to add club logo' : undefined}
    >
      <span className="text-lg font-bold" style={{ color: palette?.onPrimary ?? '#94a3b8' }}>
        {getClubInitials(club.name)}
      </span>
    </div>
  );

  const location = [club.address?.city, club.address?.state].filter(Boolean).join(', ');
  // Owner decision 6: an optional blank field is hidden, not shown as a dash.
  const facts = [
    ...(location ? [{ label: location, icon: <MapPin className="h-4 w-4" /> }] : []),
    ...(club.clubNumber
      ? [{ label: `Club #${club.clubNumber}`, icon: <Shield className="h-4 w-4" /> }]
      : []),
  ];

  // P2-B: visible to ANY viewer who can see this club at all (clubs_select
  // already scopes that) -- a club's own admin/secretary needs to know WHY
  // publish is blocked just as much as a site admin does. Only the
  // Authorize/Revoke MENU items above stay site-admin-only.
  const badges: HeroBadge[] = [
    ...(club.clubType
      ? [
          {
            label: `${club.clubType.charAt(0).toUpperCase()}${club.clubType.slice(1)} Club`,
            variant: 'default' as const,
            icon: <Award className="h-3 w-3" />,
          },
        ]
      : []),
    ...(isClubAuthorized === false
      ? [
          {
            label: 'Unauthorized',
            variant: 'warning' as const,
            icon: <ShieldAlert className="h-3 w-3" />,
            title: CLUB_UNAUTHORIZED_MESSAGE,
            testId: 'club-unauthorized-badge',
          },
        ]
      : []),
  ];

  const details = (
    <>
      {officialsError ? (
        <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-destructive">
          <span>Club officials couldn't load.</span>
          <Button
            type="button"
            variant="outline"
            className="h-11"
            onClick={() => void refetchOfficials()}
          >
            Try again
          </Button>
        </div>
      ) : (
        <ClubOfficialsLine
          adminNames={officials?.adminNames ?? []}
          secretaryNames={officials?.secretaryNames ?? []}
        />
      )}
      {/* MYK9-855: the badge alone only reads on hover (the `title` above),
          which a touch device never shows. Say in visible text what is pending
          and who acts on it next, instead of leaving the requester with a bare
          "Unauthorized" word. */}
      {isClubAuthorized === false && (
        <p
          data-testid="club-unauthorized-notice"
          className="max-w-2xl text-sm text-muted-foreground"
        >
          {canAuthorizeClub
            ? 'Pending myK9 authorization. Authorize this club from the ⋮ menu above to unlock show publishing and the public club directory.'
            : 'Pending myK9 authorization — a myK9 operator reviews new clubs and will authorize this one soon. You can build shows now; publishing unlocks once the club is authorized.'}
        </p>
      )}
    </>
  );

  return (
    <>
      <DetailHero
        banner={banner}
        cover={logo}
        coverClassName="w-16"
        eyebrow={foundedYear ? `Founded ${foundedYear}` : undefined}
        name={club.name}
        headingLevel={1}
        badges={badges}
        metadata={facts}
        details={details}
      />

      <AlertDialog open={showRevokeConfirm} onOpenChange={setShowRevokeConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke this club&apos;s authorization?</AlertDialogTitle>
            <AlertDialogDescription>
              Stop {club.name} from publishing new shows. It stays visible wherever it already has a
              published show.
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
    </>
  );
};
