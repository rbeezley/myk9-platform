import { PosterSectionHead } from '../../components/PosterSectionHead';
import { useRevealOnScroll } from '@/features/_shared/hooks/useRevealOnScroll';
import {
  POSTER_BODY_FAMILY,
  POSTER_DISPLAY_FAMILY,
  POSTER_MONO_FAMILY,
} from '../../fonts';
import { posterColors, posterSpacing } from '../../tokens';
import type { PosterAccommodation } from '../types';

interface PlanSectionProps {
  accommodations: PosterAccommodation[];
}

function formatMeta(acc: PosterAccommodation): string {
  return [acc.type, acc.address, acc.phone].filter(Boolean).join(' · ').toUpperCase();
}

/**
 * The Poster plan section — section №7. Card grid (2 columns) of
 * accommodations with mono kicker, Archivo Black title, mono meta line,
 * and Inter body description.
 */
export function PlanSection({ accommodations }: PlanSectionProps) {
  const { ref, revealed } = useRevealOnScroll<HTMLDivElement>();
  if (!accommodations.length) return null;

  return (
    <section
      id="plan"
      className="po-section"
      style={{
        maxWidth: posterSpacing.contentMax,
        margin: '0 auto',
        padding: `${posterSpacing.sectionPaddingY}px ${posterSpacing.pageGutterX}px`,
        borderBottom: `2px solid ${posterColors.ink}`,
      }}
    >
      <PosterSectionHead number="07" label="Plan">
        Where to stay.
        <br />
        <span style={{ color: 'transparent', WebkitTextStroke: `2px ${posterColors.ink}` }}>
          Where to eat.
        </span>
      </PosterSectionHead>

      <div
        ref={ref}
        className={`po-reveal po-cards ${revealed ? 'in' : ''}`}
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: 0,
          borderTop: `2px solid ${posterColors.ink}`,
          borderBottom: `2px solid ${posterColors.ink}`,
        }}
      >
        {accommodations.map((acc, i) => {
          const isOdd = i % 2 === 1;
          const isPastFirstRow = i >= 2;
          return (
            <article
              key={`${acc.name}-${i}`}
              style={{
                padding: '32px 36px',
                borderRight: isOdd ? 'none' : `1px solid ${posterColors.hair}`,
                borderTop: isPastFirstRow ? `1px solid ${posterColors.hair}` : 'none',
              }}
            >
              <div
                style={{
                  fontFamily: POSTER_MONO_FAMILY,
                  fontWeight: 600,
                  fontSize: 11,
                  letterSpacing: '0.04em',
                  color: posterColors.red,
                  marginBottom: 10,
                }}
              >
                {(acc.type ?? 'HOTEL').toUpperCase()} · {String(i + 1).padStart(2, '0')}
              </div>
              <h3
                style={{
                  fontFamily: POSTER_DISPLAY_FAMILY,
                  fontWeight: 400,
                  fontSize: 32,
                  letterSpacing: '-0.025em',
                  lineHeight: 0.95,
                  color: posterColors.ink,
                  margin: '0 0 8px',
                }}
              >
                {acc.name.toUpperCase()}
              </h3>
              <div
                style={{
                  fontFamily: POSTER_MONO_FAMILY,
                  fontSize: 12,
                  color: posterColors.mute,
                  letterSpacing: '0.04em',
                  marginBottom: 14,
                }}
              >
                {formatMeta(acc) || '—'}
              </div>
              {acc.url && (
                <a
                  href={acc.url}
                  style={{
                    fontFamily: POSTER_BODY_FAMILY,
                    fontSize: 14,
                    lineHeight: 1.6,
                    color: posterColors.inkSoft,
                    textDecoration: 'underline',
                  }}
                >
                  Visit website →
                </a>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
