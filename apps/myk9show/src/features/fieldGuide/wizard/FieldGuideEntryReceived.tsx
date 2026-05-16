import { useNavigate } from 'react-router-dom';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { HeritageEntryReceivedProps } from '@/features/heritage/wizard/HeritageEntryReceived';
import { FieldGuideChip } from '../components/FieldGuideChip';
import { FieldGuideDarkBand } from '../components/FieldGuideDarkBand';
import {
  FIELD_GUIDE_BODY_FAMILY,
  FIELD_GUIDE_DISPLAY_FAMILY,
  FIELD_GUIDE_MONO_FAMILY,
} from '../fonts';
import { fieldGuideColors } from '../tokens';

/**
 * Field Guide wizard completion props mirror Heritage 1:1, no extensions.
 * Per the reconciliation notes, the chip system in this surface is
 * decorative — chips are derived from props (run count from
 * `classSummary`, receipt from `registrationNumber`, "CONFIRMED" is
 * constant). We never invent props the cross-style wiring layer doesn't
 * already pass.
 */
export type FieldGuideEntryReceivedProps = HeritageEntryReceivedProps;

/** Pull the leading "N runs" / "1 run" out of classSummary so we can render
 *  the "3 RUNS" chip without a new prop. Returns null if the summary
 *  doesn't start with a numeric run-count fragment. */
function extractRunsLabel(classSummary: string): string | null {
  const m = classSummary.match(/^\s*(\d+)\s*run/i);
  if (!m) return null;
  return `${m[1]} ${m[1] === '1' ? 'RUN' : 'RUNS'}`;
}

/**
 * Field-Guide-styled "your entry is recorded" wizard completion. Renders
 * as a compact receipt: dark ID strip, chip-tagged header, §-numbered
 * detail panel with dog + class summary + total, two stacked CTAs, and
 * a mono "next steps" caption.
 *
 * Wired from RegistrationWorkflow/WorkflowStepContent.tsx for shows with
 * `style='fieldGuide'`. No per-club configuration; the indicator-orange
 * palette is fixed.
 */
