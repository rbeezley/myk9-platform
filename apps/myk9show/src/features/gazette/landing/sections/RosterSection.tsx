import { useRevealOnScroll } from '@/features/heritage/hooks/useRevealOnScroll';
import { GazetteSectionHead } from '../../components/GazetteSectionHead';
import { formatJourneyDate } from '../utils/dateFormat';
import type { GazetteJourneyStep } from '../types';

interface RosterSectionProps {
  entryCount: number;
  entryLimit: number | null;
  journeySteps: GazetteJourneyStep[];
  timezone: string;
  volumeRoman: string;
}

/**
 * Section D · Roster. Big tabular Playfair count, italic-brown denominator,
 * and a 4px-tall capacity bar that animates from 0 → percent over 1.4s.
 * The bar uses the same gz-capacity-bar + .in pattern as Heritage so the
 * scroll-revealed transition is consistent.
 */
export function RosterSection({
  entryCount,
  entryLimit,
  journeySteps,
  timezone,
  volumeRoman,
}: RosterSectionProps) {
  const { ref, revealed } = useRevealOnScroll<HTMLDivElement>();
  const pct = entryLimit && entryLimit > 0
    ? Math.min(100, Math.round((entryCount / entryLimit) * 100))
    : null;

  return (
    <section
      id="roster"
      className="mx-auto max-w-[1100px] border-b px-6 py-12 md:px-12 md:py-14"
      style={{ borderColor: 'var(--gz-ink)' }}
    >
      <GazetteSectionHead
        sectionLetter="D"
        pageRuleTitle="ROSTER"
        page={4}
        volume={volumeRoman}
        kicker="As reported"
        title={entryLimit ? <>Roster <em>filling</em></> : <>Roster open</>}
      />
      <div className="text-center">
        <div
          style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontWeight: 900,
            fontSize: 'clamp(72px, 12vw, 112px)',
            letterSpacing: '-0.025em',
            lineHeight: 1,
            color: 'var(--gz-ink)',
          }}
        >
          {entryCount}
          {entryLimit != null && (
            <em
              style={{
                fontStyle: 'italic',
                fontWeight: 400,
                fontSize: 'clamp(42px, 7vw, 64px)',
                color: 'var(--gz-brown)',
                verticalAlign: 18,
              }}
            >
              /{entryLimit}
            </em>
          )}
        </div>
        <div
          className="mt-2 mb-5"
          style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontStyle: 'italic',
            fontSize: 18,
            color: 'var(--gz-brown)',
          }}
        >
          {entryLimit ? 'runs claimed at this hour' : 'runs received'}
        </div>
        {pct != null && (
          <div
            ref={ref}
            className={`mx-auto gz-capacity ${revealed ? 'in' : ''}`}
            style={
              {
                width: '100%',
                maxWidth: 460,
                height: 4,
                background: 'var(--gz-hair)',
                position: 'relative',
                overflow: 'hidden',
                '--gz-bar-pct': `${pct}%`,
              } as React.CSSProperties
            }
          >
            <div className="gz-capacity-bar" style={{ position: 'absolute', inset: '0 auto 0 0' }} />
          </div>
        )}
        {journeySteps.length > 0 && (
          <div
            className="mx-auto mt-6 grid max-w-[760px] grid-cols-1 gap-2 px-2 sm:grid-cols-2"
          >
            {journeySteps.map((step, i) => (
              <div
                key={i}
                className="flex items-baseline gap-3 border-b border-dotted py-2"
                style={{
                  borderColor: 'var(--gz-hair)',
                  opacity: step.status === 'done' ? 0.55 : 1,
                }}
              >
                <span
                  className="w-16 shrink-0 text-right text-[10.5px] uppercase tabular-nums"
                  style={{
                    color: 'var(--gz-brown)',
                    letterSpacing: '0.18em',
                    fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
                  }}
                >
                  {step.date ? formatJourneyDate(step.date, timezone) : '—'}
                </span>
                <span
                  className="text-left"
                  style={{
                    fontFamily: "'Playfair Display', Georgia, serif",
                    fontWeight: step.status === 'active' ? 700 : 500,
                    fontSize: 16,
                    color: step.status === 'active' ? 'var(--gz-ink)' : 'var(--gz-soft)',
                  }}
                >
                  {step.label}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
