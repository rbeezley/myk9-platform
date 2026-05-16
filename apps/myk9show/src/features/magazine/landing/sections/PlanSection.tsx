import { MagazineHeading } from '../../components/MagazineHeading';
import { MagazineSectionFolio } from '../../components/MagazineSectionFolio';
import { useRevealOnScroll } from '../../hooks/useRevealOnScroll';
import { toLowerRoman } from '../useMagazineLandingData';
import type { MagazineAccommodation } from '../types';

interface PlanSectionProps {
  accommodations: MagazineAccommodation[];
  hospitalityNotes: string | null;
}

function PlanCard({ item, index }: { item: MagazineAccommodation; index: number }) {
  const numLabel = item.type
    ? `${item.type} · ${toLowerRoman(index + 1)}`
    : `Lodging · ${toLowerRoman(index + 1)}`;

  return (
    <article className="flex flex-col">
      <header
        className="pb-3"
        style={{ borderBottom: '1px solid var(--mz-ink)', marginBottom: '18px' }}
      >
        <div
          className="text-xs uppercase"
          style={{
            color: 'var(--mz-gold-3)',
            fontFamily: 'var(--mz-meta)',
            letterSpacing: '0.32em',
            marginBottom: '8px',
          }}
        >
          {numLabel}
        </div>
        <MagazineHeading level={3} className="mb-1.5">
          {item.name}
        </MagazineHeading>
        {(item.address || item.phone) && (
          <div
            className="italic"
            style={{
              color: 'var(--mz-quill)',
              fontFamily: 'var(--mz-display)',
              fontSize: '15px',
            }}
          >
            {[item.address, item.phone].filter(Boolean).join(' · ')}
          </div>
        )}
      </header>

      {item.url && (
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="self-start underline"
          style={{
            color: 'var(--mz-ink)',
            fontFamily: 'var(--mz-body)',
            fontSize: '14px',
          }}
        >
          Open in maps ↗
        </a>
      )}
    </article>
  );
}

/**
 * "Plan your weekend" — editorial gallery of lodging recommendations + an
 * optional hospitality note paragraph.
 *
 * Each card is plain text (no border around the card body — the only rule
 * is a 1px ink hairline under the header), which keeps the visual weight
 * on the typography rather than on box decoration. This is a deliberate
 * departure from Heritage's `border: 1px solid var(--hl-gold)` cards.
 *
 * Returns null when there's no content at all.
 */
export function PlanSection({ accommodations, hospitalityNotes }: PlanSectionProps) {
  const { ref, revealed } = useRevealOnScroll<HTMLDivElement>();
  if (!accommodations.length && !hospitalityNotes) return null;

  return (
    <section
      id="plan"
      className="mx-auto w-full max-w-[1280px] px-6 py-16 md:px-16 md:py-24"
      style={{ borderBottom: '1px solid var(--mz-ink)' }}
    >
      <div
        ref={ref}
        className={`mz-section-head mx-auto mb-16 max-w-3xl text-center ${revealed ? 'in' : ''}`}
      >
        <MagazineSectionFolio label="Plan your weekend" className="mb-6" />
        <MagazineHeading level={2}>
          Where to <em className="em-gold">stay</em>, where to{' '}
          <em className="em-gold">eat</em>
        </MagazineHeading>
      </div>

      {hospitalityNotes && (
        <p
          className="mx-auto mb-12 max-w-2xl text-center"
          style={{
            color: 'var(--mz-soft)',
            fontFamily: 'var(--mz-body)',
            fontSize: '17px',
            lineHeight: 1.7,
          }}
        >
          {hospitalityNotes}
        </p>
      )}

      {accommodations.length > 0 && (
        <div className="mx-auto grid w-full max-w-[1080px] grid-cols-1 gap-12 sm:grid-cols-2">
          {accommodations.map((item, i) => (
            <PlanCard key={`${item.name}-${i}`} item={item} index={i} />
          ))}
        </div>
      )}
    </section>
  );
}
