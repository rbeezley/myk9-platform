import { useEffect, useRef, type CSSProperties } from 'react';
import type { Show } from '@/types/show-types';
import { buildOfferedClasses, OFFERED_CLASSES_ANCHOR } from './offeredClasses';
import { resolveDisplayDate } from './calendarDate';

/**
 * Weekday + short date, e.g. "Sun, Oct 25".
 *
 * Routed through `resolveDisplayDate` rather than `new Date(iso)` on purpose:
 * these columns are `timestamptz` holding midnight UTC for what is really a
 * calendar day, so naive formatting renders the previous day everywhere behind
 * UTC. All eight landings shipped that bug once already; the rule lives in
 * `calendarDate.ts` and this reuses it instead of adding a ninth copy.
 */
function formatTrialDay(iso: string | null): string | null {
  if (!iso) return null;
  try {
    const { date } = resolveDisplayDate(iso);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return null;
  }
}

interface OfferedClassesSectionProps {
  show: Show | null | undefined;
  /** Per-theme tuning from the hosting landing (borders, spacing, fonts). */
  className?: string;
  style?: CSSProperties;
  /** Heading text. Each landing styles its own heads, so this stays plain. */
  title?: string;
}

// INTENT: answer "is this show worth entering?" for a signed-out exhibitor, in the
// premium itself, before they commit to the Enter CTA (UX-P2-04-EXP). Grouped by
// trial, with its date, because a show runs several trials and often more than one
// on the same day — the exhibitor has to know which trial to enter, not just that
// the element runs somewhere that weekend. This is the surface `SeeClassesLink`
// points at; before it existed that link sent cold visitors out to the trial
// details page, and only ever to the FIRST trial.
//
// Eight bespoke-themed landings host this one component rather than each
// implementing its own — MYK9-259 is what the alternative costs, where four of
// eight styles silently could not render awards/house-rules. So it ships as
// semantic structure that inherits `currentColor` and the host's font, with
// `className`/`style` for per-theme tuning.
export function OfferedClassesSection({
  show,
  className,
  style,
  title = 'Classes offered',
}: OfferedClassesSectionProps) {
  const trials = buildOfferedClasses(show);
  const ref = useRef<HTMLElement>(null);

  // A cold load of `/shows/:id#offered-classes` cannot scroll itself: the
  // browser resolves the hash while the landing is still fetching, so the
  // target does not exist yet and the visitor lands at the top of the page.
  // Clicking the in-page link is unaffected. This catches up once, on the
  // render where the section first exists, so a shared or bookmarked link
  // arrives where it says it will.
  const settled = useRef(false);
  useEffect(() => {
    if (settled.current) return;
    if (!ref.current) return;
    if (window.location.hash !== `#${OFFERED_CLASSES_ANCHOR}`) return;
    settled.current = true;
    ref.current.scrollIntoView();
  }, [trials.length]);

  // Render nothing rather than an empty shell: a show whose classes are not
  // published yet should not advertise a blank section on its public premium.
  if (trials.length === 0) return null;

  return (
    <section
      ref={ref}
      id={OFFERED_CLASSES_ANCHOR}
      data-testid="offered-classes-section"
      aria-labelledby={`${OFFERED_CLASSES_ANCHOR}-heading`}
      className={className}
      style={{ color: 'currentColor', ...style }}
    >
      <h2 id={`${OFFERED_CLASSES_ANCHOR}-heading`}>{title}</h2>

      {trials.map(trial => (
        <div
          key={trial.trialId}
          data-testid="offered-classes-trial"
          // Spacing is in `em` throughout, never px: each landing sets its own
          // type scale, so relative units keep the rhythm proportional instead
          // of imposing one style's spacing on the other seven.
          style={{ marginTop: '1.75em' }}
        >
          <h3 style={{ fontSize: '1.15em', marginBottom: '0.5em' }}>
            {trial.trialName}
            {/* A show routinely runs more than one trial on the same day — the
                seeded Heartland show runs three on the Sunday, across three
                registries. The name alone does not always separate them, so the
                date is part of the identity here, not decoration. */}
            {formatTrialDay(trial.date) && (
              <span style={{ fontWeight: 'normal', opacity: 0.75 }}>
                {' · '}
                {formatTrialDay(trial.date)}
              </span>
            )}
          </h3>

          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {trial.elements.map(element => (
              <li
                key={element.element}
                data-testid="offered-classes-element"
                style={{ marginBottom: '0.35em' }}
              >
                <strong>{element.element}</strong>{' '}
                <span>
                  {element.levels
                    .map(({ level, sections }) => {
                      // A level with no name renders as the element alone; a split
                      // level reads "Novice A, B" rather than repeating the level.
                      if (!level) return null;
                      return sections.length > 0 ? `${level} ${sections.join(', ')}` : level;
                    })
                    .filter((label): label is string => label !== null)
                    .join(' · ')}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
