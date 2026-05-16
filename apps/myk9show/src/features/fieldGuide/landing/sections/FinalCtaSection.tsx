import { FieldGuideDarkBand } from '../../components/FieldGuideDarkBand';
import {
  FIELD_GUIDE_BODY_FAMILY,
  FIELD_GUIDE_DISPLAY_FAMILY,
  FIELD_GUIDE_MONO_FAMILY,
} from '../../fonts';
import { fieldGuideColors, fieldGuideSpacing } from '../../tokens';
import { formatDateInTimezone } from '../utils/dateFormat';

interface FinalCtaSectionProps {
  entryWizardUrl: string;
  entryCloseDate: string | null;
  timezone: string;
  entryLimit: number | null;
}

/**
 * §09 Submit your entry — the dark band closer. Heading on the left,
 * a parchment "card" on the right with the entry-wizard URL and the
 * primary orange CTA. Uses the FieldGuideDarkBand primitive but
 * overrides the default mono chrome — the heading inside is sans-700.
 */
export function FinalCtaSection({
  entryWizardUrl,
  entryCloseDate,
  timezone,
  entryLimit,
}: FinalCtaSectionProps) {
  const closesLabel = entryCloseDate
    ? formatDateInTimezone(entryCloseDate, timezone, 'long')
    : null;

  return (
    <FieldGuideDarkBand
      as="section"
      paddingY={64}
      paddingX={32}
      style={{ fontFamily: FIELD_GUIDE_BODY_FAMILY }}
    >
      <div
        id="enter"
        style={{
          maxWidth: fieldGuideSpacing.contentMax,
          margin: '0 auto',
          display: 'grid',
          gridTemplateColumns: '1fr 320px',
          gap: 56,
          alignItems: 'center',
        }}
      >
        <div>
          <div
            style={{
              fontFamily: FIELD_GUIDE_MONO_FAMILY,
              fontWeight: 600,
              fontSize: 12,
              letterSpacing: '0.04em',
              color: fieldGuideColors.orange,
              marginBottom: 16,
            }}
          >
            §09 · ENTRY{closesLabel ? ` · CLOSES ${closesLabel.toUpperCase()}` : ''}
          </div>
          <h2
            style={{
              margin: '0 0 16px',
              fontFamily: FIELD_GUIDE_DISPLAY_FAMILY,
              fontWeight: 700,
              fontSize: 48,
              letterSpacing: '-0.025em',
              lineHeight: 1.0,
              color: fieldGuideColors.paper,
              maxWidth: '18ch',
            }}
          >
            Submit your <span style={{ color: fieldGuideColors.orange }}>entry</span>.
          </h2>
          <p
            style={{
              margin: 0,
              fontFamily: FIELD_GUIDE_BODY_FAMILY,
              fontSize: 15,
              lineHeight: 1.6,
              color: 'rgba(246,241,230,0.75)',
              maxWidth: 540,
            }}
          >
            {entryLimit != null
              ? `${entryLimit} runs · first-received basis until the limit is hit.`
              : 'First-received basis. Refunds (less processing fees) for written withdrawals received before close.'}
          </p>
        </div>
        <div
          style={{
            background: fieldGuideColors.paper,
            color: fieldGuideColors.ink,
            padding: 24,
          }}
        >
          <div
            style={{
              fontFamily: FIELD_GUIDE_MONO_FAMILY,
              fontWeight: 600,
              fontSize: 10.5,
              letterSpacing: '0.04em',
              color: fieldGuideColors.orangeDeep,
              textTransform: 'uppercase',
              marginBottom: 6,
            }}
          >
            ONLINE ENTRY URL
          </div>
          <div
            style={{
              fontFamily: FIELD_GUIDE_DISPLAY_FAMILY,
              fontWeight: 700,
              fontSize: 16,
              letterSpacing: '-0.005em',
              color: fieldGuideColors.ink,
              marginBottom: 16,
              wordBreak: 'break-all',
            }}
          >
            myk9show.com{entryWizardUrl}
          </div>
          <a
            href={entryWizardUrl}
            style={{
              display: 'block',
              width: '100%',
              textAlign: 'center',
              padding: 14,
              background: fieldGuideColors.orange,
              color: fieldGuideColors.paper,
              fontFamily: FIELD_GUIDE_DISPLAY_FAMILY,
              fontWeight: 700,
              fontSize: 14,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              textDecoration: 'none',
            }}
          >
            SUBMIT ENTRY →
          </a>
          <div
            style={{
              fontFamily: FIELD_GUIDE_MONO_FAMILY,
              fontWeight: 500,
              fontSize: 10.5,
              letterSpacing: '0.04em',
              color: fieldGuideColors.mute,
              marginTop: 10,
              textAlign: 'center',
            }}
          >
            ~3 MIN · SAVES &amp; RESUMES
          </div>
        </div>
      </div>
    </FieldGuideDarkBand>
  );
}
