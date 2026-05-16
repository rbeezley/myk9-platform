import { PosterSectionHead } from '../../components/PosterSectionHead';
import { useRevealOnScroll } from '@/features/_shared/hooks/useRevealOnScroll';
import {
  POSTER_BODY_FAMILY,
  POSTER_DISPLAY_TIGHT_FAMILY,
  POSTER_MONO_FAMILY,
} from '../../fonts';
import { posterColors, posterSpacing } from '../../tokens';
import type { PosterOfficer } from '../types';

interface OfficersSectionProps {
  officers: PosterOfficer[];
  secretaryName: string | null;
  secretaryEmail: string | null;
}

/**
 * The Poster officers section — section №8. Three-column grid of officer
 * cards with mono red role label and Inter Tight 800 name (NOT Archivo
 * Black — names get too long at 24px+ for the column width).
 */
export function OfficersSection({
  officers,
  secretaryName,
  secretaryEmail,
}: OfficersSectionProps) {
  const { ref, revealed } = useRevealOnScroll<HTMLDivElement>();

  const items =
    officers.length > 0
      ? officers
      : secretaryName
        ? [{ title: 'Trial Secretary', name: secretaryName, email: secretaryEmail }]
        : [];

  if (items.length === 0) return null;

  const cols = Math.min(3, items.length);

  return (
    <section
      id="who"
      className="po-section"
      style={{
        maxWidth: posterSpacing.contentMax,
        margin: '0 auto',
        padding: `${posterSpacing.sectionPaddingY}px ${posterSpacing.pageGutterX}px`,
        borderBottom: `2px solid ${posterColors.ink}`,
      }}
    >
      <PosterSectionHead number="08" label="Committee">
        Who's
        <br />
        <span style={{ color: posterColors.red }}>running it.</span>
      </PosterSectionHead>

      <div
        ref={ref}
        className={`po-reveal po-officers ${revealed ? 'in' : ''}`}
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          gap: 0,
          borderTop: `2px solid ${posterColors.ink}`,
          borderBottom: `2px solid ${posterColors.ink}`,
        }}
      >
        {items.map((officer, i) => {
          const colInRow = i % cols;
          const isLastCol = colInRow === cols - 1;
          const rowIdx = Math.floor(i / cols);
          return (
            <article
              key={`${officer.title}-${i}`}
              style={{
                padding: '24px 28px',
                borderRight: isLastCol ? 'none' : `1px solid ${posterColors.hair}`,
                borderTop: rowIdx > 0 ? `1px solid ${posterColors.hair}` : 'none',
              }}
            >
              <div
                style={{
                  fontFamily: POSTER_MONO_FAMILY,
                  fontWeight: 600,
                  fontSize: 11,
                  letterSpacing: '0.04em',
                  color: posterColors.red,
                  marginBottom: 6,
                }}
              >
                {officer.title.toUpperCase()}
              </div>
              <div
                style={{
                  fontFamily: POSTER_DISPLAY_TIGHT_FAMILY,
                  fontWeight: 800,
                  fontSize: 18,
                  letterSpacing: '-0.015em',
                  color: posterColors.ink,
                }}
              >
                {officer.name}
              </div>
              {officer.email && (
                <a
                  href={`mailto:${officer.email}`}
                  style={{
                    display: 'block',
                    marginTop: 6,
                    fontFamily: POSTER_BODY_FAMILY,
                    fontSize: 13,
                    color: posterColors.mute,
                    textDecoration: 'none',
                  }}
                >
                  {officer.email}
                </a>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
