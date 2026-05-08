import { HeritageSectionFolio } from '../../components/HeritageSectionFolio';
import { HeritageHeading } from '../../components/HeritageHeading';
import { HeritageOrnamentRule } from '../../components/HeritageOrnamentRule';
import { useRevealOnScroll } from '../../hooks/useRevealOnScroll';
import type { HeritageAccommodation } from '../types';

interface PlanSectionProps {
  accommodations: HeritageAccommodation[];
  hospitalityNotes: string | null;
}

function AccommodationCard({ item, index }: { item: HeritageAccommodation; index: number }) {
  const romans = ['I', 'II', 'III', 'IV', 'V', 'VI'];
  return (
    <div className="flex flex-col gap-2 border p-6" style={{ borderColor: 'var(--hl-gold)' }}>
      <span
        className="text-lg italic"
        style={{ color: 'var(--hl-claret)', fontFamily: "'Cormorant Garamond', Georgia, serif" }}
      >
        {romans[index] ?? index + 1}
      </span>
      <HeritageHeading level={3}>{item.name}</HeritageHeading>
      {item.type && (
        <p
          className="text-xs uppercase tracking-widest"
          style={{ color: 'var(--hl-quill)', fontFamily: "'EB Garamond', Georgia, serif" }}
        >
          {item.type}
        </p>
      )}
      {item.address && (
        <p
          className="text-sm"
          style={{ color: 'var(--hl-ink)', fontFamily: "'EB Garamond', Georgia, serif" }}
        >
          {item.address}
        </p>
      )}
      {item.phone && (
        <p
          className="text-sm"
          style={{ color: 'var(--hl-quill)', fontFamily: "'EB Garamond', Georgia, serif" }}
        >
          {item.phone}
        </p>
      )}
    </div>
  );
}

export function PlanSection({ accommodations, hospitalityNotes }: PlanSectionProps) {
  const { ref, revealed } = useRevealOnScroll<HTMLDivElement>();
  if (!accommodations.length && !hospitalityNotes) return null;

  return (
    <section id="plan" className="mx-auto max-w-4xl px-6 py-16">
      <div ref={ref} className={`hl-section-head flex flex-col gap-8 ${revealed ? 'in' : ''}`}>
        <div className="flex items-center gap-3">
          <HeritageSectionFolio numeral="V" />
          <HeritageHeading level={2}>Plan Your Sojourn</HeritageHeading>
        </div>
        <HeritageOrnamentRule className="w-48" />
        {hospitalityNotes && (
          <p
            className="text-base leading-relaxed"
            style={{ color: 'var(--hl-ink)', fontFamily: "'EB Garamond', Georgia, serif" }}
          >
            {hospitalityNotes}
          </p>
        )}
        {accommodations.length > 0 && (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            {accommodations.map((item, i) => (
              <AccommodationCard key={i} item={item} index={i} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
