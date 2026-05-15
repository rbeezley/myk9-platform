import { MonogramEmboss } from '../../components/MonogramEmboss';
import { useRevealOnScroll } from '@/features/_shared/hooks/useRevealOnScroll';
import {
  MONOGRAM_BODY_FAMILY,
  MONOGRAM_DISPLAY_FAMILY,
  MONOGRAM_MONOGRAM_FAMILY,
} from '../../fonts';
import { monogramColors, monogramSpacing } from '../../tokens';
import { formatDateInTimezone } from '../utils/dateFormat';

interface FinalCtaBandProps {
  monogramLetters: string;
  entryWizardUrl: string;
  entryCloseDate: string | null;
  timezone: string;
}

/**
 * Final CTA band — dark ink background with a 580px embossed-dark monogram
 * filling the negative space behind a centered "Enter your dog in confidence."
 * title and a paper-on-ink CTA.
 *
 * The dark embossed monogram uses the same `MonogramEmboss` primitive shipped
 * in PR #182 with `surface="dark"`. On browsers without `background-clip:text`
 * the primitive falls back to solid color so the letters remain visible.
 */
export function FinalCtaBand({
  monogramLetters,
  entryWizardUrl,
  entryCloseDate,
  timezone,
}: FinalCtaBandProps) {
  const { ref, revealed } = useRevealOnScroll<HTMLElement>();
  const closesLabel = entryCloseDate ? formatDateInTimezone(entryCloseDate, timezone, 'long') : null;

  return (
    <section
      ref={ref}
      className={`mg-final ${revealed ? 'in' : ''}`}
      id="enter"
      style={{
        position: 'relative',
        padding: '120px 56px',
        textAlign: 'center',
        background: monogramColors.ink,
        color: monogramColors.paper,
        overflow: 'hidden',
      }}
    >
      <div
        aria-hidden
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
          size={monogramSpacing.finalCtaMonogramSize}
          variant="embossed"
          surface="dark"
          solidColor={monogramColors.soft}
        />
      </div>

      <div style={{ position: 'relative', zIndex: 2, maxWidth: 720, margin: '0 auto' }}>
        {closesLabel && (
          <div
            style={{
              fontFamily: MONOGRAM_BODY_FAMILY,
              fontSize: 11,
              fontWeight: 500,
              letterSpacing: '0.32em',
              textTransform: 'uppercase',
              color: monogramColors.leaf,
              marginBottom: 20,
            }}
          >
            Closes {closesLabel}
          </div>
        )}
        <h2
          style={{
            fontFamily: MONOGRAM_DISPLAY_FAMILY,
            fontSize: 64,
            letterSpacing: '-0.025em',
            lineHeight: 1.05,
            color: monogramColors.paper,
            margin: '0 0 28px',
            fontWeight: 400,
          }}
        >
          Enter your dog{' '}
          <span style={{ fontStyle: 'italic', color: monogramColors.leaf }}>in confidence</span>.
        </h2>
        <a
          href={entryWizardUrl}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 14,
            padding: '18px 44px',
            background: monogramColors.paper,
            color: monogramColors.ink,
            fontFamily: MONOGRAM_DISPLAY_FAMILY,
            fontStyle: 'italic',
            fontSize: 18,
            letterSpacing: '0.02em',
            textDecoration: 'none',
            transition: 'all 280ms ease',
          }}
        >
          Open the entry wizard
          <span aria-hidden style={{ fontFamily: MONOGRAM_MONOGRAM_FAMILY, fontSize: 22 }}>
            →
          </span>
        </a>
      </div>
    </section>
  );
}
