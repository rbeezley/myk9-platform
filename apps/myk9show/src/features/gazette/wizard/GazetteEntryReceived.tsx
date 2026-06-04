import { useNavigate } from 'react-router-dom';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { gazetteColors, GAZETTE_DEFAULT_VOLUME_ROMAN } from '../tokens';
import { GazetteMasthead } from '../components/GazetteMasthead';

/**
 * Gazette wizard completion props mirror Heritage's verbatim — the
 * reconciliation notes (§ Wizard completion: prop-interface parity)
 * explicitly require no extensions, so a future "Heritage or Gazette
 * receipt" picker can swap implementations behind a single interface.
 */
export interface GazetteEntryReceivedProps {
  showName: string;
  clubName: string;
  dateRange: string;
  dogRegisteredName: string;
  dogCallName: string | null;
  classSummary: string;
  totalFeesFormatted: string;
  registrationNumber: string | null;
  /** Formatted confirmation date, e.g. "Jun 6, 2026". Null if none set. */
  confirmationDateLabel: string | null;
  /** Called when "Print my entry blank" is clicked. Disabled when omitted. */
  onPrintEntryBlank?: (() => void) | undefined;
}

const INK = gazetteColors.ink;
const PAPER = gazetteColors.paper;
const BROWN = gazetteColors.brown;
const QUILL = gazetteColors.mute;
const SOFT = gazetteColors.soft;
const HAIR = gazetteColors.hair;
const DISPLAY = "'Playfair Display', Georgia, serif";
const BODY = "'Source Serif 4', Georgia, serif";
const META = "'IBM Plex Mono', ui-monospace, monospace";

export function GazetteEntryReceived({
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
}: GazetteEntryReceivedProps) {
  const navigate = useNavigate();

  return (
    <div
      data-gazette
      className="rounded-sm"
      style={{ background: PAPER, color: INK, fontFamily: BODY }}
    >
      {/* ── Mini-masthead — strip + reduced-size title ── */}
      <div className="px-1 pt-2">
        <GazetteMasthead
          clubName={clubName}
          volumeRoman={GAZETTE_DEFAULT_VOLUME_ROMAN}
          edition={null}
          dateLabel={null}
          cityLabel={null}
          established={null}
          motto={null}
          rightSubSlot={null}
          noAnimation
        />
      </div>

      {/* ── Header ── */}
      <div className="border-b px-7 pt-6 pb-5 text-center" style={{ borderColor: HAIR }}>
        <p
          className="m-0 mb-3 text-[10px] font-semibold uppercase"
          style={{ color: BROWN, letterSpacing: '0.28em', fontFamily: META }}
        >
          {registrationNumber ? `Entry ${registrationNumber} · Ready to submit` : 'Ready to submit'}
        </p>
        <h2
          className="m-0 mb-3"
          style={{
            fontFamily: DISPLAY,
            fontWeight: 900,
            fontSize: 30,
            lineHeight: 1.05,
            letterSpacing: '-0.012em',
            color: INK,
          }}
        >
          Your entry is{' '}
          <span style={{ fontStyle: 'italic', fontWeight: 400, color: BROWN }}>ready</span>.
        </h2>
        <p
          className="m-0 text-[10px] uppercase"
          style={{ color: BROWN, letterSpacing: '0.18em', fontFamily: META }}
        >
          {showName} · {dateRange}
        </p>
      </div>

      {/* ── Entry detail card ── */}
      <div className="border-b px-7 py-5" style={{ borderColor: HAIR }}>
        <p
          className="m-0 mb-1.5 text-[10px] font-semibold uppercase"
          style={{ color: BROWN, letterSpacing: '0.28em', fontFamily: META }}
        >
          Section A · The Dog
        </p>
        <p
          className="m-0 mb-1"
          style={{
            fontFamily: DISPLAY,
            fontWeight: 900,
            fontSize: 22,
            letterSpacing: '-0.012em',
            lineHeight: 1.1,
            color: INK,
          }}
        >
          {dogRegisteredName}
        </p>
        {dogCallName && (
          <p
            className="m-0 mb-3.5"
            style={{ fontFamily: DISPLAY, fontStyle: 'italic', fontWeight: 400, fontSize: 14, color: BROWN }}
          >
            &ldquo;{dogCallName}&rdquo;
          </p>
        )}
        <p
          className="m-0 mb-3.5"
          style={{ fontFamily: BODY, fontSize: 14, lineHeight: 1.55, color: SOFT }}
        >
          {classSummary}
        </p>
        <div
          className="flex items-baseline justify-between pt-3"
          style={{ borderTop: `1px dotted ${HAIR}` }}
        >
          <span
            className="text-[10px] font-medium uppercase"
            style={{ color: QUILL, letterSpacing: '0.18em', fontFamily: META }}
          >
            {registrationNumber ? `Entry № ${registrationNumber}` : 'Total fees'}
          </span>
          <span
            style={{ fontFamily: DISPLAY, fontWeight: 900, fontSize: 28, color: BROWN }}
          >
            {totalFeesFormatted}
          </span>
        </div>
      </div>

      {/* ── CTAs ── */}
      <div className="flex flex-col gap-2.5 px-7 py-5">
        <Button
          onClick={onPrintEntryBlank}
          disabled={!onPrintEntryBlank}
          className="w-full"
          style={{
            background: INK,
            color: PAPER,
            fontFamily: DISPLAY,
            fontWeight: 700,
            fontSize: 14,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            border: 'none',
          }}
          aria-label="Print my entry blank"
        >
          <Download className="mr-2 h-4 w-4" />
          Print my entry blank
        </Button>
        <Button
          variant="outline"
          onClick={() => navigate('/')}
          className="w-full"
          style={{
            background: 'transparent',
            color: INK,
            borderColor: INK,
            fontFamily: DISPLAY,
            fontWeight: 700,
            fontSize: 14,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
          }}
          aria-label="Return to dashboard"
        >
          Return to dashboard
        </Button>
      </div>

      {/* ── Caption ── */}
      {confirmationDateLabel && (
        <p
          className="m-0 px-7 pt-3.5 pb-7 text-center"
          style={{
            borderTop: `4px double ${INK}`,
            fontFamily: DISPLAY,
            fontStyle: 'italic',
            fontSize: 14,
            lineHeight: 1.6,
            color: BROWN,
          }}
        >
          A formal confirmation will be emailed on{' '}
          <strong style={{ color: INK, fontStyle: 'normal', fontWeight: 700, fontFamily: DISPLAY }}>
            {confirmationDateLabel}
          </strong>
          <br />
          once the draw is complete.
        </p>
      )}
    </div>
  );
}
