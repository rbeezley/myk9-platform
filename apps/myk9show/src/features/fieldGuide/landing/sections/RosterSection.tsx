import { useRevealOnScroll } from '@/features/_shared/hooks/useRevealOnScroll';
import { FieldGuideSectionHead } from '../../components/FieldGuideSectionHead';
import { FIELD_GUIDE_DISPLAY_FAMILY, FIELD_GUIDE_MONO_FAMILY } from '../../fonts';
import { fieldGuideColors, fieldGuideSpacing } from '../../tokens';
import { formatDateInTimezone } from '../utils/dateFormat';

interface RosterSectionProps {
  entryCount: number;
  entryLimit: number | null;
  entryOpenDate: string | null;
  entryCloseDate: string | null;
  /** Trial timezone — required so the OPENED/CLOSES dates render in the
   *  exhibitor's locale of record, not whatever timezone the browser
   *  happens to be in. Matches the rest of Field Guide's date handling. */
  timezone: string;
}

/**
 * §05 Roster status — the capacity meter. Big tabular-num percent on the
 * left, fill bar + open/close meta on the right. The fill bar is the
 * only animated element on a Field Guide landing page; reduced-motion
 * disables it.
 */
export function RosterSection({
  entryCount,
  entryLimit,
  entryOpenDate,
  entryCloseDate,
  timezone,
}: RosterSectionProps) {
  const { ref, revealed } = useRevealOnScroll<HTMLDivElement>();
  if (entryLimit == null) return null;
  const pct = entryLimit > 0 ? Math.min(100, Math.round((entryCount / entryLimit) * 100)) : 0;
  const openedLabel = entryOpenDate ? formatDateInTimezone(entryOpenDate, timezone, 'iso') : 'TBA';
  const closesLabel = entryCloseDate
    ? formatDateInTimezone(entryCloseDate, timezone, 'iso')
    : 'TBA';

  return (
    <section
      id="§05"
      className="fg-section"
      style={{
        maxWidth: fieldGuideSpacing.contentMax,
        margin: '0 auto',
        padding: `${fieldGuideSpacing.sectionPaddingY}px ${fieldGuideSpacing.pageGutterX}px`,
      }}
    >
      <FieldGuideSectionHead folio="§05" title="Roster status" meta={`LIVE · ${pct}% CLAIMED`} />
      <div
        ref={ref}
        className={`fg-reveal ${revealed ? 'in' : ''}`}
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 32,
          padding: '28px 0',
          borderTop: `2px solid ${fieldGuideColors.ink}`,
          borderBottom: `2px solid ${fieldGuideColors.ink}`,
          alignItems: 'center',
        }}
      >
        <div
          style={{
            fontFamily: FIELD_GUIDE_DISPLAY_FAMILY,
            fontWeight: 700,
            fontSize: 88,
            letterSpacing: '-0.035em',
            lineHeight: 0.9,
            color: fieldGuideColors.ink,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {entryCount}
          <span style={{ color: fieldGuideColors.mute, fontSize: 56 }}>/{entryLimit}</span>
          <span
            style={{
              display: 'block',
              fontFamily: FIELD_GUIDE_MONO_FAMILY,
              fontWeight: 500,
              fontSize: 13,
              letterSpacing: '0.04em',
              color: fieldGuideColors.orangeDeep,
              marginTop: 8,
              textTransform: 'uppercase',
            }}
          >
            RUNS CLAIMED · {pct}%
          </span>
        </div>
        <div>
          <div
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${pct}% of entry limit filled`}
            style={{
              height: 10,
              background: fieldGuideColors.paperWarm,
              border: `1px solid ${fieldGuideColors.ink}`,
              position: 'relative',
              overflow: 'hidden',
              marginBottom: 14,
            }}
          >
            <div
              className="fg-capacity-bar-fill"
              style={{
                position: 'absolute',
                inset: '-1px auto -1px -1px',
                background: fieldGuideColors.orange,
                width: `${pct}%`,
              }}
            />
          </div>
          <div
            style={{
              fontFamily: FIELD_GUIDE_MONO_FAMILY,
              fontWeight: 500,
              fontSize: 11,
              letterSpacing: '0.04em',
              color: fieldGuideColors.mute,
              display: 'flex',
              justifyContent: 'space-between',
            }}
          >
            <span>
              <strong style={{ color: fieldGuideColors.ink, fontWeight: 600 }}>OPENED</strong>{' '}
              {openedLabel}
            </span>
            <span>
              <strong style={{ color: fieldGuideColors.ink, fontWeight: 600 }}>CLOSES</strong>{' '}
              {closesLabel}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
