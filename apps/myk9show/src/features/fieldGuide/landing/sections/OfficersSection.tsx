import { useRevealOnScroll } from '@/features/_shared/hooks/useRevealOnScroll';
import { FieldGuideSectionHead } from '../../components/FieldGuideSectionHead';
import { FIELD_GUIDE_DISPLAY_FAMILY, FIELD_GUIDE_MONO_FAMILY } from '../../fonts';
import { fieldGuideColors, fieldGuideSpacing } from '../../tokens';
import type { FieldGuideOfficer } from '../types';

interface OfficersSectionProps {
  officers: FieldGuideOfficer[];
  secretaryName: string | null;
  secretaryEmail: string | null;
}

/**
 * §08 Trial committee — 4-column compact roster of officer roles. When
 * the source data only carries a secretary, we synthesize a single-cell
 * fallback so the section still surfaces. If neither, we render nothing.
 */
export function OfficersSection({
  officers,
  secretaryName,
  secretaryEmail,
}: OfficersSectionProps) {
  const { ref, revealed } = useRevealOnScroll<HTMLDivElement>();

  const items: FieldGuideOfficer[] =
    officers.length > 0
      ? officers
      : secretaryName
        ? [{ title: 'Trial Secretary', name: secretaryName, email: secretaryEmail }]
        : [];

  if (items.length === 0) return null;

  const cols = Math.min(4, items.length);

  return (
    <section
      id="§08"
      className="fg-section"
      style={{
        maxWidth: fieldGuideSpacing.contentMax,
        margin: '0 auto',
        padding: `${fieldGuideSpacing.sectionPaddingY}px ${fieldGuideSpacing.pageGutterX}px`,
      }}
    >
      <FieldGuideSectionHead
        folio="§08"
        title="Trial committee"
        meta={`${items.length} OFFICER${items.length === 1 ? '' : 'S'}`}
      />
      <div
        ref={ref}
        className={`fg-reveal ${revealed ? 'in' : ''}`}
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          gap: 0,
          borderTop: `2px solid ${fieldGuideColors.ink}`,
          borderBottom: `2px solid ${fieldGuideColors.ink}`,
        }}
      >
        {items.map((officer, i) => (
          <article
            key={`${officer.title}-${i}`}
            style={{
              padding: '14px 16px',
              borderRight:
                (i + 1) % cols === 0 || i === items.length - 1
                  ? 'none'
                  : `1px solid ${fieldGuideColors.hair}`,
            }}
          >
            <div
              style={{
                fontFamily: FIELD_GUIDE_MONO_FAMILY,
                fontWeight: 600,
                fontSize: 10,
                letterSpacing: '0.04em',
                color: fieldGuideColors.mute,
                textTransform: 'uppercase',
                marginBottom: 4,
              }}
            >
              {officer.title}
            </div>
            <div
              style={{
                fontFamily: FIELD_GUIDE_DISPLAY_FAMILY,
                fontWeight: 600,
                fontSize: 15,
                letterSpacing: '-0.005em',
                color: fieldGuideColors.ink,
              }}
            >
              {officer.name}
            </div>
            {officer.email && (
              <a
                href={`mailto:${officer.email}`}
                style={{
                  display: 'block',
                  marginTop: 4,
                  fontFamily: FIELD_GUIDE_MONO_FAMILY,
                  fontWeight: 500,
                  fontSize: 11,
                  letterSpacing: '0.04em',
                  color: fieldGuideColors.mute,
                  textDecoration: 'none',
                }}
              >
                {officer.email}
              </a>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
