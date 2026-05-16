import { useRevealOnScroll } from '@/features/_shared/hooks/useRevealOnScroll';
import { FieldGuideSectionHead } from '../../components/FieldGuideSectionHead';
import { FIELD_GUIDE_DISPLAY_FAMILY, FIELD_GUIDE_MONO_FAMILY, FIELD_GUIDE_SERIF_FAMILY } from '../../fonts';
import { fieldGuideColors, fieldGuideSpacing } from '../../tokens';

interface WelcomeSectionProps {
  welcomeText: string | null;
  trialChairName: string | null;
  trialChairEmail: string | null;
}

/**
 * §01 Welcome — the single concession to long-form readability in the
 * Field Guide register. IBM Plex Serif body copy, mono-caps byline.
 *
 * INTENT: serif here is intentional and is the *only* serif in the
 * landing page. Do not switch to sans without checking
 * docs/INTENT.md and the Field Guide reconciliation notes.
 */
export function WelcomeSection({
  welcomeText,
  trialChairName,
  trialChairEmail,
}: WelcomeSectionProps) {
  const { ref, revealed } = useRevealOnScroll<HTMLDivElement>();
  if (!welcomeText) return null;

  const paragraphs = welcomeText.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);

  return (
    <section
      id="§01"
      className="fg-section"
      style={{
        maxWidth: fieldGuideSpacing.contentMax,
        margin: '0 auto',
        padding: `${fieldGuideSpacing.sectionPaddingY}px ${fieldGuideSpacing.pageGutterX}px`,
        borderBottom: `1px solid ${fieldGuideColors.ink}`,
      }}
    >
      <FieldGuideSectionHead folio="§01" title="Welcome & purpose" meta="CHAIR'S NOTE" />

      <div
        ref={ref}
        className={`fg-reveal ${revealed ? 'in' : ''}`}
        style={{
          maxWidth: 760,
          fontFamily: FIELD_GUIDE_SERIF_FAMILY,
          fontSize: 16,
          lineHeight: 1.7,
          color: fieldGuideColors.soft,
        }}
      >
        {paragraphs.map((para, i) => (
          <p key={i} style={{ margin: i === 0 ? 0 : '1em 0 0' }}>
            {para}
          </p>
        ))}
        {trialChairName && (
          <div
            style={{
              marginTop: 24,
              paddingTop: 14,
              borderTop: `1px solid ${fieldGuideColors.hair}`,
              fontFamily: FIELD_GUIDE_MONO_FAMILY,
              fontWeight: 500,
              fontSize: 11,
              letterSpacing: '0.04em',
              color: fieldGuideColors.mute,
            }}
          >
            <strong
              style={{
                color: fieldGuideColors.ink,
                fontWeight: 600,
                fontFamily: FIELD_GUIDE_DISPLAY_FAMILY,
              }}
            >
              {trialChairName}
            </strong>{' '}
            · TRIAL CHAIR
            {trialChairEmail ? ` · ${trialChairEmail}` : ''}
          </div>
        )}
      </div>
    </section>
  );
}
