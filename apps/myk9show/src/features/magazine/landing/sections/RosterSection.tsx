import type { CSSProperties } from 'react';
import { MagazineHeading } from '../../components/MagazineHeading';
import { MagazineSectionFolio } from '../../components/MagazineSectionFolio';
import { useRevealOnScroll } from '../../hooks/useRevealOnScroll';
import { formatJourneyDate } from '../utils/dateFormat';
import type { MagazineJourneyStep } from '../types';

interface RosterSectionProps {
  entryCount: number;
  entryLimit: number | null;
  journeySteps: MagazineJourneyStep[];
  timezone: string;
}

function CapacityCounter({ count, limit }: { count: number; limit: number | null }) {
  const { ref, revealed } = useRevealOnScroll<HTMLDivElement>();
  const pct = limit && limit > 0 ? Math.min(100, Math.round((count / limit) * 100)) : null;

  return (
    <div
      ref={ref}
      className={`mz-capacity flex flex-col items-center gap-3 ${revealed ? 'in' : ''}`}
      style={pct != null ? ({ '--mz-bar-pct': `${pct}%` } as CSSProperties) : undefined}
    >
      <div
        style={{
          fontFamily: 'var(--mz-display)',
          fontWeight: 500,
          fontSize: 'clamp(96px, 14vw, 168px)',
          letterSpacing: '-0.025em',
          lineHeight: 1,
          color: 'var(--mz-ink)',
        }}
      >
        {count}
        {limit != null && (
          <em
            className="ml-2 italic"
            style={{
              fontSize: '0.55em',
              color: 'var(--mz-gold-3)',
              verticalAlign: '0.18em',
            }}
          >
            /{limit}
          </em>
        )}
      </div>

      <div
        className="italic"
        style={{
          fontFamily: 'var(--mz-display)',
          fontSize: '22px',
          color: 'var(--mz-quill)',
        }}
      >
        runs claimed at this hour
      </div>

      {pct != null && (
        <div
          className="relative w-full max-w-md overflow-hidden"
          style={{
            height: '2px',
            background: 'var(--mz-paper-deep)',
          }}
          aria-hidden="true"
        >
          <div
            className="mz-capacity-bar absolute inset-y-0 left-0"
            style={{ height: '100%' }}
          />
        </div>
      )}

      {pct != null && (
        <div
          className="text-xs uppercase"
          style={{
            color: 'var(--mz-mute)',
            fontFamily: 'var(--mz-meta)',
            letterSpacing: '0.28em',
          }}
        >
          {pct} percent full
        </div>
      )}
    </div>
  );
}

function JourneyTimeline({
  steps,
  timezone,
}: {
  steps: MagazineJourneyStep[];
  timezone: string;
}) {
  const { ref, revealed } = useRevealOnScroll<HTMLDivElement>();

  return (
    <div
      ref={ref}
      className={`mx-auto flex w-full max-w-2xl flex-col ${revealed ? 'in' : ''}`}
    >
      {steps.map((step, i) => {
        const isActive = step.status === 'active';
        const isDone = step.status === 'done';
        return (
          <div
            key={`${step.label}-${i}`}
            className={`flex items-start gap-4 py-3 ${isDone ? 'opacity-60' : ''}`}
            style={{ transitionDelay: revealed ? `${i * 140}ms` : '0ms' }}
          >
            <span
              className="w-16 shrink-0 text-right text-xs uppercase"
              style={{
                color: 'var(--mz-mute)',
                fontFamily: 'var(--mz-meta)',
                letterSpacing: '0.28em',
                paddingTop: '4px',
              }}
            >
              {step.date ? formatJourneyDate(step.date, timezone) : '—'}
            </span>

            <div className="flex flex-col items-center pt-1">
              <div
                className="h-2 w-2 rounded-full"
                style={{
                  background: isActive ? 'var(--mz-gold-3)' : 'var(--mz-ink)',
                  outline: isActive ? '3px solid var(--mz-gold-1)' : 'none',
                  outlineOffset: '3px',
                }}
              />
              {i < steps.length - 1 && (
                <div
                  className="mt-1 w-px flex-1"
                  style={{ background: 'var(--mz-mute)', opacity: 0.3, minHeight: 24 }}
                />
              )}
            </div>

            <div className="flex flex-col">
              <span
                style={{
                  color: isActive ? 'var(--mz-gold-3)' : 'var(--mz-ink)',
                  fontFamily: 'var(--mz-display)',
                  fontWeight: 500,
                  fontSize: '20px',
                  fontStyle: isActive ? 'italic' : 'normal',
                }}
              >
                {step.label}
              </span>
              <span
                style={{
                  color: 'var(--mz-quill)',
                  fontFamily: 'var(--mz-body)',
                  fontSize: '14px',
                }}
              >
                {step.description}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Roster section — oversized capacity counter + journey timeline.
 *
 * The counter renders the running total in Cormorant Garamond at 168px
 * desktop, with the `/limit` suffix in italic gold-3 at 96px aligned to
 * the baseline +26px (handoff §Roster). A 2px gold-gradient capacity bar
 * fills to the current percentage on reveal.
 *
 * The journey timeline reuses Heritage's shape — dated steps with status
 * dots — but painted in Magazine's editorial palette (gold-3 for active,
 * ink for future, opacity for done).
 */
export function RosterSection({
  entryCount,
  entryLimit,
  journeySteps,
  timezone,
}: RosterSectionProps) {
  const { ref, revealed } = useRevealOnScroll<HTMLDivElement>();

  return (
    <section
      id="roster"
      className="mx-auto w-full max-w-[1280px] px-6 py-16 md:px-16 md:py-24"
      style={{ borderBottom: '1px solid var(--mz-ink)' }}
    >
      <div
        ref={ref}
        className={`mz-section-head mx-auto mb-12 max-w-3xl text-center ${revealed ? 'in' : ''}`}
      >
        <MagazineSectionFolio label="The roster" className="mb-6" />
        <MagazineHeading level={2}>
          Filling <em className="em-gold">quickly</em>
        </MagazineHeading>
      </div>

      <div className="flex flex-col items-center gap-16">
        <CapacityCounter count={entryCount} limit={entryLimit} />
        {journeySteps.length > 0 && <JourneyTimeline steps={journeySteps} timezone={timezone} />}
      </div>
    </section>
  );
}
