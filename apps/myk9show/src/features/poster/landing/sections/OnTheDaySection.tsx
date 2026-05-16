import { PosterSectionHead } from '../../components/PosterSectionHead';
import { useRevealOnScroll } from '@/features/_shared/hooks/useRevealOnScroll';
import {
  POSTER_BODY_FAMILY,
  POSTER_DISPLAY_FAMILY,
  POSTER_MONO_FAMILY,
} from '../../fonts';
import { posterColors, posterSpacing } from '../../tokens';
import type { PosterOnDayItem } from '../types';

interface OnTheDaySectionProps {
  items: PosterOnDayItem[];
  hospitalityNotes: string | null;
}

/**
 * The Poster on-the-day section — section №6. Olive dark band with mono
 * folio and Archivo Black title in cream, then a 2-column grid of
 * doors/parking/crating/etc.
 */
export function OnTheDaySection({ items, hospitalityNotes }: OnTheDaySectionProps) {
  const { ref, revealed } = useRevealOnScroll<HTMLDivElement>();

  const all: PosterOnDayItem[] = [
    ...items,
    ...(hospitalityNotes ? [{ label: 'Hospitality', value: hospitalityNotes }] : []),
  ];

  if (all.length === 0) return null;

  return (
    <section
      id="onday"
      className="po-section po-section--olive"
      style={{
        background: posterColors.olive,
        color: posterColors.cream,
        padding: `${posterSpacing.sectionPaddingY}px ${posterSpacing.pageGutterX}px`,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div style={{ maxWidth: posterSpacing.contentMax, margin: '0 auto' }}>
        <PosterSectionHead
          number="06"
          label="On the day"
          titleColor={posterColors.cream}
        >
          From here
          <br />
          to <span style={{ color: posterColors.red }}>trial day.</span>
        </PosterSectionHead>

        <div
          ref={ref}
          className={`po-reveal ${revealed ? 'in' : ''}`}
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: '0',
            borderTop: `2px solid ${posterColors.cream}`,
          }}
        >
          {all.map((item, i) => {
            const isOdd = i % 2 === 1;
            return (
              <div
                key={`${item.label}-${i}`}
                style={{
                  padding: '24px 28px 24px 0',
                  paddingLeft: isOdd ? 28 : 0,
                  paddingRight: isOdd ? 0 : 28,
                  borderRight: isOdd ? 'none' : `1px solid rgba(243,237,224,0.18)`,
                  borderBottom: `1px solid rgba(243,237,224,0.18)`,
                }}
              >
                <div
                  style={{
                    fontFamily: POSTER_MONO_FAMILY,
                    fontWeight: 600,
                    fontSize: 11,
                    letterSpacing: '0.04em',
                    color: 'rgba(243,237,224,0.6)',
                    marginBottom: 8,
                    textTransform: 'uppercase',
                  }}
                >
                  {item.label}
                </div>
                <div
                  style={{
                    fontFamily: POSTER_DISPLAY_FAMILY,
                    fontWeight: 400,
                    fontSize: 28,
                    letterSpacing: '-0.025em',
                    color: posterColors.cream,
                    marginBottom: 6,
                  }}
                >
                  {item.value.split('\n')[0]}
                </div>
                {item.value.includes('\n') && (
                  <div
                    style={{
                      fontFamily: POSTER_BODY_FAMILY,
                      fontSize: 14,
                      lineHeight: 1.5,
                      color: 'rgba(243,237,224,0.85)',
                      whiteSpace: 'pre-line',
                    }}
                  >
                    {item.value.split('\n').slice(1).join('\n')}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
