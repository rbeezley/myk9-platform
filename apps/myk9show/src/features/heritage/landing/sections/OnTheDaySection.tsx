import { HeritageSectionFolio } from '../../components/HeritageSectionFolio';
import { HeritageHeading } from '../../components/HeritageHeading';
import { HeritageOrnamentRule } from '../../components/HeritageOrnamentRule';
import { useRevealOnScroll } from '../../hooks/useRevealOnScroll';

interface OnTheDaySectionProps {
  venueName: string | null;
  venueAddress: string | null;
  awardsDescription: string | null;
  houseRulesNotes: string | null;
  hospitalityNotes: string | null;
}

interface DayCard {
  title: string;
  body: string | null;
}

export function OnTheDaySection({
  venueName,
  venueAddress,
  awardsDescription,
  houseRulesNotes,
  hospitalityNotes,
}: OnTheDaySectionProps) {
  const { ref, revealed } = useRevealOnScroll<HTMLDivElement>();

  const cards: DayCard[] = [
    { title: 'The Venue', body: [venueName, venueAddress].filter(Boolean).join('\n') || null },
    { title: 'Awards & Honours', body: awardsDescription },
    { title: 'Hospitality', body: hospitalityNotes },
    { title: 'House Rules', body: houseRulesNotes },
  ].filter(c => c.body);

  if (!cards.length) return null;

  return (
    <section id="day" className="mx-auto max-w-4xl px-6 py-16">
      <div ref={ref} className={`hl-section-head flex flex-col gap-8 ${revealed ? 'in' : ''}`}>
        <div className="flex items-center gap-3">
          <HeritageSectionFolio numeral="VI" />
          <HeritageHeading level={2}>On the Day</HeritageHeading>
        </div>
        <HeritageOrnamentRule className="w-48" />
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          {cards.map(card => (
            <div
              key={card.title}
              className="flex flex-col gap-2 border p-6"
              style={{ borderColor: 'var(--hl-gold)' }}
            >
              <HeritageHeading level={3}>{card.title}</HeritageHeading>
              <p
                className="whitespace-pre-line text-sm leading-relaxed"
                style={{ color: 'var(--hl-ink)', fontFamily: "'EB Garamond', Georgia, serif" }}
              >
                {card.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
