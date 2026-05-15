import { useNavigate } from 'react-router-dom';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BANNER_BODY_FAMILY, BANNER_DISPLAY_FAMILY } from '../fonts';
import { bannerColors } from '../tokens';
import { deriveBannerBrandColors } from '../hooks/useBannerBrandColor';
import type { HeritageEntryReceivedProps } from '@/features/heritage/wizard/HeritageEntryReceived';

/**
 * Banner wizard completion props mirror Heritage 1:1 plus an optional
 * `brandColor` override. When `brandColor` is absent we use the default
 * deep teal — the wizard never sees the show row directly, so callers
 * who know the per-club color should pass it through here.
 */
export interface BannerEntryReceivedProps extends HeritageEntryReceivedProps {
  /** Hex flag color from show.brand_color. Defaults to deep teal when
   *  null/undefined; `deriveBannerBrandColors` also rejects malformed hex
   *  and falls back to the default. */
  brandColor?: string | null | undefined;
}

/**
 * Banner-styled "you're in" wizard completion. Renders the receipt as a
 * full-bleed flag-bar masthead (kicker + h2 + byline) above a tight detail
 * card and two CTAs, mirroring Banner's flag-bar discipline.
 *
 * Wired from RegistrationWorkflow/WorkflowStepContent.tsx for shows with
 * `style='banner'`. The `brandColor` prop flows from the show row.
 */
export function BannerEntryReceived({
  showName,
  clubName,
  dateRange,
  dogRegisteredName,
  dogCallName,
  classSummary,
  totalFeesFormatted,
  registrationNumber,
  confirmationDateLabel,
  onPrintEntryBlank,
  brandColor,
}: BannerEntryReceivedProps) {
  const navigate = useNavigate();
  const colors = deriveBannerBrandColors(brandColor);

  return (
    <div
      data-banner
      style={{ background: bannerColors.paper, color: bannerColors.ink, fontFamily: BANNER_BODY_FAMILY }}
    >
      {/* ── Flag masthead ── */}
      <header
        style={{
          background: colors.flag,
          color: colors.textOnFlag,
          padding: '24px 28px 28px',
        }}
      >
        <p
          style={{
            margin: '0 0 12px',
            fontFamily: BANNER_BODY_FAMILY,
            fontWeight: 500,
            fontSize: 10,
            letterSpacing: '0.32em',
            textTransform: 'uppercase',
            color: colors.textOnFlag,
            opacity: 0.7,
          }}
        >
          Confirmed{registrationNumber ? ` · Receipt ${registrationNumber}` : ''}
        </p>
        <h2
          style={{
            margin: '0 0 10px',
            fontFamily: BANNER_DISPLAY_FAMILY,
            fontWeight: 900,
            fontSize: 36,
            letterSpacing: '-0.04em',
            lineHeight: 0.92,
            color: colors.textOnFlag,
          }}
        >
          You&apos;re in.
        </h2>
        <p
          style={{
            margin: 0,
            fontFamily: BANNER_BODY_FAMILY,
            fontSize: 14,
            lineHeight: 1.45,
            color: colors.textOnFlag,
            opacity: 0.85,
          }}
        >
          {showName} · {clubName} · {dateRange}
        </p>
      </header>

      {/* ── Entry detail card ── */}
      <div
        style={{
          margin: '20px 28px 0',
          borderTop: `2px solid ${colors.flag}`,
          borderBottom: `2px solid ${colors.flag}`,
          padding: '16px 0',
        }}
      >
        <p
          style={{
            margin: '0 0 8px',
            fontFamily: BANNER_DISPLAY_FAMILY,
            fontWeight: 900,
            fontSize: 12,
            letterSpacing: '0.2em',
            color: colors.flag,
          }}
        >
          01 / THE DOG
        </p>
        <p
          style={{
            margin: '0 0 4px',
            fontFamily: BANNER_DISPLAY_FAMILY,
            fontWeight: 800,
            fontSize: 24,
            letterSpacing: '-0.025em',
            lineHeight: 1.1,
            color: bannerColors.ink,
          }}
        >
          {dogRegisteredName}
        </p>
        {dogCallName && (
          <p
            style={{
              margin: '0 0 14px',
              fontFamily: BANNER_BODY_FAMILY,
              fontWeight: 500,
              fontSize: 12,
              letterSpacing: '0.08em',
              color: bannerColors.mute,
            }}
          >
            &ldquo;{dogCallName}&rdquo;
          </p>
        )}
        <p
          style={{
            margin: '0 0 14px',
            fontFamily: BANNER_BODY_FAMILY,
            fontSize: 14,
            lineHeight: 1.5,
            color: bannerColors.soft,
          }}
        >
          {classSummary}
        </p>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            borderTop: `1px solid ${bannerColors.hair}`,
            paddingTop: 12,
          }}
        >
          <span
            style={{
              fontFamily: BANNER_BODY_FAMILY,
              fontWeight: 500,
              fontSize: 10,
              letterSpacing: '0.28em',
              textTransform: 'uppercase',
              color: bannerColors.mute,
            }}
          >
            Total · Fees received
          </span>
          <span
            style={{
              fontFamily: BANNER_DISPLAY_FAMILY,
              fontWeight: 900,
              fontSize: 30,
              letterSpacing: '-0.035em',
              color: colors.flag,
            }}
          >
            {totalFeesFormatted}
          </span>
        </div>
      </div>

      {/* ── CTAs ── */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          padding: '20px 28px 16px',
        }}
      >
        <Button
          onClick={onPrintEntryBlank}
          disabled={!onPrintEntryBlank}
          style={{
            background: colors.flag,
            color: colors.textOnFlag,
            fontFamily: BANNER_DISPLAY_FAMILY,
            fontWeight: 700,
            fontSize: 14,
            letterSpacing: '-0.005em',
            border: 'none',
            borderRadius: 0,
          }}
          className="w-full"
          aria-label="Print my entry blank"
        >
          <Download className="mr-2 h-4 w-4" />
          Print my entry blank
        </Button>
        <Button
          variant="outline"
          onClick={() => navigate('/')}
          style={{
            background: 'transparent',
            color: bannerColors.ink,
            borderColor: bannerColors.ink,
            borderWidth: 1.5,
            fontFamily: BANNER_DISPLAY_FAMILY,
            fontWeight: 700,
            fontSize: 14,
            letterSpacing: '-0.005em',
            borderRadius: 0,
          }}
          className="w-full"
          aria-label="Return to dashboard"
        >
          Return to dashboard
        </Button>
      </div>

      {/* ── Caption ── */}
      {confirmationDateLabel && (
        <p
          style={{
            textAlign: 'left',
            padding: '14px 28px 28px',
            fontFamily: BANNER_BODY_FAMILY,
            fontSize: 12,
            lineHeight: 1.6,
            color: bannerColors.mute,
            borderTop: `1px solid ${bannerColors.hair}`,
            margin: '4px 0 0',
          }}
        >
          A formal confirmation will be emailed on{' '}
          <strong style={{ color: bannerColors.ink, fontWeight: 600 }}>
            {confirmationDateLabel}
          </strong>{' '}
          once the draw is complete. Watch your inbox — your armband number will be included.
        </p>
      )}
    </div>
  );
}
