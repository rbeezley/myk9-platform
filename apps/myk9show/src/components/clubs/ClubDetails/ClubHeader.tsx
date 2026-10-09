import React, { useMemo } from 'react';
import { MapPin, Award, Shield, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CoverImageUpload } from '@/components/ui/cover-image-upload';
import { DetailHero, type HeroBadge } from '@/components/common/DetailHero';
import { Club } from '@/types/club-types';
import { generatePalette } from '@/lib/branding';
import { getClubInitials } from './utils';
import { CLUB_UNAUTHORIZED_MESSAGE } from '@/features/payments/onlineEntryGate';
import { useClubOfficials } from './useClubOfficials';
import { ClubOfficialsLine } from './ClubOfficialsLine';

interface ClubHeaderProps {
  club: Club;
  onEditPhoto: () => void;
  // Cover image upload props (optional — wired in Task 12)
  onCoverUpload?: (file: File) => void;
  onCoverRemove?: () => void;
  isUploadingCover?: boolean;
  canEditBranding?: boolean;
  // MYK9-572: who may authorize (site admin) and the club's state, for the
  // Unauthorized badge and notice. isClubAuthorized is undefined while loading.
  // The Authorize / Revoke action itself is in the header Actions menu.
  canAuthorizeClub?: boolean;
  isClubAuthorized?: boolean | undefined;
}

export const ClubHeader: React.FC<ClubHeaderProps> = ({
  club,
  onEditPhoto,
  onCoverUpload,
  onCoverRemove,
  isUploadingCover = false,
  canEditBranding = false,
  canAuthorizeClub = false,
  isClubAuthorized,
}) => {
  const palette = useMemo(
    () => (club.accentColor ? generatePalette(club.accentColor) : null),
    [club.accentColor]
  );
  const {
    data: officials,
    isError: officialsError,
    refetch: refetchOfficials,
  } = useClubOfficials(club.id);
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
      {/* Every action on this club lives in the header Actions menu (CRUD standard decision 6). */}

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
            ? 'Pending myK9 authorization. Authorize this club from the Actions menu at the top of the page to unlock show publishing and the public club directory.'
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
    </>
  );
};