export function FieldGuideEntryReceived({
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
}: FieldGuideEntryReceivedProps) {
  const navigate = useNavigate();
  const runsLabel = extractRunsLabel(classSummary);

  return (
    <div
      data-field-guide
      style={{
        background: fieldGuideColors.paper,
        color: fieldGuideColors.ink,
        fontFamily: FIELD_GUIDE_BODY_FAMILY,
      }}
    >
      {/* ── Top dark ID strip ── */}
      <FieldGuideDarkBand
        paddingY={10}
        paddingX={24}
        style={{ display: 'flex', justifyContent: 'space-between' }}
      >
        <span>
          <strong style={{ color: fieldGuideColors.orange, fontWeight: 600 }}>
            CONFIRMATION
          </strong>{' '}
          · REV 01
        </span>
        {registrationNumber && <span>RECEIPT {registrationNumber}</span>}
      </FieldGuideDarkBand>

      {/* ── Chip-tagged header ── */}
      <header
        style={{
          padding: '22px 28px 18px',
          borderBottom: `2px solid ${fieldGuideColors.ink}`,
        }}
      >
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
          <FieldGuideChip variant="orange">CONFIRMED</FieldGuideChip>
          {runsLabel && <FieldGuideChip>{runsLabel}</FieldGuideChip>}
          {registrationNumber && (
            <FieldGuideChip>RECEIPT {registrationNumber}</FieldGuideChip>
          )}
        </div>
        <h2
          style={{
            margin: '0 0 8px',
            fontFamily: FIELD_GUIDE_DISPLAY_FAMILY,
            fontWeight: 700,
            fontSize: 28,
            letterSpacing: '-0.025em',
            lineHeight: 1.05,
            color: fieldGuideColors.ink,
          }}
        >
          Entry confirmed.
        </h2>
        <p
          style={{
            margin: 0,
            fontFamily: FIELD_GUIDE_MONO_FAMILY,
            fontWeight: 500,
            fontSize: 10,
            letterSpacing: '0.04em',
            color: fieldGuideColors.orangeDeep,
            textTransform: 'uppercase',
          }}
        >
          {showName} · {clubName} · {dateRange}
        </p>
      </header>

      {/* ── §01 detail panel ── */}
      <div
        style={{
          padding: '18px 28px',
          borderBottom: `1px solid ${fieldGuideColors.hair}`,
        }}
      >
        <p
          style={{
            margin: '0 0 6px',
            fontFamily: FIELD_GUIDE_MONO_FAMILY,
            fontWeight: 600,
            fontSize: 11,
            letterSpacing: '0.04em',
            color: fieldGuideColors.orangeDeep,
          }}
        >
          §01 · THE DOG
        </p>
        <p
          style={{
            margin: '0 0 4px',
            fontFamily: FIELD_GUIDE_DISPLAY_FAMILY,
            fontWeight: 700,
            fontSize: 22,
            letterSpacing: '-0.02em',
            lineHeight: 1.15,
            color: fieldGuideColors.ink,
          }}
        >
          {dogRegisteredName}
        </p>
        {dogCallName && (
          <p
            style={{
              margin: '0 0 14px',
              fontFamily: FIELD_GUIDE_MONO_FAMILY,
              fontWeight: 500,
              fontSize: 11,
              letterSpacing: '0.04em',
              color: fieldGuideColors.mute,
              textTransform: 'uppercase',
            }}
          >
            &ldquo;{dogCallName}&rdquo;
          </p>
        )}
        <p
          style={{
            margin: '0 0 14px',
            fontFamily: FIELD_GUIDE_BODY_FAMILY,
            fontSize: 14,
            lineHeight: 1.55,
            color: fieldGuideColors.soft,
          }}
        >
          {classSummary}
        </p>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            borderTop: `1px solid ${fieldGuideColors.hair}`,
            paddingTop: 12,
          }}
        >
          <span
            style={{
              fontFamily: FIELD_GUIDE_MONO_FAMILY,
              fontWeight: 500,
              fontSize: 10,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              color: fieldGuideColors.mute,
            }}
          >
            TOTAL · FEES RECEIVED
          </span>
          <span
            style={{
              fontFamily: FIELD_GUIDE_DISPLAY_FAMILY,
              fontWeight: 700,
              fontSize: 28,
              letterSpacing: '-0.025em',
              color: fieldGuideColors.orangeDeep,
              fontVariantNumeric: 'tabular-nums',
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
          padding: '18px 28px 16px',
        }}
      >
        <Button
          onClick={onPrintEntryBlank}
          disabled={!onPrintEntryBlank}
          style={{
            background: fieldGuideColors.orange,
            color: fieldGuideColors.paper,
            fontFamily: FIELD_GUIDE_DISPLAY_FAMILY,
            fontWeight: 700,
            fontSize: 13,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
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
            color: fieldGuideColors.ink,
            borderColor: fieldGuideColors.ink,
            borderWidth: 1,
            fontFamily: FIELD_GUIDE_DISPLAY_FAMILY,
            fontWeight: 700,
            fontSize: 13,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
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
            fontFamily: FIELD_GUIDE_BODY_FAMILY,
            fontSize: 13,
            lineHeight: 1.6,
            color: fieldGuideColors.mute,
            borderTop: `1px solid ${fieldGuideColors.hair}`,
            margin: '4px 0 0',
          }}
        >
          A formal confirmation will be emailed on{' '}
          <strong style={{ color: fieldGuideColors.ink, fontWeight: 700 }}>
            {confirmationDateLabel}
          </strong>{' '}
          once the draw is complete. Watch your inbox — your armband number will be included.
          <span
            style={{
              display: 'block',
              marginTop: 6,
              fontFamily: FIELD_GUIDE_MONO_FAMILY,
              fontWeight: 500,
              fontSize: 10,
              letterSpacing: '0.04em',
              color: fieldGuideColors.orangeDeep,
              textTransform: 'uppercase',
            }}
          >
            NEXT: §02 ON THE DAY · §03 WITHDRAW POLICY
          </span>
        </p>
      )}
    </div>
  );
}
