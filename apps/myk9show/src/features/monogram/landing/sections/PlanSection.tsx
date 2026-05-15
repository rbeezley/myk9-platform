import { MonogramSectionHead } from '../../components/MonogramSectionHead';
import { useRevealOnScroll } from '@/features/_shared/hooks/useRevealOnScroll';
import { MONOGRAM_BODY_FAMILY, MONOGRAM_DISPLAY_FAMILY } from '../../fonts';
import { monogramColors } from '../../tokens';
import type { MonogramAccommodation, MonogramPlanItem } from '../types';

interface PlanSectionProps {
  accommodations: MonogramAccommodation[];
  hospitalityNotes: string | null;
}

/**
 * Plan + On the day — folio v. The Monogram mock collapses what Heritage
 * splits into two separate sections (PlanSection + OnTheDaySection) into a
 * single two-column folio: "On the day" on the left, "Where to stay" on the
 * right.
 *
 * Both columns are styled definition lists with dotted-underline separators.
 * `value-body` rows (longer text) render in Crimson Pro 15px; short display
 * values render in Bodoni Moda 18px.
 */
export function PlanSection({ accommodations, hospitalityNotes }: PlanSectionProps) {
  const { ref, revealed } = useRevealOnScroll<HTMLDivElement>();

  const hasOnDay = !!hospitalityNotes;
  const hasStays = accommodations.length > 0;
  if (!hasOnDay && !hasStays) return null;

  // "On the day" currently surfaces only the hospitality notes field. Once
  // the schema grows structured day-of-event data, populate this list from
  // the hook rather than building inline here.
  const onDayItems: MonogramPlanItem[] = hospitalityNotes
    ? [{ label: 'Hospitality', value: hospitalityNotes, isBody: true }]
    : [];

  return (
    <section className="mg-section" id="plan">
      <MonogramSectionHead
        numeral="v"
        eyebrow="Plan your weekend"
        title={
          <>
            On the day{' '}
            <span style={{ fontStyle: 'italic', color: monogramColors.bronze }}>&amp;</span> getting
            there
          </>
        }
      />

      <div
        ref={ref}
        className={`mg-twocol ${revealed ? 'in' : ''}`}
        style={{
          display: 'grid',
          gridTemplateColumns: hasOnDay && hasStays ? '1fr 1fr' : '1fr',
          gap: 56,
        }}
      >
        {hasOnDay && (
          <div>
            <h3 style={columnHeadingStyle}>
              On the <span style={{ fontStyle: 'italic', color: monogramColors.bronze }}>day</span>
            </h3>
            <DefinitionList items={onDayItems} />
          </div>
        )}

        {hasStays && (
          <div>
            <h3 style={columnHeadingStyle}>
              Where{' '}
              <span style={{ fontStyle: 'italic', color: monogramColors.bronze }}>to stay</span>
            </h3>
            <DefinitionList
              items={accommodations.map(acc => ({
                label: acc.name,
                value: formatAccommodationLine(acc),
                isBody: true,
              }))}
            />
          </div>
        )}
      </div>
    </section>
  );
}

function formatAccommodationLine(acc: MonogramAccommodation): string {
  const parts = [acc.type, acc.address, acc.phone].filter(Boolean);
  return parts.join(' · ');
}

interface DefItem {
  label: string;
  value: string;
  isBody?: boolean;
}

function DefinitionList({ items }: { items: DefItem[] }) {
  return (
    <ul
      style={{
        listStyle: 'none',
        padding: 0,
        margin: 0,
      }}
    >
      {items.map((item, i) => (
        <li
          key={`${item.label}-${i}`}
          style={{
            padding: '14px 0',
            borderBottom: i === items.length - 1 ? 'none' : '1px dotted rgba(28, 24, 21, 0.2)',
            display: 'grid',
            gridTemplateColumns: '140px 1fr',
            gap: 20,
            alignItems: 'baseline',
          }}
        >
          <span
            style={{
              fontFamily: MONOGRAM_BODY_FAMILY,
              fontSize: 11,
              fontWeight: 500,
              letterSpacing: '0.32em',
              textTransform: 'uppercase',
              color: monogramColors.bronze,
            }}
          >
            {item.label}
          </span>
          <span
            style={
              item.isBody
                ? {
                    fontFamily: MONOGRAM_BODY_FAMILY,
                    fontSize: 15,
                    color: monogramColors.soft,
                    lineHeight: 1.55,
                  }
                : {
                    fontFamily: MONOGRAM_DISPLAY_FAMILY,
                    fontSize: 18,
                    color: monogramColors.ink,
                  }
            }
          >
            {item.value}
          </span>
        </li>
      ))}
    </ul>
  );
}

const columnHeadingStyle: React.CSSProperties = {
  fontFamily: MONOGRAM_DISPLAY_FAMILY,
  fontSize: 28,
  letterSpacing: '-0.015em',
  color: monogramColors.ink,
  marginBottom: 20,
  marginTop: 0,
  paddingBottom: 12,
  borderBottom: `1px solid ${monogramColors.ink}`,
  fontWeight: 400,
  lineHeight: 1.1,
};
