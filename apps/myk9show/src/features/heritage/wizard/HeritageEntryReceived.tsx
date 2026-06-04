import { useNavigate } from 'react-router-dom';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { heritageColors, heritageOrnaments } from '@/features/heritage/tokens';

// ─── Props ────────────────────────────────────────────────────────────────────

export interface HeritageEntryReceivedProps {
  showName: string;
  clubName: string;
  dateRange: string;
  dogRegisteredName: string;
  dogCallName: string | null;
  classSummary: string;
  totalFeesFormatted: string;
  registrationNumber: string | null;
  /** Formatted confirmation date, e.g. "6 June 2026". Null if none set. */
  confirmationDateLabel: string | null;
  /** Called when "Print my entry blank" is clicked. If omitted, button is disabled. */
  onPrintEntryBlank?: (() => void) | undefined;
}

// ─── Shared style constants ───────────────────────────────────────────────────

const INK = heritageColors.ink;
const PAPER = heritageColors.paper;
const CLARET = heritageColors.claret;
const QUILL = heritageColors.quill;

// ─── Component ────────────────────────────────────────────────────────────────

export function HeritageEntryReceived({
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
}: HeritageEntryReceivedProps) {
  const navigate = useNavigate();

  return (
    <div
      data-heritage
      style={{ background: PAPER, color: INK, fontFamily: "'EB Garamond', Georgia, serif" }}
      className="rounded-sm"
    >
      {/* ── Header ── */}
      <div className="text-center px-10 pt-10 pb-6">
        <p
          style={{
            fontFamily: "'Cormorant Garamond', Georgia, serif",
            fontStyle: 'italic',
            fontSize: '0.8rem',
            color: QUILL,
            letterSpacing: '0.04em',
            margin: 0,
          }}
        >
          A formal receipt from
        </p>

        <p
          style={{
            fontFamily: "'Cormorant Garamond', Georgia, serif",
            fontWeight: 600,
            fontSize: '1.05rem',
            textTransform: 'uppercase',
            letterSpacing: '0.18em',
            color: INK,
            margin: '4px 0 12px',
          }}
        >
          {clubName}
        </p>

        {/* Ornament rule */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
            maxWidth: '220px',
            margin: '0 auto 12px',
          }}
        >
          <div style={{ flex: 1, height: '1px', background: INK }} />
          <span
            style={{
              fontFamily: "'Cormorant Garamond', Georgia, serif",
              fontSize: '1rem',
              color: CLARET,
            }}
          >
            {heritageOrnaments.diamond}
          </span>
          <div style={{ flex: 1, height: '1px', background: INK }} />
        </div>

        <h2
          style={{
            fontFamily: "'Cormorant Garamond', Georgia, serif",
            fontWeight: 500,
            fontStyle: 'italic',
            fontSize: '2.2rem',
            lineHeight: 1.05,
            color: INK,
            margin: '0 0 6px',
          }}
        >
          Your entry is <em style={{ color: CLARET, fontStyle: 'italic' }}>ready</em>.
        </h2>

        <p
          style={{
            fontFamily: "'EB Garamond', Georgia, serif",
            fontSize: '0.75rem',
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            color: QUILL,
            margin: 0,
          }}
        >
          {showName} · {dateRange}
        </p>
      </div>

      {/* ── Entry detail card ── */}
      <div
        className="mx-8 mb-6"
        style={{
          borderTop: `1px solid ${INK}`,
          borderBottom: `1px solid ${INK}`,
          padding: '16px 8px',
        }}
      >
        <p
          style={{
            fontFamily: "'Cormorant Garamond', Georgia, serif",
            fontStyle: 'italic',
            fontSize: '0.8rem',
            color: CLARET,
            letterSpacing: '0.06em',
            margin: '0 0 4px',
          }}
        >
          § The Dog
        </p>

        <p
          style={{
            fontFamily: "'Cormorant Garamond', Georgia, serif",
            fontSize: '1.4rem',
            fontWeight: 500,
            lineHeight: 1.15,
            color: INK,
            margin: '0 0 2px',
          }}
        >
          {dogRegisteredName}
        </p>

        {dogCallName && (
          <p
            style={{
              fontFamily: "'EB Garamond', Georgia, serif",
              fontStyle: 'italic',
              fontSize: '0.85rem',
              color: QUILL,
              margin: '0 0 10px',
            }}
          >
            called &ldquo;{dogCallName}&rdquo;
          </p>
        )}

        <p
          style={{
            fontFamily: "'EB Garamond', Georgia, serif",
            fontSize: '0.9rem',
            color: INK,
            margin: '0 0 12px',
          }}
        >
          {classSummary}
        </p>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            borderTop: `1px dotted ${QUILL}`,
            paddingTop: '10px',
          }}
        >
          <span
            style={{
              fontFamily: "'Cormorant Garamond', Georgia, serif",
              fontStyle: 'italic',
              fontSize: '0.85rem',
              color: QUILL,
            }}
          >
            {registrationNumber ? `Entry #${registrationNumber}` : 'Fees due'}
          </span>
          <span
            style={{
              fontFamily: "'Cormorant Garamond', Georgia, serif",
              fontSize: '1.4rem',
              fontWeight: 500,
              color: INK,
            }}
          >
            {totalFeesFormatted}
          </span>
        </div>
      </div>

      {/* ── CTAs ── */}
      <div className="px-8 pb-6 flex flex-col gap-3">
        <Button
          onClick={onPrintEntryBlank}
          disabled={!onPrintEntryBlank}
          style={{
            background: INK,
            color: PAPER,
            fontFamily: "'Cormorant Garamond', Georgia, serif",
            fontStyle: 'italic',
            letterSpacing: '0.06em',
            border: 'none',
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
            fontFamily: "'Cormorant Garamond', Georgia, serif",
            fontStyle: 'italic',
            color: INK,
            borderColor: INK,
            letterSpacing: '0.04em',
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
          className="text-center px-8 pb-8"
          style={{
            fontFamily: "'Cormorant Garamond', Georgia, serif",
            fontStyle: 'italic',
            fontSize: '0.8rem',
            color: QUILL,
            lineHeight: 1.6,
          }}
        >
          A formal confirmation will be emailed on{' '}
          <span style={{ color: INK }}>{confirmationDateLabel}</span> once the draw is complete.
        </p>
      )}
    </div>
  );
}
