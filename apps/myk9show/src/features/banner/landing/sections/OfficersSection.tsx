import { BannerSectionHead } from '../../components/BannerSectionHead';
import { useRevealOnScroll } from '@/features/_shared/hooks/useRevealOnScroll';
import { BANNER_BODY_FAMILY, BANNER_DISPLAY_FAMILY } from '../../fonts';
import { bannerColors, bannerSpacing } from '../../tokens';
import type { BannerOfficer } from '../types';

interface OfficersSectionProps {
  officers: BannerOfficer[];
  secretaryName: string | null;
  secretaryEmail: string | null;
  flag: string;
}

export function OfficersSection({
  officers,
  secretaryName,
  secretaryEmail,
  flag,
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
      className="bn-section"
      style={{
        padding: `${bannerSpacing.sectionPaddingY}px ${bannerSpacing.pageGutterX}px`,
        maxWidth: bannerSpacing.contentMax,
        margin: '0 auto',
      }}
    >
      <BannerSectionHead number="07" label="Who" flag={flag}>
        Officers <span style={{ color: flag }}>& staff.</span>
      </BannerSectionHead>

      <div
        ref={ref}
        className={`bn-reveal ${revealed ? 'in' : ''}`}
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          gap: 0,
          borderTop: `2px solid ${bannerColors.ink}`,
        }}
      >
        {items.map((officer, i) => (
          <article
            key={`${officer.title}-${i}`}
            style={{
              padding: '32px 24px',
              borderRight:
                (i + 1) % cols === 0 || i === items.length - 1
                  ? 'none'
                  : `1px solid ${bannerColors.hair}`,
            }}
          >
            <div
              style={{
                fontFamily: BANNER_BODY_FAMILY,
                fontWeight: 500,
                fontSize: 10,
                letterSpacing: '0.28em',
                textTransform: 'uppercase',
                color: flag,
                marginBottom: 10,
              }}
            >
              {officer.title}
            </div>
            <div
              style={{
                fontFamily: BANNER_DISPLAY_FAMILY,
                fontWeight: 800,
                fontSize: 22,
                letterSpacing: '-0.025em',
                color: bannerColors.ink,
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
                  fontFamily: BANNER_BODY_FAMILY,
                  fontSize: 13,
                  color: bannerColors.mute,
                  textDecoration: 'none',
                }}
              >
                {officer.email}
              </a>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
