import { MagazineHeading } from '../../components/MagazineHeading';
import { MagazineSectionFolio } from '../../components/MagazineSectionFolio';
import { MagazineDropCap } from '../../components/MagazineDropCap';
import { MagazinePullQuote } from '../../components/MagazinePullQuote';
import { useRevealOnScroll } from '../../hooks/useRevealOnScroll';

interface WelcomeSectionProps {
  welcomeText: string | null;
  trialChairName: string | null;
  pullQuote: string | null;
  pullQuoteAttribution: string | null;
}

/**
 * Welcome section — the photographic-editorial centerpiece.
 *
 * Three nested elements, in order:
 * 1. A centered section header (`MagazineSectionFolio` + `MagazineHeading`)
 *    above the prose
 * 2. The body, rendered in `column-count: 2` Source Serif 4 with a Cormorant
 *    Garamond drop cap on the first paragraph. The first paragraph uses the
 *    `MagazineDropCap` primitive; subsequent paragraphs are plain.
 * 3. An optional pull quote that breaks the columns via `column-span: all`.
 *    When no `pullQuote` is supplied the element is omitted entirely.
 *
 * Single-paragraph welcomes drop to single-column (no `column-rule`) via
 * the `.mz-welcome--single` modifier — `column-count: 2` looks broken when
 * the second column is mostly empty.
 *
 * Returns null when there's no welcome text at all.
 */
export function WelcomeSection({
  welcomeText,
  trialChairName,
  pullQuote,
  pullQuoteAttribution,
}: WelcomeSectionProps) {
  const { ref, revealed } = useRevealOnScroll<HTMLDivElement>();
  if (!welcomeText) return null;

  const paragraphs = welcomeText.split('\n\n').filter(Boolean);
  if (!paragraphs.length) return null;

  const isSingle = paragraphs.length < 2;

  return (
    <section
      id="welcome"
      className="mx-auto w-full max-w-[1280px] px-6 py-16 md:px-16 md:py-24"
      style={{ borderBottom: '1px solid var(--mz-ink)' }}
    >
      <div
        ref={ref}
        className={`mz-section-head mx-auto mb-16 max-w-3xl text-center ${revealed ? 'in' : ''}`}
      >
        <MagazineSectionFolio label="Letter from the chair" className="mb-6" />
        <MagazineHeading level={2}>
          A welcome <em className="em-gold">to all entrants</em>
        </MagazineHeading>
      </div>

      <div className={`mz-welcome ${isSingle ? 'mz-welcome--single' : ''}`}>
        <MagazineDropCap>{paragraphs[0] ?? ''}</MagazineDropCap>
        {paragraphs.slice(1).map((para, i) => (
          <p key={i}>{para}</p>
        ))}
        {trialChairName && (
          <div className="mz-signature">
            <div
              style={{
                fontFamily: 'var(--mz-display)',
                fontStyle: 'italic',
                fontWeight: 500,
                fontSize: '28px',
                color: 'var(--mz-ink)',
                marginBottom: '4px',
              }}
            >
              {trialChairName}
            </div>
            <div
              className="text-xs uppercase"
              style={{
                color: 'var(--mz-mute)',
                fontFamily: 'var(--mz-meta)',
                letterSpacing: '0.32em',
              }}
            >
              Trial Chair
            </div>
          </div>
        )}
      </div>

      {pullQuote && <MagazinePullQuote quote={pullQuote} attribution={pullQuoteAttribution} />}
    </section>
  );
}
