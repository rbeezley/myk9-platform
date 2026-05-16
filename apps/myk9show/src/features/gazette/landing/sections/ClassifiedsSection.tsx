import { GazetteSectionHead } from '../../components/GazetteSectionHead';
import { GazetteClassifiedBox } from '../../components/GazetteClassifiedBox';
import type { GazetteAccommodation } from '../types';

interface ClassifiedsSectionProps {
  accommodations: GazetteAccommodation[];
  hospitalityNotes: string | null;
  awardsDescription: string | null;
  volumeRoman: string;
}

/**
 * Section F · Classifieds — a 3-column grid of bordered cards covering
 * lodging, vet, hospitality, awards. Each card renders via the shared
 * <GazetteClassifiedBox> primitive.
 *
 * Returns null if absolutely nothing to advertise — Gazette would rather
 * skip the section than print empty boxes.
 */
export function ClassifiedsSection({
  accommodations,
  hospitalityNotes,
  awardsDescription,
  volumeRoman,
}: ClassifiedsSectionProps) {
  const cards: Array<{
    key: string;
    category: string;
    title: React.ReactNode;
    body: React.ReactNode;
    meta: string | null;
  }> = [];

  accommodations.forEach((a, i) => {
    cards.push({
      key: `accom-${i}`,
      category: a.meta ?? a.type ?? 'LISTING',
      title: a.name,
      body: (
        <>
          {a.address && <div>{a.address}</div>}
          {a.description && <p className="mt-1">{a.description}</p>}
        </>
      ),
      meta: a.phone ?? null,
    });
  });

  if (hospitalityNotes) {
    cards.push({
      key: 'hospitality',
      category: 'VICTUALS · ON SITE',
      title: 'Hospitality',
      body: hospitalityNotes,
      meta: 'COMPLIMENTARY',
    });
  }

  if (awardsDescription) {
    cards.push({
      key: 'awards',
      category: 'AWARDS',
      title: <>Ribbons <em>&amp; trophies</em></>,
      body: awardsDescription,
      meta: 'PRESENTED END OF DAY',
    });
  }

  if (!cards.length) return null;

  return (
    <section
      id="plan"
      className="mx-auto max-w-[1100px] border-b px-6 py-12 md:px-12 md:py-14"
      style={{ borderColor: 'var(--gz-ink)' }}
    >
      <GazetteSectionHead
        sectionLetter="F"
        pageRuleTitle="CLASSIFIEDS"
        page={6}
        volume={volumeRoman}
        kicker="Classified advertisements"
        title={<>Lodging, <em>victuals &amp; vet</em></>}
      />
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map(card => (
          <GazetteClassifiedBox
            key={card.key}
            category={card.category}
            title={card.title}
            body={card.body}
            meta={card.meta}
          />
        ))}
      </div>
    </section>
  );
}
