import { useNavigate } from 'react-router-dom';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PosterInkBlot } from '../components/PosterInkBlot';
import {
  POSTER_BODY_FAMILY,
  POSTER_DISPLAY_FAMILY,
  POSTER_DISPLAY_TIGHT_FAMILY,
  POSTER_MONO_FAMILY,
  ensurePosterFontsLoaded,
} from '../fonts';
import { posterColors } from '../tokens';
import type { HeritageEntryReceivedProps } from '@/features/heritage/wizard/HeritageEntryReceived';
import { useEffect } from 'react';
import '../poster.css';

/**
 * Poster wizard completion props mirror Heritage 1:1 — Poster has no
 * per-club overrides. The receipt's identity is graphic-shape based
 * (the corner ink-blot) plus the Archivo Black totals, both fully
 * data-system-driven.
 */
export type PosterEntryReceivedProps = HeritageEntryReceivedProps;

/**
 * Poster-styled "you're in" wizard completion.
 *
 * Visual structure mirrors the design mock:
 *   - 240px ink-blot in upper-right (smaller sibling of the hero ink-blot)
 *   - "NO 01 / CONFIRMED · RECEIPT 2026-0137" mono kicker
 *   - "YOU'RE IN." Archivo Black headline at 48px (red `IN.` accent)
 *   - Inter Tight 700 byline with the show / club / dates
 *   - Detail card with mono folio, Archivo Black dog name, mono call name
 *   - Total in Archivo Black 32px red
 *   - Two CTAs (primary ink, secondary outline)
 *   - Caption with confirmation date
 *
 * Wired from RegistrationWorkflow/WorkflowStepContent.tsx for shows with
 * `style='poster'`.
 */
