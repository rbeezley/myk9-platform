import { BannerContentRow } from '../../components/BannerContentRow';
import { BannerSectionHead } from '../../components/BannerSectionHead';
import { useRevealOnScroll } from '@/features/_shared/hooks/useRevealOnScroll';
import { BANNER_BODY_FAMILY, BANNER_DISPLAY_FAMILY } from '../../fonts';
import { bannerColors, bannerSpacing } from '../../tokens';

interface RosterSectionProps {
  entryCount: number;
  entryLimit: number | null;
  flag: string;
  flagBright: string;
}

export function RosterSection({ entryCount, entryLimit, flag, flagBright }: RosterSectionProps) {
  const { ref, revealed } = useRevealOnScroll<HTMLDivElement>();
  const pct =
    entryLimit && entryLimit > 0
      ? Math.min(100, Math.round((entryCount / entryLimit) * 100))
      : null;
  const pace =
    pct != null && pct >= 90 ? 'fast.' : pct != null && pct >= 50 ? 'steadily.' : 'slowly.';

  return (
    <section
      id="roster"
      className="bn-section bn-section--alt"
      style={{
        background: bannerColors.paperWarm,
        padding: `${bannerSpacing.sectionPaddingY}px ${bannerSpacing.pageGutterX}px`,
      }}
    >
      <div style={{ maxWidth: bannerSpacing.contentMax, margin: '0 auto' }}>
        <BannerSectionHead number="04" label="Roster" flag={flag}>
          Filling <span style={{ color: flag }}>{pace}</span>
        </BannerSectionHead>

        <div
          ref={ref}
          className={`bn-reveal bn-capacity ${revealed ? 'in' : ''}`}
        >
          <BannerContentRow>
            <div
              style={{
                fontFamily: BANNER_DISPLAY_FAMILY,
                fontWeight: 900,
                fontSize: 96,
                letterSpacing: '-0.045em',
                lineHeight: 1,
                color: bannerColors.ink,
              }}
            >
              {entryCount}
              {entryLimit != null && (
                <span
                  style={{
                    fontSize: 40,
                    color: bannerColors.mute,
                    fontWeight: 500,
                  }}
                >
                  {' '}/ {entryLimit}
                </span>
              )}
            </div>
            <div
              style={{
                marginTop: 12,
                fontFamily: BANNER_BODY_FAMILY,
                fontWeight: 500,
                fontSize: 11,
                letterSpacing: '0.28em',
                textTransform: 'uppercase',
                color: bannerColors.mute,
              }}
            >
              Entries received
            </div>
            {pct != null && (
              <div
                role="progressbar"
                aria-valuenow={pct}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${pct}% of entry limit filled`}
                style={{
                  marginTop: 24,
                  height: 6,
                  width: '100%',
                  maxWidth: 480,
                  background: bannerColors.hair,
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    bottom: 0,
                    width: revealed ? `${pct}%` : '0%',
                    background: `linear-gradient(90deg, ${flag} 0%, ${flagBright} 100%)`,
                    transition: 'width 1200ms cubic-bezier(0.2, 0, 0, 1) 600ms',
                  }}
                />
              </div>
            )}
          </BannerContentRow>
        </div>
      </div>
    </section>
  );
}
