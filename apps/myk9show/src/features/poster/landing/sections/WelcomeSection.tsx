import { PosterSectionHead } from '../../components/PosterSectionHead';
import { useRevealOnScroll } from '@/features/_shared/hooks/useRevealOnScroll';
import { POSTER_BODY_FAMILY, POSTER_MONO_FAMILY } from '../../fonts';
import { posterColors, posterSpacing } from '../../tokens';

interface WelcomeSectionProps {
  welcomeText: string | null;
  trialChairName: string | null;
}

export function WelcomeSection({ welcomeText, trialChairName }: WelcomeSectionProps) {
  const { ref, revealed } = useRevealOnScroll<HTMLDivElement>();
  if (!welcomeText) return null;

  const paragraphs = welcomeText
    .split(/\n\s*\n/)
    .map(p => p.trim())
    .filter(Boolean);

  return (
    <section
      id="welcome"
      className="po-section"
      style={{
        maxWidth: posterSpacing.contentMax,
        margin: '0 auto',
        padding: `${posterSpacing.sectionPaddingY}px ${posterSpacing.pageGutterX}px`,
        borderBottom: `2px solid ${posterColors.ink}`,
      }}
    >
      <PosterSectionHead number="01" label="Welcome">
        A note
        <br />
        <span style={{ color: 'transparent', WebkitTextStroke: `2px ${posterColors.ink}` }}>
          from the chair.
        </span>
      </PosterSectionHead>

      <div
        ref={ref}
        className={`po-reveal ${revealed ? 'in' : ''}`}
        style={{
          maxWidth: 760,
          fontFamily: POSTER_BODY_FAMILY,
          fontSize: 19,
          lineHeight: 1.7,
          color: posterColors.inkSoft,
        }}
      >
        {paragraphs.map((para, i) => (
          <p key={i} style={{ margin: i === 0 ? '0 0 1.1em' : '0 0 1.1em' }}>
            {para}
          </p>
        ))}
        {trialChairName && (
          <div
            style={{
              marginTop: 36,
              display: 'inline-block',
              padding: '12px 18px',
              background: posterColors.ink,
              color: posterColors.cream,
              fontFamily: POSTER_MONO_FAMILY,
              fontWeight: 500,
              fontSize: 12,
              letterSpacing: '0.04em',
            }}
          >
            <strong style={{ color: posterColors.red, fontWeight: 600 }}>
              {trialChairName.toUpperCase()}
            </strong>{' '}
            · TRIAL CHAIR
          </div>
        )}
      </div>
    </section>
  );
}
