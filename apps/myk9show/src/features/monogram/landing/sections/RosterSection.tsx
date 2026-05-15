import { MonogramSectionFolio } from '../../components/MonogramSectionFolio';
import { useRevealOnScroll } from '@/features/_shared/hooks/useRevealOnScroll';
import {
  MONOGRAM_BODY_FAMILY,
  MONOGRAM_DISPLAY_FAMILY,
  MONOGRAM_MONOGRAM_FAMILY,
} from '../../fonts';
import { monogramColors } from '../../tokens';

interface RosterSectionProps {
  entryCount: number;
  entryLimit: number | null;
  asOfLabel?: string | null;
}

/**
 * Roster — folio iv. Centerpiece is a big tabular count (`281 / 360` in
 * Italiana). When a limit exists, an animated bronze→leaf gradient bar fills
 * to the percentage on reveal. When no limit is configured, just shows the
 * count with a quiet "entries received" label.
 */
export function RosterSection({ entryCount, entryLimit, asOfLabel }: RosterSectionProps) {
  const { ref, revealed } = useRevealOnScroll<HTMLDivElement>();
  const pct =
    entryLimit && entryLimit > 0
      ? Math.min(100, Math.round((entryCount / entryLimit) * 100))
      : null;

  return (
    <section className="mg-section">
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
        <MonogramSectionFolio numeral="iv" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span
            style={{
              fontFamily: MONOGRAM_BODY_FAMILY,
              fontSize: 11,
              fontWeight: 500,
              letterSpacing: '0.32em',
              textTransform: 'uppercase',
              color: monogramColors.bronze,
            }}
          >
            The roster
          </span>
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
            Filling{' '}
            <span style={{ fontStyle: 'italic', color: monogramColors.bronze }}>
              {pct != null && pct >= 90 ? 'fast' : pct != null && pct >= 50 ? 'steadily' : 'slowly'}
            </span>
          </h2>
        </div>
      </header>

      <div
        ref={ref}
        className={`mg-roster ${revealed ? 'in' : ''}`}
        style={{
          padding: '56px 48px',
          background: monogramColors.paperDeep,
          border: '1px solid rgba(28, 24, 21, 0.16)',
          textAlign: 'center',
        }}
      >
        <div
          className="mg-roster__count"
          style={{
            fontFamily: MONOGRAM_MONOGRAM_FAMILY,
            fontSize: 140,
            lineHeight: 1,
            color: monogramColors.ink,
            letterSpacing: '-0.04em',
          }}
        >
          {entryCount}
          {entryLimit != null && (
            <span
              style={{
                fontSize: 56,
                color: monogramColors.bronze,
                verticalAlign: 'middle',
                marginLeft: 8,
              }}
            >
              {' ⁄ '}
              {entryLimit}
            </span>
          )}
        </div>
        <span
          style={{
            display: 'block',
            marginTop: 12,
            fontFamily: MONOGRAM_BODY_FAMILY,
            fontSize: 11,
            fontWeight: 500,
            letterSpacing: '0.32em',
            textTransform: 'uppercase',
            color: monogramColors.bronze,
          }}
        >
          {asOfLabel ?? 'Entries received'}
        </span>
        {pct != null && (
          <div
            className="mg-roster__bar"
            aria-label={`${pct}% of entry limit filled`}
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            style={{
              maxWidth: 420,
              margin: '28px auto 0',
              height: 4,
              background: 'rgba(28, 24, 21, 0.12)',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <div
              className="mg-roster__bar-fill"
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                bottom: 0,
                width: revealed ? `${pct}%` : '0%',
                background: `linear-gradient(90deg, ${monogramColors.bronze} 0%, ${monogramColors.leaf} 100%)`,
                transition: 'width 1400ms cubic-bezier(0.2, 0, 0, 1) 400ms',
              }}
            />
          </div>
        )}
      </div>
    </section>
  );
}
