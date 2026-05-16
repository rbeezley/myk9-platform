import { MagazineHeading } from '../../components/MagazineHeading';
import { MagazineSectionFolio } from '../../components/MagazineSectionFolio';
import { useRevealOnScroll } from '../../hooks/useRevealOnScroll';

interface OnTheDaySectionProps {
  venueName: string | null;
  venueAddress: string | null;
  awardsDescription: string | null;
  houseRulesNotes: string | null;
  hospitalityNotes: string | null;
}

interface DayItem {
  title: string;
  body: string;
}

/**
 * "On the day" — bulleted list of awards / hospitality / house rules /
 * venue items rendered with a gold-star bullet glyph and dotted-gold
 * separator lines between each row.
 *
 * The list collapses gracefully — only non-null items appear, and if no
 * items qualify the whole section returns null. Hospitality is repeated
 * here as well as in `PlanSection` by design: the Welcome / Plan reading
 * journey covers the planning context, while On The Day surfaces the same
 * facts as a check-in checklist.
 */
export function OnTheDaySection({
  venueName,
  venueAddress,
  awardsDescription,
  houseRulesNotes,
  hospitalityNotes,
}: OnTheDaySectionProps) {
  const { ref, revealed } = useRevealOnScroll<HTMLDivElement>();

  const items: DayItem[] = [];

  const venueLine = [venueName, venueAddress].filter(Boolean).join(', ');
  if (venueLine) items.push({ title: 'The venue', body: venueLine });

  if (awardsDescription) items.push({ title: 'Awards & honours', body: awardsDescription });
  if (hospitalityNotes) items.push({ title: 'Hospitality', body: hospitalityNotes });
  if (houseRulesNotes) items.push({ title: 'House rules', body: houseRulesNotes });

  if (!items.length) return null;

  return (
    <section
      id="onday"
      className="mx-auto w-full max-w-[1280px] px-6 py-16 md:px-16 md:py-24"
      style={{ borderBottom: '1px solid var(--mz-ink)' }}
    >
      <div
        ref={ref}
        className={`mz-section-head mx-auto mb-16 max-w-3xl text-center ${revealed ? 'in' : ''}`}
      >
        <MagazineSectionFolio label="On the day" className="mb-6" />
        <MagazineHeading level={2}>
          What to <em className="em-gold">expect</em>
        </MagazineHeading>
      </div>

      <ul className="mx-auto w-full max-w-2xl list-none p-0">
        {items.map((item, i) => (
          <li
            key={item.title}
            className="grid items-baseline gap-4"
            style={{
              gridTemplateColumns: '24px 1fr',
              padding: '18px 0',
              borderBottom:
                i < items.length - 1 ? '1px dotted var(--mz-gold-2)' : '1px solid var(--mz-ink)',
            }}
          >
            <span
              aria-hidden="true"
              style={{
                color: 'var(--mz-gold-2)',
                fontSize: '12px',
                textAlign: 'center',
              }}
            >
              ★
            </span>
            <div>
              <div
                className="text-xs uppercase"
                style={{
                  color: 'var(--mz-gold-3)',
                  fontFamily: 'var(--mz-meta)',
                  letterSpacing: '0.32em',
                  marginBottom: '4px',
                }}
              >
                {item.title}
              </div>
              <div
                style={{
                  color: 'var(--mz-soft)',
                  fontFamily: 'var(--mz-body)',
                  fontSize: '16px',
                  lineHeight: 1.6,
                  whiteSpace: 'pre-line',
                }}
              >
                {item.body}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
