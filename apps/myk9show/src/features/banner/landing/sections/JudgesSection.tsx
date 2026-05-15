import { BannerSectionHead } from '../../components/BannerSectionHead';
import { useRevealOnScroll } from '@/features/_shared/hooks/useRevealOnScroll';
import { BANNER_BODY_FAMILY, BANNER_DISPLAY_FAMILY } from '../../fonts';
import { bannerColors, bannerSpacing } from '../../tokens';
import type { BannerJudge } from '../types';

interface JudgesSectionProps {
  judges: BannerJudge[];
  trialsCount: number;
  flag: string;
}

export function JudgesSection({ judges, trialsCount, flag }: JudgesSectionProps) {
  const { ref, revealed } = useRevealOnScroll<HTMLDivElement>();
  if (!judges.length) return null;

  const judgesCount = judges.length;
  const judgeNumeral = judgesCount === 1 ? 'One judge' : `${judgesCount} judges`;
  const trialsAccent =
    trialsCount > 0 ? `${trialsCount} ${trialsCount === 1 ? 'trial.' : 'trials.'}` : 'panel.';

  return (
    <section
      id="judges"
      className="bn-section"
      style={{
        padding: `${bannerSpacing.sectionPaddingY}px ${bannerSpacing.pageGutterX}px`,
        maxWidth: bannerSpacing.contentMax,
        margin: '0 auto',
      }}
    >
      <BannerSectionHead number="03" label="Judges" flag={flag}>
        {judgeNumeral}, <span style={{ color: flag }}>{trialsAccent}</span>
      </BannerSectionHead>

      <div
        ref={ref}
        className={`bn-reveal bn-judges ${revealed ? 'in' : ''}`}
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: 0,
          borderTop: `2px solid ${bannerColors.ink}`,
        }}
      >
        {judges.map((j, i) => {
          // Determine "last row" for an N-column grid where N=2. With an even
          // judge count, the last 2 cards are the bottom row; with odd, only
          // the last card is. We use that to drop the bottom border so the
          // outer rule doubles instead of stacking with an inner hairline.
          const lastRowSize = judges.length % 2 === 0 ? 2 : 1;
          const isLastRow = i >= judges.length - lastRowSize;
          return (
            <article
              key={j.id}
              style={{
                padding: '40px 32px 40px 0',
                borderRight:
                  i % 2 === 0 && i !== judges.length - 1
                    ? `1px solid ${bannerColors.hair}`
                    : 'none',
                borderBottom: isLastRow ? 'none' : `1px solid ${bannerColors.hair}`,
                paddingLeft: i % 2 === 1 ? 32 : 0,
                paddingRight: i % 2 === 0 ? 32 : 0,
              }}
            >
            {j.trialsLabel && (
              <div
                style={{
                  fontFamily: BANNER_BODY_FAMILY,
                  fontWeight: 500,
                  fontSize: 10,
                  letterSpacing: '0.28em',
                  textTransform: 'uppercase',
                  color: flag,
                  marginBottom: 12,
                }}
              >
                {j.trialsLabel}
              </div>
            )}
            <h3
              style={{
                fontFamily: BANNER_DISPLAY_FAMILY,
                fontWeight: 800,
                fontSize: 28,
                letterSpacing: '-0.025em',
                lineHeight: 1.05,
                color: bannerColors.ink,
                margin: '0 0 6px',
              }}
            >
              {j.name}
            </h3>
            {j.city && (
              <div
                style={{
                  fontFamily: BANNER_BODY_FAMILY,
                  fontSize: 13,
                  color: bannerColors.mute,
                  marginBottom: 16,
                }}
              >
                {j.city}
              </div>
            )}
            {j.elementPanel && (
              <p
                style={{
                  fontFamily: BANNER_BODY_FAMILY,
                  fontSize: 14,
                  lineHeight: 1.6,
                  color: bannerColors.soft,
                  margin: 0,
                }}
              >
                <span
                  style={{
                    fontFamily: BANNER_BODY_FAMILY,
                    fontWeight: 500,
                    fontSize: 10,
                    letterSpacing: '0.2em',
                    textTransform: 'uppercase',
                    color: bannerColors.mute,
                    display: 'block',
                    marginBottom: 6,
                  }}
                >
                  Element panel
                </span>
                {j.elementPanel}
              </p>
            )}
            {j.bio && (
              <p
                style={{
                  marginTop: 16,
                  fontFamily: BANNER_BODY_FAMILY,
                  fontSize: 14,
                  lineHeight: 1.6,
                  color: bannerColors.soft,
                }}
              >
                {j.bio}
              </p>
            )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
