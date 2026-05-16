import { useRevealOnScroll } from '@/features/_shared/hooks/useRevealOnScroll';
import { FieldGuideSectionHead } from '../../components/FieldGuideSectionHead';
import { FIELD_GUIDE_BODY_FAMILY, FIELD_GUIDE_MONO_FAMILY } from '../../fonts';
import { fieldGuideColors, fieldGuideSpacing } from '../../tokens';
import type { FieldGuideOnDayItem } from '../types';

interface ScheduleSectionProps {
  items: FieldGuideOnDayItem[];
  hospitalityNotes: string | null;
}

/**
 * §06 Show hours — a flat label/value list scoped to "the day." When
 * the data set is rich enough we expand to a full mono timetable; for
 * now we surface label/value pairs in a 2-column grid.
 */
export function ScheduleSection({ items, hospitalityNotes }: ScheduleSectionProps) {
  const { ref, revealed } = useRevealOnScroll<HTMLDivElement>();

  const all: FieldGuideOnDayItem[] = [
    ...items,
    ...(hospitalityNotes ? [{ label: 'Hospitality', value: hospitalityNotes }] : []),
  ];

  if (all.length === 0) return null;

  return (
    <section
      id="§06"
      className="fg-section"
      style={{
        maxWidth: fieldGuideSpacing.contentMax,
        margin: '0 auto',
        padding: `${fieldGuideSpacing.sectionPaddingY}px ${fieldGuideSpacing.pageGutterX}px`,
      }}
    >
      <FieldGuideSectionHead folio="§06" title="Show hours" meta="EACH DAY" />

      <div
        ref={ref}
        className={`fg-reveal ${revealed ? 'in' : ''}`}
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: '24px 48px',
        }}
      >
        {all.map((item, i) => (
          <div key={`${item.label}-${i}`}>
            <div
              style={{
                fontFamily: FIELD_GUIDE_MONO_FAMILY,
                fontWeight: 500,
                fontSize: 10,
                letterSpacing: '0.04em',
                color: fieldGuideColors.mute,
                textTransform: 'uppercase',
                marginBottom: 6,
              }}
            >
              {item.label}
            </div>
            <div
              style={{
                fontFamily: FIELD_GUIDE_BODY_FAMILY,
                fontSize: 15,
                lineHeight: 1.55,
                color: fieldGuideColors.soft,
                whiteSpace: 'pre-line',
              }}
            >
              {item.value}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
