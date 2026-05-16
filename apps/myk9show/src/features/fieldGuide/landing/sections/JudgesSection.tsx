import { useRevealOnScroll } from '@/features/_shared/hooks/useRevealOnScroll';
import { FieldGuideChip } from '../../components/FieldGuideChip';
import { FieldGuideSectionHead } from '../../components/FieldGuideSectionHead';
import { FIELD_GUIDE_BODY_FAMILY, FIELD_GUIDE_DISPLAY_FAMILY, FIELD_GUIDE_MONO_FAMILY } from '../../fonts';
import { fieldGuideColors, fieldGuideSpacing } from '../../tokens';
import type { FieldGuideJudge } from '../types';

interface JudgesSectionProps {
  judges: FieldGuideJudge[];
  trialsCount: number;
}

/**
 * §04 Judging assignments — chip-tagged judge cards in a 2-column grid.
 * The orange "TRIALS 01·03·05" chip above each name is load-bearing —
 * it's how exhibitors confirm which days they'll see this judge.
 */
export function JudgesSection({ judges, trialsCount }: JudgesSectionProps) {
  const { ref, revealed } = useRevealOnScroll<HTMLDivElement>();
  if (!judges.length) return null;

  return (
    <section
      id="§04"
      className="fg-section"
      style={{
        maxWidth: fieldGuideSpacing.contentMax,
        margin: '0 auto',
        padding: `${fieldGuideSpacing.sectionPaddingY}px ${fieldGuideSpacing.pageGutterX}px`,
      }}
    >
      <FieldGuideSectionHead
        folio="§04"
        title="Judging assignments"
        meta={`${judges.length} JUDGE${judges.length === 1 ? '' : 'S'} / ${trialsCount} TRIAL${trialsCount === 1 ? '' : 'S'}`}
      />
      <div
        ref={ref}
        className={`fg-reveal ${revealed ? 'in' : ''}`}
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: 0,
          borderTop: `2px solid ${fieldGuideColors.ink}`,
          borderBottom: `2px solid ${fieldGuideColors.ink}`,
        }}
      >
        {judges.map((j, i) => (
          <article
            key={j.id}
            style={{
              padding: i % 2 === 0 ? '24px 24px 24px 0' : '24px 0 24px 24px',
              borderRight:
                i % 2 === 0 && i !== judges.length - 1
                  ? `1px solid ${fieldGuideColors.hair}`
                  : 'none',
            }}
          >
            {j.trialsLabel && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
                <FieldGuideChip variant="orange">{j.trialsLabel}</FieldGuideChip>
              </div>
            )}
            <h3
              style={{
                margin: '0 0 6px',
                fontFamily: FIELD_GUIDE_DISPLAY_FAMILY,
                fontWeight: 700,
                fontSize: 26,
                letterSpacing: '-0.02em',
                lineHeight: 1.1,
                color: fieldGuideColors.ink,
              }}
            >
              {j.name}
            </h3>
            {j.city && (
              <div
                style={{
                  fontFamily: FIELD_GUIDE_MONO_FAMILY,
                  fontWeight: 500,
                  fontSize: 11,
                  letterSpacing: '0.04em',
                  color: fieldGuideColors.mute,
                  marginBottom: 14,
                }}
              >
                {j.city.toUpperCase()}
              </div>
            )}
            {j.bio && (
              <p
                style={{
                  margin: 0,
                  fontFamily: FIELD_GUIDE_BODY_FAMILY,
                  fontSize: 14,
                  lineHeight: 1.6,
                  color: fieldGuideColors.soft,
                }}
              >
                {j.bio}
              </p>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
