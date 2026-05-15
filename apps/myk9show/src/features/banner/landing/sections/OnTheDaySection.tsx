import { BannerSectionHead } from '../../components/BannerSectionHead';
import { useRevealOnScroll } from '@/features/_shared/hooks/useRevealOnScroll';
import { BANNER_BODY_FAMILY } from '../../fonts';
import { bannerColors, bannerSpacing } from '../../tokens';
import type { BannerOnDayItem } from '../types';

interface OnTheDaySectionProps {
  items: BannerOnDayItem[];
  hospitalityNotes: string | null;
  flag: string;
}

export function OnTheDaySection({ items, hospitalityNotes, flag }: OnTheDaySectionProps) {
  const { ref, revealed } = useRevealOnScroll<HTMLDivElement>();

  const all: BannerOnDayItem[] = [
    ...items,
    ...(hospitalityNotes ? [{ label: 'Hospitality', value: hospitalityNotes }] : []),
  ];

  if (all.length === 0) return null;

  return (
    <section
      id="onday"
      className="bn-section"
      style={{
        padding: `${bannerSpacing.sectionPaddingY}px ${bannerSpacing.pageGutterX}px`,
        maxWidth: bannerSpacing.contentMax,
        margin: '0 auto',
      }}
    >
      <BannerSectionHead number="06" label="On the day" flag={flag}>
        Doors <span style={{ color: flag }}>open.</span>
      </BannerSectionHead>

      <div
        ref={ref}
        className={`bn-reveal ${revealed ? 'in' : ''}`}
        style={{
          display: 'grid',
          gridTemplateColumns: '240px 1fr',
          gap: 32,
        }}
      >
        <div />
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: '24px 48px',
          }}
        >
          {all.map((item, i) => (
            <div key={`${item.label}-${i}`}>
              <div
                style={{
                  fontFamily: BANNER_BODY_FAMILY,
                  fontWeight: 500,
                  fontSize: 10,
                  letterSpacing: '0.28em',
                  textTransform: 'uppercase',
                  color: bannerColors.mute,
                  marginBottom: 6,
                }}
              >
                {item.label}
              </div>
              <div
                style={{
                  fontFamily: BANNER_BODY_FAMILY,
                  fontSize: 15,
                  lineHeight: 1.55,
                  color: bannerColors.soft,
                  whiteSpace: 'pre-line',
                }}
              >
                {item.value}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
