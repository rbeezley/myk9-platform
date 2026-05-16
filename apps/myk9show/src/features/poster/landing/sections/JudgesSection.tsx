import { PosterSectionHead } from '../../components/PosterSectionHead';
import { useRevealOnScroll } from '@/features/_shared/hooks/useRevealOnScroll';
import {
  POSTER_BODY_FAMILY,
  POSTER_DISPLAY_FAMILY,
  POSTER_MONO_FAMILY,
} from '../../fonts';
import { posterColors, posterSpacing } from '../../tokens';
import type { PosterJudge } from '../types';

interface JudgesSectionProps {
  judges: PosterJudge[];
  trialsCount: number;
}

/**
 * The Poster judges section — section №4. Two-column grid of judges, each
 * with a mono "TRIALS 01 · 03 · 05" label, an Archivo Black 56px name,
 * a mono city, and an Inter body bio with a red left border.
 */
export function JudgesSection({ judges, trialsCount }: JudgesSectionProps) {
  const { ref, revealed } = useRevealOnScroll<HTMLDivElement>();
  if (!judges.length) return null;

  const judgesCount = judges.length;
  const judgesNumeralWord = judgesCount === 1 ? 'One judge' : `${judgesCount} judges`;
  const trialsAccent =
    trialsCount > 0
      ? `${trialsCount} ${trialsCount === 1 ? 'trial' : 'trials'}.`
      : 'panel.';

  return (
    <section
      id="judges"
      className="po-section"
      style={{
        maxWidth: posterSpacing.contentMax,
        margin: '0 auto',
        padding: `${posterSpacing.sectionPaddingY}px ${posterSpacing.pageGutterX}px`,
        borderBottom: `2px solid ${posterColors.ink}`,
      }}
    >
      <PosterSectionHead number="04" label="Judges">
        {judgesNumeralWord},
        <br />
        <span style={{ color: posterColors.red }}>{trialsAccent}</span>
      </PosterSectionHead>

      <div
        ref={ref}
        className={`po-reveal po-judges ${revealed ? 'in' : ''}`}
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: 0,
          borderTop: `2px solid ${posterColors.ink}`,
          borderBottom: `2px solid ${posterColors.ink}`,
        }}
      >
        {judges.map((j, i) => {
          const isOdd = i % 2 === 1;
          return (
            <article
              key={j.id}
              style={{
                padding: isOdd ? '48px 0 48px 40px' : '48px 40px 48px 0',
                borderRight: isOdd ? 'none' : `1px solid ${posterColors.hair}`,
                position: 'relative',
              }}
            >
              {j.trialsLabel && (
                <div
                  style={{
                    fontFamily: POSTER_MONO_FAMILY,
                    fontWeight: 600,
                    fontSize: 12,
                    letterSpacing: '0.04em',
                    color: posterColors.red,
                    marginBottom: 18,
                  }}
                >
                  {j.trialsLabel}
                </div>
              )}
              <h3
                style={{
                  fontFamily: POSTER_DISPLAY_FAMILY,
                  fontWeight: 400,
                  fontSize: 56,
                  letterSpacing: '-0.035em',
                  lineHeight: 0.92,
                  color: posterColors.ink,
                  margin: '0 0 6px',
                }}
              >
                {j.name.toUpperCase()}
                <span style={{ color: posterColors.red }}>.</span>
              </h3>
              {j.city && (
                <div
                  style={{
                    fontFamily: POSTER_MONO_FAMILY,
                    fontSize: 12,
                    letterSpacing: '0.04em',
                    color: posterColors.mute,
                    marginBottom: 24,
                  }}
                >
                  {j.city.toUpperCase()}
                </div>
              )}
              {j.bio && (
                <p
                  style={{
                    fontFamily: POSTER_BODY_FAMILY,
                    fontSize: 14,
                    lineHeight: 1.65,
                    color: posterColors.inkSoft,
                    paddingLeft: 16,
                    borderLeft: `3px solid ${posterColors.red}`,
                    margin: 0,
                  }}
                >
                  {j.bio}
                </p>
              )}
              {j.elementPanel && !j.bio && (
                <p
                  style={{
                    fontFamily: POSTER_BODY_FAMILY,
                    fontSize: 14,
                    lineHeight: 1.65,
                    color: posterColors.inkSoft,
                    paddingLeft: 16,
                    borderLeft: `3px solid ${posterColors.red}`,
                    margin: 0,
                  }}
                >
                  {j.elementPanel}
                </p>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
