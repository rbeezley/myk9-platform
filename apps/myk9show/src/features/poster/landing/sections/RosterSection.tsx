import { PosterSectionHead } from '../../components/PosterSectionHead';
import { useRevealOnScroll } from '@/features/_shared/hooks/useRevealOnScroll';
import {
  POSTER_BODY_FAMILY,
  POSTER_DISPLAY_FAMILY,
  POSTER_MONO_FAMILY,
} from '../../fonts';
import { posterColors, posterSpacing } from '../../tokens';

interface RosterSectionProps {
  entryCount: number;
  entryLimit: number | null;
}

/**
 * The Poster roster section — section №5. Big red 240px count over an
 * ink "/limit" sub-number, with the percentage bar to the right. The
 * bar fills via the `.po-capacity-bar-fill` keyframe.
 */
export function RosterSection({ entryCount, entryLimit }: RosterSectionProps) {
  const { ref, revealed } = useRevealOnScroll<HTMLDivElement>();
  const pct =
    entryLimit && entryLimit > 0
      ? Math.min(100, Math.round((entryCount / entryLimit) * 100))
      : null;
  const pace =
    pct != null && pct >= 90 ? 'fast.' : pct != null && pct >= 50 ? 'quickly.' : 'slowly.';

  return (
    <section
      id="roster"
      className="po-section"
      style={{
        maxWidth: posterSpacing.contentMax,
        margin: '0 auto',
        padding: `${posterSpacing.sectionPaddingY}px ${posterSpacing.pageGutterX}px`,
        borderBottom: `2px solid ${posterColors.ink}`,
      }}
    >
      <PosterSectionHead number="05" label="Roster">
        Filling
        <br />
        <span style={{ color: posterColors.red }}>{pace}</span>
      </PosterSectionHead>

      <div
        ref={ref}
        className={`po-reveal po-capacity ${revealed ? 'in' : ''}`}
        style={{
          display: 'grid',
          gridTemplateColumns: '2fr 1fr',
          gap: 48,
          alignItems: 'center',
        }}
      >
        <div
          className="po-capacity-nums"
          style={{
            fontFamily: POSTER_DISPLAY_FAMILY,
            fontSize: 240,
            lineHeight: 0.85,
            letterSpacing: '-0.05em',
            color: posterColors.red,
          }}
        >
          {entryCount}
          {entryLimit != null && (
            <span style={{ color: posterColors.ink, fontSize: 144 }}>/{entryLimit}</span>
          )}
        </div>
        <div style={{ fontFamily: POSTER_BODY_FAMILY }}>
          <div
            style={{
              fontFamily: POSTER_MONO_FAMILY,
              fontWeight: 600,
              fontSize: 12,
              letterSpacing: '0.04em',
              color: posterColors.red,
              marginBottom: 18,
            }}
          >
            {pct != null ? `${pct}% CLAIMED` : `${entryCount} ENTERED`}
          </div>
          {pct != null && (
            <div
              role="progressbar"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${pct}% of entry limit filled`}
              style={{
                height: 12,
                background: posterColors.hair,
                position: 'relative',
                overflow: 'hidden',
                border: `1px solid ${posterColors.ink}`,
                marginBottom: 24,
              }}
            >
              <div
                className={revealed ? 'po-capacity-bar-fill' : ''}
                style={{
                  position: 'absolute',
                  inset: '-1px auto -1px -1px',
                  width: `${pct}%`,
                  background: posterColors.red,
                  transformOrigin: 'left center',
                }}
              />
            </div>
          )}
          <p
            style={{
              fontFamily: POSTER_BODY_FAMILY,
              fontSize: 15,
              lineHeight: 1.6,
              color: posterColors.inkSoft,
              margin: 0,
            }}
          >
            First-received basis. Limit is firm; over-entries refunded.
          </p>
        </div>
      </div>
    </section>
  );
}
