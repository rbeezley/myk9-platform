import { HeritageSectionFolio } from '../../components/HeritageSectionFolio';
import { HeritageHeading } from '../../components/HeritageHeading';
import { HeritageOrnamentRule } from '../../components/HeritageOrnamentRule';
import { useRevealOnScroll } from '../../hooks/useRevealOnScroll';
import { formatJourneyDate } from '../utils/dateFormat';
import type { HeritageJourneyStep } from '../types';

interface RosterSectionProps {
  entryCount: number;
  entryLimit: number | null;
  journeySteps: HeritageJourneyStep[];
  timezone: string;
}

function CapacityMeter({ count, limit }: { count: number; limit: number | null }) {
  const { ref, revealed } = useRevealOnScroll<HTMLDivElement>();
  const pct = limit && limit > 0 ? Math.min(100, Math.round((count / limit) * 100)) : null;

  return (
    <div
      ref={ref}
      className={`hl-capacity flex flex-col items-center gap-4 ${revealed ? 'in' : ''}`}
      style={pct != null ? ({ '--hl-bar-pct': `${pct}%` } as React.CSSProperties) : undefined}
    >
      <div className="flex items-baseline gap-2">
        <span
          style={{
            fontFamily: "'Cormorant Garamond', Georgia, serif",
            fontSize: 'clamp(48px, 7vw, 80px)',
            color: 'var(--hl-ink)',
            lineHeight: 1,
          }}
        >
          {count}
          {limit != null && (
            <>
              {' '}
              <span className="text-3xl" style={{ color: 'var(--hl-quill)' }}>
                / {limit}
              </span>
            </>
          )}
        </span>
      </div>
      <p
        className="text-sm italic"
        style={{ color: 'var(--hl-quill)', fontFamily: "'EB Garamond', Georgia, serif" }}
      >
        runs claimed at this hour
      </p>
      {pct != null && (
        <div
          className="h-1.5 w-full max-w-md overflow-hidden rounded-full"
          style={{ background: 'var(--hl-paperDark, #d9d2c2)' }}
        >
          <div className="h-full hl-capacity-bar" />
        </div>
      )}
    </div>
  );
}

const DOT_COLOR: Record<HeritageJourneyStep['status'], string> = {
  done: 'var(--hl-claret)',
  active: 'var(--hl-claret)',
  future: 'var(--hl-ink)',
};

function JourneyTimeline({ steps, timezone }: { steps: HeritageJourneyStep[]; timezone: string }) {
  const { ref, revealed } = useRevealOnScroll<HTMLDivElement>();

  return (
    <div ref={ref} className={`hl-journey flex flex-col gap-0 ${revealed ? 'in' : ''}`}>
      {steps.map((step, i) => (
        <div
          key={i}
          className={`hl-journey-step flex items-start gap-4 py-3 ${step.status === 'done' ? 'opacity-60' : ''}`}
          style={{
            transitionDelay: revealed ? `${i * 140}ms` : '0ms',
          }}
        >
          {/* Date */}
          <span
            className="w-16 shrink-0 text-right text-sm tabular-nums"
            style={{ color: 'var(--hl-quill)', fontFamily: "'EB Garamond', Georgia, serif" }}
          >
            {step.date ? formatJourneyDate(step.date, timezone) : '—'}
          </span>

          {/* Dot */}
          <div className="flex flex-col items-center pt-1">
            <div
              className="h-3 w-3 rounded-full"
              style={{
                background: DOT_COLOR[step.status],
                outline: step.status === 'active' ? '3px solid var(--hl-claret)' : 'none',
                outlineOffset: '3px',
                animation:
                  step.status === 'active' && revealed
                    ? 'hlPulse 2.4s ease-in-out infinite 900ms'
                    : 'none',
              }}
            />
            {i < steps.length - 1 && (
              <div className="mt-1 w-px flex-1 bg-current opacity-20" style={{ minHeight: 24 }} />
            )}
          </div>

          {/* Label + description */}
          <div className="flex flex-col">
            <span
              className="text-sm font-medium"
              style={{
                color: step.status === 'active' ? 'var(--hl-claret)' : 'var(--hl-ink)',
                fontFamily: "'EB Garamond', Georgia, serif",
              }}
            >
              {step.label}
            </span>
            <span
              className="text-xs"
              style={{ color: 'var(--hl-quill)', fontFamily: "'EB Garamond', Georgia, serif" }}
            >
              {step.description}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

export function RosterSection({
  entryCount,
  entryLimit,
  journeySteps,
  timezone,
}: RosterSectionProps) {
  const { ref, revealed } = useRevealOnScroll<HTMLDivElement>();

  return (
    <section className="mx-auto max-w-3xl px-6 py-16">
      <div ref={ref} className={`hl-section-head flex flex-col gap-8 ${revealed ? 'in' : ''}`}>
        <div className="flex items-center gap-3">
          <HeritageSectionFolio numeral="IV" />
          <HeritageHeading level={2}>The Roster</HeritageHeading>
        </div>
        <CapacityMeter count={entryCount} limit={entryLimit} />
        <HeritageOrnamentRule className="w-48" />
        {journeySteps.length > 0 && <JourneyTimeline steps={journeySteps} timezone={timezone} />}
      </div>
    </section>
  );
}