export function PosterEntryReceived({
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
}: PosterEntryReceivedProps) {
  const navigate = useNavigate();
  useEffect(() => {
    ensurePosterFontsLoaded();
  }, []);

  return (
    <div
      data-poster
      style={{
        background: posterColors.cream,
        color: posterColors.ink,
        fontFamily: POSTER_BODY_FAMILY,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Decorative corner ink-blot — 240px, no animation (receipts are static). */}
      <PosterInkBlot
        size={240}
        position={{ top: -100, right: -100 }}
        staticMount
        filter={null}
      />

      {/* Header */}
      <header
        style={{
          padding: '28px 28px 22px',
          borderBottom: `2px solid ${posterColors.ink}`,
          position: 'relative',
          zIndex: 1,
        }}
      >
        <p
          style={{
            margin: '0 0 12px',
            fontFamily: POSTER_MONO_FAMILY,
            fontWeight: 600,
            fontSize: 11,
            letterSpacing: '0.04em',
            color: posterColors.red,
          }}
        >
          NO 01 / CONFIRMED
          {registrationNumber ? ` · RECEIPT ${registrationNumber}` : ''}
        </p>
        <h2
          style={{
            margin: '0 0 12px',
            fontFamily: POSTER_DISPLAY_FAMILY,
            fontWeight: 400,
            fontSize: 48,
            letterSpacing: '-0.045em',
            lineHeight: 0.85,
            color: posterColors.ink,
          }}
        >
          YOU&apos;RE <span style={{ color: posterColors.red }}>IN.</span>
        </h2>
        <p
          style={{
            margin: 0,
            fontFamily: POSTER_DISPLAY_TIGHT_FAMILY,
            fontWeight: 700,
            fontSize: 14,
            letterSpacing: '-0.005em',
            lineHeight: 1.35,
            color: posterColors.inkSoft,
          }}
        >
          {/* Defensive — HeritageEntryReceivedProps types these as `string`,
              but the registration workflow can supply transient empty / nullish
              values during step transitions. Coalesce before uppercasing so the
              receipt never throws on a NPE during a re-render. */}
          {(showName ?? '').toUpperCase()} · {(clubName ?? '').toUpperCase()} ·{' '}
          {(dateRange ?? '').toUpperCase()}
        </p>
      </header>

      {/* Detail card */}
      <div
        style={{
          padding: '20px 28px',
          borderBottom: `2px solid ${posterColors.ink}`,
          position: 'relative',
          zIndex: 1,
        }}
      >
        <p
          style={{
            margin: '0 0 8px',
            fontFamily: POSTER_MONO_FAMILY,
            fontWeight: 600,
            fontSize: 11,
            letterSpacing: '0.04em',
            color: posterColors.red,
          }}
        >
          NO 02 / THE DOG
        </p>
        <p
          style={{
            margin: '0 0 6px',
            fontFamily: POSTER_DISPLAY_FAMILY,
            fontWeight: 400,
            fontSize: 22,
            letterSpacing: '-0.035em',
            lineHeight: 1.0,
            color: posterColors.ink,
          }}
        >
          {(dogRegisteredName ?? '').toUpperCase()}
        </p>
        {dogCallName && (
          <p
            style={{
              margin: '0 0 14px',
              fontFamily: POSTER_MONO_FAMILY,
              fontWeight: 500,
              fontSize: 11,
              letterSpacing: '0.04em',
              color: posterColors.mute,
            }}
          >
            &ldquo;{dogCallName.toUpperCase()}&rdquo;
          </p>
        )}
        <p
          style={{
            margin: '0 0 16px',
            fontFamily: POSTER_BODY_FAMILY,
            fontSize: 14,
            lineHeight: 1.55,
            color: posterColors.inkSoft,
          }}
        >
          {classSummary}
        </p>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            borderTop: `1px solid ${posterColors.hair}`,
            paddingTop: 12,
          }}
        >
          <span
            style={{
              fontFamily: POSTER_MONO_FAMILY,
              fontWeight: 600,
              fontSize: 11,
              letterSpacing: '0.04em',
              color: posterColors.mute,
            }}
          >
            TOTAL · FEES RECEIVED
          </span>
          <span
            style={{
              fontFamily: POSTER_DISPLAY_FAMILY,
              fontWeight: 400,
              fontSize: 32,
              letterSpacing: '-0.05em',
              color: posterColors.red,
            }}
          >
            {totalFeesFormatted}
          </span>
        </div>
      </div>

      {/* CTAs */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          padding: '22px 28px 18px',
          position: 'relative',
          zIndex: 1,
        }}
      >
        <Button
          onClick={onPrintEntryBlank}
          disabled={!onPrintEntryBlank}
          style={{
            background: posterColors.ink,
            color: posterColors.cream,
            fontFamily: POSTER_DISPLAY_FAMILY,
            fontWeight: 400,
            fontSize: 15,
            letterSpacing: '-0.015em',
            border: 'none',
            borderRadius: 0,
            padding: '16px 18px',
            height: 'auto',
          }}
          className="w-full"
          aria-label="Print my entry blank"
        >
          <Download className="mr-2 h-4 w-4" />
          PRINT MY ENTRY BLANK
        </Button>
        <Button
          variant="outline"
          onClick={() => navigate('/')}
          style={{
            background: 'transparent',
            color: posterColors.ink,
            borderColor: posterColors.ink,
            borderWidth: 2,
            fontFamily: POSTER_DISPLAY_FAMILY,
            fontWeight: 400,
            fontSize: 15,
            letterSpacing: '-0.015em',
            borderRadius: 0,
            padding: '16px 18px',
            height: 'auto',
          }}
          className="w-full"
          aria-label="Return to dashboard"
        >
          RETURN TO DASHBOARD
        </Button>
      </div>

      {/* Caption */}
      {confirmationDateLabel && (
        <p
          style={{
            textAlign: 'left',
            padding: '14px 28px 28px',
            fontFamily: POSTER_BODY_FAMILY,
            fontSize: 13,
            lineHeight: 1.6,
            color: posterColors.mute,
            borderTop: `1px solid ${posterColors.hair}`,
            margin: '4px 0 0',
            position: 'relative',
            zIndex: 1,
          }}
        >
          A formal confirmation will be emailed on{' '}
          <strong style={{ color: posterColors.ink, fontWeight: 600 }}>
            {confirmationDateLabel}
          </strong>{' '}
          once the draw is complete. Watch your inbox — your armband number will be included.
        </p>
      )}
    </div>
  );
}
