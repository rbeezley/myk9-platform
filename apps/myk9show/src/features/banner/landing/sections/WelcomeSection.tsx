import { BannerSectionHead } from '../../components/BannerSectionHead';
import { useRevealOnScroll } from '@/features/_shared/hooks/useRevealOnScroll';
import { BANNER_BODY_FAMILY, BANNER_DISPLAY_FAMILY } from '../../fonts';
import { bannerColors, bannerSpacing } from '../../tokens';

interface WelcomeSectionProps {
  welcomeText: string | null;
  trialChairName: string | null;
  flag: string;
}

export function WelcomeSection({ welcomeText, trialChairName, flag }: WelcomeSectionProps) {
  const { ref, revealed } = useRevealOnScroll<HTMLDivElement>();
  if (!welcomeText) return null;

  const paragraphs = welcomeText.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);

  return (
    <section
      id="welcome"
      className="bn-section"
      style={{
        padding: `${bannerSpacing.sectionPaddingY}px ${bannerSpacing.pageGutterX}px`,
        maxWidth: bannerSpacing.contentMax,
        margin: '0 auto',
      }}
    >
      <BannerSectionHead number="01" label="Welcome" flag={flag}>
        A note from{' '}
        <span style={{ color: flag }}>the chair.</span>
      </BannerSectionHead>

      <div ref={ref} className={`bn-reveal ${revealed ? 'in' : ''}`}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '240px 1fr',
            gap: 32,
            fontFamily: BANNER_BODY_FAMILY,
            fontSize: 17,
            lineHeight: 1.6,
            color: bannerColors.soft,
          }}
        >
          <div />
          <div>
            {paragraphs.map((para, i) => (
              <p key={i} style={{ margin: i === 0 ? '0 0 1em' : '0 0 1em' }}>
                {para}
              </p>
            ))}
            {trialChairName && (
              <p
                style={{
                  marginTop: 32,
                  paddingTop: 16,
                  borderTop: `1px solid ${bannerColors.hair}`,
                  fontFamily: BANNER_BODY_FAMILY,
                  fontSize: 13,
                  color: bannerColors.mute,
                }}
              >
                <strong
                  style={{
                    fontFamily: BANNER_DISPLAY_FAMILY,
                    fontWeight: 700,
                    color: bannerColors.ink,
                  }}
                >
                  {trialChairName}
                </strong>{' '}
                · Trial Chair
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
