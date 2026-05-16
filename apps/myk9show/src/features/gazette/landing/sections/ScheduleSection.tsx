import { GazetteSectionHead } from '../../components/GazetteSectionHead';
import type { GazetteScheduleItem } from '../types';

interface ScheduleSectionProps {
  schedule: GazetteScheduleItem[];
  volumeRoman: string;
}

/**
 * Section E · Schedule. Three-column row layout (time / event / hall) with
 * 3px ink top + bottom rules and dotted-hair separators between rows. The
 * hall column hides under 900px (mobile only shows time + event).
 *
 * Returns null when no items — no point rendering an empty schedule frame.
 */
export function ScheduleSection({ schedule, volumeRoman }: ScheduleSectionProps) {
  if (!schedule.length) return null;

  return (
    <section
      id="schedule"
      className="mx-auto max-w-[1100px] border-b px-6 py-12 md:px-12 md:py-14"
      style={{ borderColor: 'var(--gz-ink)' }}
    >
      <GazetteSectionHead
        sectionLetter="E"
        pageRuleTitle="SCHEDULE"
        page={5}
        volume={volumeRoman}
        kicker="Show hours · Each day"
        title={<>The day, <em>hour by hour</em></>}
      />
      <div
        className="mx-auto max-w-[760px]"
        style={{
          borderTop: '3px solid var(--gz-ink)',
          borderBottom: '3px solid var(--gz-ink)',
        }}
      >
        {schedule.map((row, i) => (
          <div
            key={i}
            className="grid items-baseline gap-6 border-b border-dotted py-3 sm:gap-8"
            style={{
              gridTemplateColumns: '90px 1fr 80px',
              borderColor: 'var(--gz-hair)',
              borderBottomWidth: i === schedule.length - 1 ? 0 : 1,
            }}
          >
            <div
              style={{
                fontFamily: "'Playfair Display', Georgia, serif",
                fontWeight: 700,
                fontSize: 18,
                letterSpacing: '-0.005em',
                color: 'var(--gz-ink)',
              }}
            >
              {row.time}
            </div>
            <div
              style={{
                fontFamily: "'Source Serif 4', Georgia, serif",
                fontSize: 15,
                lineHeight: 1.45,
                color: 'var(--gz-soft)',
              }}
            >
              {row.event}
            </div>
            <div
              className="hidden text-right uppercase sm:block"
              style={{
                fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
                fontWeight: 500,
                fontSize: 10.5,
                letterSpacing: '0.18em',
                color: 'var(--gz-brown)',
              }}
            >
              {row.hall ?? ''}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
