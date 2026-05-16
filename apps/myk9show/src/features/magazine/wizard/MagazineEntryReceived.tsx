import { useNavigate } from 'react-router-dom';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { magazineColors } from '../tokens';

// ─── Props ────────────────────────────────────────────────────────────────────
//
// Reuses the same prop shape as `HeritageEntryReceivedProps` per the
// reconciliation notes (§"Wizard completion: prop-interface parity"). The
// Magazine style needs no additional fields — its identity is the gradient +
// Cormorant Garamond + Source Serif type system, all universal.

export interface MagazineEntryReceivedProps {
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
  /** Called when "Print my entry blank" is clicked. If omitted, button is
   *  disabled. */
  onPrintEntryBlank?: (() => void) | undefined;
}

// ─── Style constants ──────────────────────────────────────────────────────────
//
// Inlined so this component renders correctly inside the wizard's modal
// without needing `magazine.css` (the wizard mounts under its own layout).
// CSS-variable-driven styles would not pick up the wizard's host theme.

const INK = magazineColors.ink;
const PAPER = magazineColors.paper;
const PAPER_DEEP = magazineColors.paperDeep;
const GOLD_3 = magazineColors.gold3;
const QUILL = magazineColors.quill;
const MUTE = magazineColors.mute;
const GOLD_RULE_GRADIENT = 'linear-gradient(90deg, #c9a87c, #a8814f)';

const DISPLAY = "'Cormorant Garamond', Georgia, serif";
const BODY = "'Source Serif 4', Georgia, serif";
const META = "'Inter Tight', system-ui, sans-serif";

/**
 * Magazine wizard final-step receipt.
 *
 * Visual contract (from `Magazine Wizard Completion.html`):
 * 1. Smallcaps kicker ("Confirmed · Receipt 2026-0137") in gold-3
 * 2. Cormorant Garamond heading with italic gold-3 accent on "received"
 * 3. Italic dek (club + show + date range)
 * 4. 2px gold-gradient rule
 * 5. "Article i · The dog" smallcaps folio + dog particulars card with a
 *    dotted-gold total row at the bottom (the running fees total renders in
 *    italic gold-3 — the editorial signature)
 * 6. Two-button CTA stack (primary `Print my entry blank` on ink, secondary
 *    `Return to dashboard` ghost)
 * 7. Italic caption referencing the confirmation date
 *
 * The CTAs use shadcn `<Button>` with inline style overrides — same trick
 * Heritage uses to maintain the editorial palette without forking the
 * shared button.
 */
export function MagazineEntryReceived({
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
}: MagazineEntryReceivedProps) {
  const navigate = useNavigate();

  const kicker = registrationNumber
    ? `Confirmed · Receipt ${registrationNumber}`
    : 'Confirmed';

  return (
    <div
      data-magazine
      style={{
        background: PAPER,
        color: INK,
        fontFamily: BODY,
      }}
    >
      {/* ── Header ── */}
      <div style={{ padding: '32px 28px 18px' }}>
        <p
          style={{
            fontFamily: META,
            fontWeight: 500,
            fontSize: '11px',
            letterSpacing: '0.32em',
            textTransform: 'uppercase',
            color: GOLD_3,
            margin: '0 0 14px',
          }}
        >
          {kicker}
        </p>

        <h2
          style={{
            fontFamily: DISPLAY,
            fontWeight: 500,
            fontSize: '36px',
            letterSpacing: '-0.01em',
            lineHeight: 1.05,
            margin: '0 0 14px',
            color: INK,
          }}
        >
          Your entry is{' '}
          <span style={{ fontStyle: 'italic', color: GOLD_3 }}>received</span>.
        </h2>

        <p
          style={{
            fontFamily: DISPLAY,
            fontStyle: 'italic',
            fontSize: '16px',
            color: QUILL,
            margin: 0,
          }}
        >
          {clubName} · {showName}, {dateRange}
        </p>
      </div>

      {/* Gold rule (full-width inside the card) */}
      <div
        aria-hidden="true"
        style={{
          height: '2px',
          background: GOLD_RULE_GRADIENT,
          margin: '18px 28px 0',
        }}
      />

      {/* ── Entry detail card ── */}
      <div
        style={{
          margin: '0 28px',
          padding: '20px 0',
          borderBottom: `1px solid ${INK}`,
        }}
      >
        <p
          style={{
            fontFamily: META,
            fontWeight: 500,
            fontSize: '11px',
            letterSpacing: '0.32em',
            textTransform: 'uppercase',
            color: GOLD_3,
            margin: '0 0 8px',
            paddingTop: '18px',
          }}
        >
          Article i · The dog
        </p>

        <p
          style={{
            fontFamily: DISPLAY,
            fontWeight: 500,
            fontSize: '26px',
            letterSpacing: '-0.005em',
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
              fontFamily: DISPLAY,
              fontStyle: 'italic',
              fontSize: '15px',
              color: QUILL,
              margin: '0 0 14px',
            }}
          >
            called &ldquo;{dogCallName}&rdquo;
          </p>
        )}

        <p
          style={{
            fontFamily: BODY,
            fontSize: '14px',
            lineHeight: 1.6,
            color: magazineColors.soft,
            margin: '0 0 16px',
          }}
        >
          {classSummary}
        </p>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            borderTop: `1px dotted ${magazineColors.gold2}`,
            paddingTop: '12px',
          }}
        >
          <span
            style={{
              fontFamily: META,
              fontWeight: 500,
              fontSize: '10px',
              letterSpacing: '0.32em',
              textTransform: 'uppercase',
              color: MUTE,
            }}
          >
            {registrationNumber ? `Receipt № ${registrationNumber}` : 'Fees received'}
          </span>
          <span
            style={{
              fontFamily: DISPLAY,
              fontStyle: 'italic',
              fontWeight: 500,
              fontSize: '28px',
              color: GOLD_3,
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
          gap: '10px',
          padding: '20px 28px 16px',
        }}
      >
        <Button
          onClick={onPrintEntryBlank}
          disabled={!onPrintEntryBlank}
          style={{
            background: INK,
            color: PAPER,
            fontFamily: DISPLAY,
            fontStyle: 'italic',
            fontWeight: 500,
            fontSize: '16px',
            border: 'none',
            padding: '14px 18px',
            height: 'auto',
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
            fontFamily: DISPLAY,
            fontStyle: 'italic',
            fontWeight: 500,
            fontSize: '16px',
            borderColor: INK,
            padding: '14px 18px',
            height: 'auto',
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
            fontFamily: DISPLAY,
            fontStyle: 'italic',
            fontSize: '15px',
            lineHeight: 1.55,
            color: QUILL,
            background: PAPER_DEEP,
            margin: 0,
          }}
        >
          A formal confirmation will be emailed on{' '}
          <strong style={{ color: INK, fontWeight: 500, fontStyle: 'normal' }}>
            {confirmationDateLabel}
          </strong>{' '}
          once the draw is complete.
        </p>
      )}
    </div>
  );
}
