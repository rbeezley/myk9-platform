import { MonogramEmboss } from '../../components/MonogramEmboss';
import { MonogramSectionFolio } from '../../components/MonogramSectionFolio';
import { useRevealOnScroll } from '@/features/_shared/hooks/useRevealOnScroll';
import { MONOGRAM_BODY_FAMILY, MONOGRAM_DISPLAY_FAMILY, MONOGRAM_MONOGRAM_FAMILY } from '../../fonts';
import { monogramColors, monogramSpacing } from '../../tokens';

interface WelcomeSectionProps {
  welcomeText: string | null;
  trialChairName: string | null;
  monogramLetters: string;
  /** Bronze italic display text shown in the aside card, e.g. a constitution
   *  quote or club motto. Falls back to a neutral string when null. */
  asideQuote?: string | null;
  /** Eyebrow text above the aside quote, e.g. "Established 1947". */
  asideEyebrow?: string | null;
  /** Attribution line below the aside quote. */
  asideAttribution?: string | null;
}

const SMALLCAPS_BRONZE: React.CSSProperties = {
  fontFamily: MONOGRAM_BODY_FAMILY,
  fontSize: 11,
  fontWeight: 500,
  letterSpacing: '0.32em',
  textTransform: 'uppercase',
  color: monogramColors.bronze,
};

const SMALLCAPS_MUTE: React.CSSProperties = {
  ...SMALLCAPS_BRONZE,
  color: monogramColors.mute,
};

/**
 * Welcome — folio i. Two-column: prose with bronze lead-letter and signature
 * on the left, aside card with embossed monogram and a club quote on the
 * right.
 *
 * Layout collapses to single column < 900px (handled in monogram.css via
 * grid-template-columns override).
 *
 * If neither welcomeText nor any aside copy exists, returns null — empty
 * letter blocks read as bugs, not absence.
 */
export function WelcomeSection({
  welcomeText,
  trialChairName,
  monogramLetters,
  asideQuote,
  asideEyebrow,
  asideAttribution,
}: WelcomeSectionProps) {
  const { ref, revealed } = useRevealOnScroll<HTMLDivElement>();
  const hasContent = !!welcomeText || !!asideQuote;
  if (!hasContent) return null;

  const paragraphs = welcomeText ? welcomeText.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean) : [];
  const firstChar = paragraphs[0]?.charAt(0) ?? '';

  return (
    <section className="mg-section mg-welcome-section">
      <header
        className="mg-section__head"
        style={{
          display: 'grid',
          gridTemplateColumns: '80px 1fr',
          gap: 28,
          alignItems: 'baseline',
          marginBottom: 48,
          paddingBottom: 16,
          borderBottom: `1px solid ${monogramColors.ink}`,
        }}
      >
        <MonogramSectionFolio numeral="i" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={SMALLCAPS_BRONZE}>Letter from the chair</span>
          <h2
            style={{
              fontFamily: MONOGRAM_DISPLAY_FAMILY,
              fontSize: 44,
              letterSpacing: '-0.015em',
              color: monogramColors.ink,
              margin: 0,
              lineHeight: 1.1,
              fontWeight: 400,
            }}
          >
            A welcome <span style={{ fontStyle: 'italic', color: monogramColors.bronze }}>to all entrants</span>
          </h2>
        </div>
      </header>

      <div
        ref={ref}
        className={`mg-welcome ${revealed ? 'in' : ''}`}
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 72,
          alignItems: 'start',
        }}
      >
        <div
          className="mg-welcome__text"
          style={{
            fontFamily: MONOGRAM_BODY_FAMILY,
            fontSize: 21,
            lineHeight: 1.65,
            color: monogramColors.soft,
          }}
        >
          {paragraphs.length === 0 ? (
            <p style={{ fontStyle: 'italic', color: monogramColors.quill }}>
              The trial chair&apos;s welcome will be published here ahead of entry close.
            </p>
          ) : (
            paragraphs.map((para, i) => (
              <p key={i} style={{ margin: i === 0 ? 0 : '1.1em 0 0' }}>
                {i === 0 && firstChar && (
                  <span
                    aria-hidden
                    style={{
                      fontFamily: MONOGRAM_MONOGRAM_FAMILY,
                      fontSize: 84,
                      lineHeight: 0.85,
                      float: 'left',
                      margin: '6px 14px -2px 0',
                      color: monogramColors.bronze,
                    }}
                  >
                    {firstChar}
                  </span>
                )}
                {i === 0 ? para.slice(1) : para}
              </p>
            ))
          )}

          {trialChairName && (
            <div
              className="mg-welcome__sig"
              style={{
                marginTop: 36,
                paddingTop: 18,
                borderTop: '1px solid rgba(28, 24, 21, 0.18)',
              }}
            >
              <div
                style={{
                  fontFamily: MONOGRAM_DISPLAY_FAMILY,
                  fontStyle: 'italic',
                  fontSize: 24,
                  color: monogramColors.ink,
                  marginBottom: 4,
                }}
              >
                {trialChairName}
              </div>
              <div style={SMALLCAPS_MUTE}>Trial Chair</div>
            </div>
          )}
        </div>

        <aside
          className="mg-welcome__card"
          style={{
            position: 'relative',
            padding: '48px 44px',
            background: monogramColors.paperDeep,
            border: '1px solid rgba(28, 24, 21, 0.18)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              pointerEvents: 'none',
            }}
          >
            <MonogramEmboss
              letters={monogramLetters}
              size={monogramSpacing.cardMonogramSize}
              variant="embossed"
              surface="paper"
            />
          </div>
          <div style={{ position: 'relative', zIndex: 1, textAlign: 'center' }}>
            {asideEyebrow && <div style={{ ...SMALLCAPS_BRONZE, marginBottom: 14 }}>{asideEyebrow}</div>}
            <p
              style={{
                fontFamily: MONOGRAM_DISPLAY_FAMILY,
                fontStyle: 'italic',
                fontSize: 26,
                lineHeight: 1.4,
                color: monogramColors.ink,
                marginBottom: 20,
                marginTop: 0,
              }}
            >
              {asideQuote ?? '“The point of a trial is the dog and the work.”'}
            </p>
            {asideAttribution && <div style={SMALLCAPS_MUTE}>{asideAttribution}</div>}
          </div>
        </aside>
      </div>
    </section>
  );
}
