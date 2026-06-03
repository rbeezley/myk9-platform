import { useNavigate } from 'react-router-dom';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MonogramEmboss } from '../components/MonogramEmboss';
import { MONOGRAM_BODY_FAMILY, MONOGRAM_DISPLAY_FAMILY } from '../fonts';
import { monogramColors } from '../tokens';
import { buildMonogram } from '../utils/buildMonogram';
import type { HeritageEntryReceivedProps } from '@/features/heritage/wizard/HeritageEntryReceived';

/**
 * Monogram wizard completion props extend the Heritage shape 1:1 — only the
 * visual register changes per style, not the contract. Adds an optional
 * `monogramLetters` override; when absent we derive from the club name so
 * existing callers don't need to know about the new prop.
 */
export interface MonogramEntryReceivedProps extends HeritageEntryReceivedProps {
  /** Pre-derived initials for the header. Defaults to buildMonogram(clubName). */
  monogramLetters?: string;
}

const INK = monogramColors.ink;
const PAPER = monogramColors.paper;
const BRONZE = monogramColors.bronze;
const QUILL = monogramColors.quill;
const MUTE = monogramColors.mute;
const SOFT = monogramColors.soft;

/**
 * Monogram-styled entry-summary wizard completion step.
 *
 * Rendered from `RegistrationWorkflow/WorkflowStepContent.tsx` when the show
 * has `style='monogram'` or `'banner'`. The data flow comes from the same
 * `styledReceiptProps` builder Heritage and Headline use — the only visual
 * difference is the embossed monogram in place of an ornament rule, and the
 * Bodoni Moda + Italiana + Crimson Pro type stack.
 */
export function MonogramEntryReceived({
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
  monogramLetters,
}: MonogramEntryReceivedProps) {
  const navigate = useNavigate();
  const letters = monogramLetters ?? buildMonogram(clubName);

  return (
    <div
      data-monogram
      style={{ background: PAPER, color: INK, fontFamily: MONOGRAM_BODY_FAMILY }}
      className="rounded-sm"
    >
      {/* ── Header ── */}
      <header
        style={{
          textAlign: 'center',
          padding: '36px 28px 24px',
          borderBottom: `1px solid ${INK}`,
        }}
      >
        <div style={{ margin: '0 auto 14px' }}>
          <MonogramEmboss letters={letters} size={80} variant="solid" solidColor={INK} />
        </div>
        <p
          style={{
            fontFamily: MONOGRAM_BODY_FAMILY,
            fontSize: 11,
            fontWeight: 500,
            letterSpacing: '0.32em',
            textTransform: 'uppercase',
            color: BRONZE,
            margin: '0 0 10px',
          }}
        >
          A formal receipt from
        </p>
        <p
          style={{
            fontFamily: MONOGRAM_DISPLAY_FAMILY,
            fontStyle: 'italic',
            fontSize: 14,
            color: QUILL,
            margin: 0,
          }}
        >
          {clubName}
        </p>
        <h2
          style={{
            fontFamily: MONOGRAM_DISPLAY_FAMILY,
            fontWeight: 400,
            fontSize: 30,
            letterSpacing: '-0.015em',
            lineHeight: 1.1,
            margin: '12px 0',
            color: INK,
          }}
        >
          Your entry is{' '}
          <span style={{ fontStyle: 'italic', color: BRONZE }}>ready</span>.
        </h2>
        <p
          style={{
            fontFamily: MONOGRAM_BODY_FAMILY,
            fontSize: 11,
            letterSpacing: '0.32em',
            textTransform: 'uppercase',
            color: MUTE,
            margin: '8px 0 0',
          }}
        >
          {showName} · {dateRange}
        </p>
      </header>

      {/* ── Entry detail card ── */}
      <div
        style={{
          margin: '20px 28px 0',
          borderTop: `1px solid ${INK}`,
          borderBottom: `1px solid ${INK}`,
          padding: '18px 4px',
        }}
      >
        <p
          style={{
            fontFamily: MONOGRAM_BODY_FAMILY,
            fontSize: 10,
            fontWeight: 500,
            letterSpacing: '0.32em',
            textTransform: 'uppercase',
            color: BRONZE,
            margin: '0 0 6px',
          }}
        >
          § i · The dog
        </p>
        <p
          style={{
            fontFamily: MONOGRAM_DISPLAY_FAMILY,
            fontWeight: 400,
            fontSize: 22,
            letterSpacing: '-0.015em',
            lineHeight: 1.15,
            color: INK,
            margin: '0 0 4px',
          }}
        >
          {dogRegisteredName}
        </p>
        {dogCallName && (
          <p
            style={{
              fontFamily: MONOGRAM_DISPLAY_FAMILY,
              fontStyle: 'italic',
              fontSize: 14,
              color: QUILL,
              margin: '0 0 12px',
            }}
          >
            called &ldquo;{dogCallName}&rdquo;
          </p>
        )}
        <p
          style={{
            fontFamily: MONOGRAM_BODY_FAMILY,
            fontSize: 14,
            lineHeight: 1.55,
            color: SOFT,
            margin: '0 0 14px',
          }}
        >
          {classSummary}
        </p>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            borderTop: '1px dotted rgba(28, 24, 21, 0.3)',
            paddingTop: 12,
          }}
        >
          <span
            style={{
              fontFamily: MONOGRAM_DISPLAY_FAMILY,
              fontStyle: 'italic',
              fontSize: 14,
              color: QUILL,
            }}
          >
            {registrationNumber ? `Entry № ${registrationNumber}` : 'Fees due'}
          </span>
          <span
            style={{
              fontFamily: MONOGRAM_DISPLAY_FAMILY,
              fontWeight: 400,
              fontSize: 26,
              letterSpacing: '-0.02em',
              color: BRONZE,
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
          padding: '22px 28px 16px',
        }}
      >
        <Button
          onClick={onPrintEntryBlank}
          disabled={!onPrintEntryBlank}
          style={{
            background: INK,
            color: PAPER,
            fontFamily: MONOGRAM_DISPLAY_FAMILY,
            fontStyle: 'italic',
            letterSpacing: '0.02em',
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
            color: INK,
            borderColor: INK,
            fontFamily: MONOGRAM_DISPLAY_FAMILY,
            fontStyle: 'italic',
            letterSpacing: '0.02em',
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
            textAlign: 'center',
            padding: '14px 28px 32px',
            fontFamily: MONOGRAM_DISPLAY_FAMILY,
            fontStyle: 'italic',
            fontSize: 14,
            lineHeight: 1.6,
            color: QUILL,
            margin: 0,
          }}
        >
          A formal confirmation will be emailed on{' '}
          <strong
            style={{
              color: INK,
              fontWeight: 400,
              fontStyle: 'normal',
              fontFamily: MONOGRAM_DISPLAY_FAMILY,
            }}
          >
            {confirmationDateLabel}
          </strong>
          <br />
          once the draw is complete.
        </p>
      )}
    </div>
  );
}
