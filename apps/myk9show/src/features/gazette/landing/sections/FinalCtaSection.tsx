import { SeeClassesLink } from '@/features/_shared/SeeClassesLink';
import { useCountdown } from '@/features/_shared/hooks/useCountdown';
import { formatDateInTimezone } from '../utils/dateFormat';

interface FinalCtaSectionProps {
  entryWizardUrl: string;
  classesHref: string | null;
  entryCloseDate: string | null;
  timezone: string;
  canEnterOnline?: boolean;
  entryClosed?: boolean;
}

/**
 * Section H · The final advertisement. A deep-band CTA — Gazette's only
 * dark-background section, sitting between the body of the page and the
 * footer. Renders as a full-width band with 4px double rules above and
 * below for the "final notice" feel.
 */
export function FinalCtaSection({
  entryWizardUrl,
  classesHref,
  entryCloseDate,
  timezone,
  canEnterOnline = true,
  entryClosed = false,
}: FinalCtaSectionProps) {
  const countdown = useCountdown(entryCloseDate, timezone);
  // Gate on countdown.closed (not just entryCloseDate presence) so a past close
  // date doesn't keep reading as still-pending after registration has closed.
  const closeLabel =
    entryCloseDate && !countdown.closed
      ? formatDateInTimezone(entryCloseDate, timezone, 'long')
      : null;

  return (
    <section
      id="enter"
      className="px-6 py-24 md:px-12 md:py-24"
      style={{
        background: 'var(--gz-deep)',
        color: 'var(--gz-paper)',
        borderTop: '4px double var(--gz-paper)',
        borderBottom: '4px double var(--gz-paper)',
      }}
    >
      <div className="mx-auto max-w-[880px] text-center">
        <div
          className="mb-6 text-[11px] uppercase"
          style={{
            color: 'rgba(247,241,227,0.65)',
            letterSpacing: '0.32em',
            fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
          }}
        >
          Notice
          {closeLabel
            ? ` · Entries close ${closeLabel}`
            : countdown.closed
              ? ' · Entries closed'
              : ' · Entries open'}
        </div>
        <h2
          className="mx-auto mb-5 max-w-[18ch] text-balance"
          style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontWeight: 900,
            fontSize: 'clamp(40px, 6vw, 80px)',
            letterSpacing: '-0.015em',
            lineHeight: 0.95,
            color: 'var(--gz-paper)',
          }}
        >
          {canEnterOnline ? (
            <>
              You are{' '}
              <em style={{ fontStyle: 'italic', fontWeight: 400, color: 'rgba(247,241,227,0.85)' }}>
                cordially invited
              </em>{' '}
              to enter.
            </>
          ) : entryClosed ? (
            <>
              Entries are{' '}
              <em style={{ fontStyle: 'italic', fontWeight: 400, color: 'rgba(247,241,227,0.85)' }}>
                closed
              </em>
              .
            </>
          ) : (
            <>
              Entries open when{' '}
              <em style={{ fontStyle: 'italic', fontWeight: 400, color: 'rgba(247,241,227,0.85)' }}>
                classes are assigned
              </em>
              .
            </>
          )}
        </h2>
        <p
          className="mx-auto mb-8 max-w-[580px]"
          style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontStyle: 'italic',
            fontWeight: 400,
            fontSize: 19,
            lineHeight: 1.5,
            color: 'rgba(247,241,227,0.75)',
          }}
        >
          {canEnterOnline
            ? 'First-received basis until the limit is hit.'
            : entryClosed
              ? 'Contact the trial secretary for late-entry help.'
              : 'The secretary still needs to assign classes before online entry is available.'}
        </p>
        {canEnterOnline && (
          <a
            href={entryWizardUrl}
            className="inline-flex min-h-[44px] items-center justify-center gap-3.5 px-9 py-4 transition-colors"
            style={{
              background: 'var(--gz-paper)',
              color: 'var(--gz-ink)',
              fontFamily: "'Playfair Display', Georgia, serif",
              fontWeight: 700,
              fontSize: 16,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              textDecoration: 'none',
            }}
          >
            Open the entry wizard ▸
          </a>
        )}
        <SeeClassesLink
          href={classesHref}
          className="mt-3 block"
          style={{ color: 'var(--gz-paper)' }}
        />
      </div>
    </section>
  );
}
