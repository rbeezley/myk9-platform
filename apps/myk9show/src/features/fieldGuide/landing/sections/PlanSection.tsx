import { useRevealOnScroll } from '@/features/_shared/hooks/useRevealOnScroll';
import { FieldGuideChip } from '../../components/FieldGuideChip';
import { FieldGuideSectionHead } from '../../components/FieldGuideSectionHead';
import { FIELD_GUIDE_BODY_FAMILY, FIELD_GUIDE_DISPLAY_FAMILY, FIELD_GUIDE_MONO_FAMILY } from '../../fonts';
import { fieldGuideColors, fieldGuideSpacing } from '../../tokens';
import type { FieldGuideAccommodation } from '../types';

interface PlanSectionProps {
  accommodations: FieldGuideAccommodation[];
}

/**
 * §07 Site reference — lodging / vet / hospitality cards. Each card is
 * a 2-col grid item with a mono-orange ID code, a default chip on the
 * right, the IBM Plex Sans 700 name, mono caption row, and a short body
 * sentence.
 */
export function PlanSection({ accommodations }: PlanSectionProps) {
  const { ref, revealed } = useRevealOnScroll<HTMLDivElement>();
  if (!accommodations.length) return null;

  return (
    <section
      id="§07"
      className="fg-section"
      style={{
        maxWidth: fieldGuideSpacing.contentMax,
        margin: '0 auto',
        padding: `${fieldGuideSpacing.sectionPaddingY}px ${fieldGuideSpacing.pageGutterX}px`,
      }}
    >
      <FieldGuideSectionHead folio="§07" title="Site reference · lodging" meta="REFERENCE CARDS" />
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
        {accommodations.map((acc, i) => {
          const idCode = `LDG.${String(i + 1).padStart(2, '0')}`;
          const isLastRow = i >= accommodations.length - (accommodations.length % 2 === 0 ? 2 : 1);
          return (
            <article
              key={`${acc.name}-${i}`}
              style={{
                padding: '18px 20px',
                borderRight:
                  i % 2 === 0 && i !== accommodations.length - 1
                    ? `1px solid ${fieldGuideColors.hair}`
                    : 'none',
                borderBottom: isLastRow ? 'none' : `1px solid ${fieldGuideColors.hair}`,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  marginBottom: 10,
                }}
              >
                <span
                  style={{
                    fontFamily: FIELD_GUIDE_MONO_FAMILY,
                    fontWeight: 600,
                    fontSize: 10.5,
                    letterSpacing: '0.04em',
                    color: fieldGuideColors.orangeDeep,
                  }}
                >
                  {idCode}
                </span>
                {acc.type && <FieldGuideChip>{acc.type.toUpperCase()}</FieldGuideChip>}
              </div>
              <h3
                style={{
                  margin: '0 0 6px',
                  fontFamily: FIELD_GUIDE_DISPLAY_FAMILY,
                  fontWeight: 700,
                  fontSize: 20,
                  letterSpacing: '-0.015em',
                  lineHeight: 1.15,
                  color: fieldGuideColors.ink,
                }}
              >
                {acc.name}
              </h3>
              {(acc.address || acc.phone) && (
                <div
                  style={{
                    fontFamily: FIELD_GUIDE_MONO_FAMILY,
                    fontWeight: 500,
                    fontSize: 12,
                    letterSpacing: '0.04em',
                    color: fieldGuideColors.mute,
                    marginBottom: 10,
                    display: 'flex',
                    gap: 12,
                    flexWrap: 'wrap',
                  }}
                >
                  {acc.address && <span>{acc.address.toUpperCase()}</span>}
                  {acc.phone && <span>{acc.phone}</span>}
                </div>
              )}
              {acc.url && (
                <p
                  style={{
                    margin: 0,
                    fontFamily: FIELD_GUIDE_BODY_FAMILY,
                    fontSize: 13,
                    lineHeight: 1.55,
                    color: fieldGuideColors.soft,
                  }}
                >
                  <a href={acc.url} target="_blank" rel="noreferrer">
                    {acc.url}
                  </a>
                </p>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
