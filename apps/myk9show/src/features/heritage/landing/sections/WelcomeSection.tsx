import { HeritageSectionFolio } from '../../components/HeritageSectionFolio';
import { HeritageHeading } from '../../components/HeritageHeading';
import { HeritageOrnamentRule } from '../../components/HeritageOrnamentRule';
import { useRevealOnScroll } from '../../hooks/useRevealOnScroll';

interface WelcomeSectionProps {
  welcomeText: string | null;
  trialChairName: string | null;
}

export function WelcomeSection({ welcomeText, trialChairName }: WelcomeSectionProps) {
  const { ref, revealed } = useRevealOnScroll<HTMLDivElement>();
  if (!welcomeText) return null;

  return (
    <section className="mx-auto max-w-2xl px-6 py-16 text-center">
      <div
        ref={ref}
        className={`hl-section-head flex flex-col items-center gap-6 ${revealed ? 'in' : ''}`}
      >
        <div className="flex items-center gap-3">
          <HeritageSectionFolio numeral="I" />
          <HeritageHeading level={2}>Welcome</HeritageHeading>
        </div>
        <p
          className="text-sm italic"
          style={{ color: 'var(--hl-quill)', fontFamily: "'EB Garamond', Georgia, serif" }}
        >
          By way of greeting
        </p>
        <HeritageOrnamentRule className="w-32" />
        <div
          className="space-y-4 text-base leading-relaxed"
          style={{ color: 'var(--hl-ink)', fontFamily: "'EB Garamond', Georgia, serif" }}
        >
          {welcomeText.split('\n\n').map((para, i) => (
            <p key={i}>{para}</p>
          ))}
        </div>
        {trialChairName && (
          <p
            className="mt-4 text-sm italic"
            style={{ color: 'var(--hl-quill)', fontFamily: "'EB Garamond', Georgia, serif" }}
          >
            — {trialChairName}
          </p>
        )}
      </div>
    </section>
  );
}
