import { BannerContentRow } from '../../components/BannerContentRow';
import { BannerSectionHead } from '../../components/BannerSectionHead';
import { useRevealOnScroll } from '@/features/_shared/hooks/useRevealOnScroll';
import { BANNER_BODY_FAMILY, BANNER_DISPLAY_FAMILY } from '../../fonts';
import { bannerColors, bannerSpacing } from '../../tokens';
import type { BannerAccommodation } from '../types';

interface PlanSectionProps {
  accommodations: BannerAccommodation[];
  flag: string;
}

function formatLine(acc: BannerAccommodation): string {
  return [acc.type, acc.address, acc.phone].filter(Boolean).join(' · ');
}

export function PlanSection({ accommodations, flag }: PlanSectionProps) {
  const { ref, revealed } = useRevealOnScroll<HTMLDivElement>();
  if (!accommodations.length) return null;

  return (
    <section
      id="plan"
      className="bn-section"
      style={{
        padding: `${bannerSpacing.sectionPaddingY}px ${bannerSpacing.pageGutterX}px`,
        maxWidth: bannerSpacing.contentMax,
        margin: '0 auto',
      }}
    >
      <BannerSectionHead number="05" label="Plan" flag={flag}>
        Where <span style={{ color: flag }}>to stay.</span>
      </BannerSectionHead>

      <div ref={ref} className={`bn-reveal ${revealed ? 'in' : ''}`}>
        <BannerContentRow>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {accommodations.map((acc, i) => (
            <li
              key={`${acc.name}-${i}`}
              style={{
                padding: '20px 0',
                borderBottom:
                  i === accommodations.length - 1 ? 'none' : `1px solid ${bannerColors.hair}`,
                display: 'grid',
                gridTemplateColumns: '1fr 2fr',
                gap: 24,
                alignItems: 'baseline',
              }}
            >
              <strong
                style={{
                  fontFamily: BANNER_DISPLAY_FAMILY,
                  fontWeight: 700,
                  fontSize: 18,
                  letterSpacing: '-0.02em',
                  color: bannerColors.ink,
                }}
              >
                {acc.name}
              </strong>
              <span
                style={{
                  fontFamily: BANNER_BODY_FAMILY,
                  fontSize: 14,
                  lineHeight: 1.55,
                  color: bannerColors.soft,
                }}
              >
                {formatLine(acc) || '—'}
              </span>
            </li>
          ))}
        </ul>
        </BannerContentRow>
      </div>
    </section>
  );
}
