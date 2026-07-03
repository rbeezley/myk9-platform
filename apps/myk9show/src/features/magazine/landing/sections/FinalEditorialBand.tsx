import { SeeClassesLink } from '@/features/_shared/SeeClassesLink';
import { useCountdown } from '@/features/_shared/hooks/useCountdown';
import { formatDateInTimezone } from '../utils/dateFormat';

interface FinalEditorialBandProps {
  entryWizardUrl: string;
  classesHref: string | null;
  entryCloseDate: string | null;
  timezone: string;
  canEnterOnline?: boolean;
}

/**
 * Final CTA — the dark editorial band that closes the page.
 *
 * Renders the `--mz-final-band` gradient (`gold-3 → 2e2820 → 1a1a1a`) full-
 * bleed, with a gold smallcaps eyebrow giving the "closes" timestamp, a 96px
 * Cormorant italic title, a short dek, and a paper-on-ink button with the
 * editorial italic CTA voice ("Open the entry wizard").
 *
 * The italic emphasis word inside the title ("cordially invited") uses the
 * inline `em.em-gold` pattern — but here the gradient text-clip would
 * disappear against the dark band, so we explicitly override the color to
 * `--mz-gold-1` for legibility. This is the one place the gold accent is *not*
 * the dark gold-3.
 */
export function FinalEditorialBand({
  entryWizardUrl,
  classesHref,
  entryCloseDate,
  timezone,
  canEnterOnline = true,
}: FinalEditorialBandProps) {
  const countdown = useCountdown(entryCloseDate, timezone);
  // Gate on countdown.closed (not just entryCloseDate presence) so a past close
  // date doesn't keep reading as still-pending after registration has closed.
  const closesLine =
    entryCloseDate && !countdown.closed
      ? `Closing ${formatDateInTimezone(entryCloseDate, timezone, 'long')}`
      : null;

  return (
    <section
      id="enter"
      className="px-6 py-24 text-center md:px-16 md:py-32"
      style={{
        background: 'var(--mz-final-band)',
        color: 'var(--mz-paper)',
      }}
    >
      <div className="mx-auto flex max-w-[1080px] flex-col items-center gap-6">
        {closesLine && (
          <div
            className="text-xs uppercase"
            style={{
              color: 'var(--mz-gold-1)',
              fontFamily: 'var(--mz-meta)',
              letterSpacing: '0.32em',
            }}
          >
            {closesLine}
          </div>
        )}

        <h2
          className="max-w-[18ch]"
          style={{
            fontFamily: 'var(--mz-display)',
            fontWeight: 500,
            fontSize: 'clamp(48px, 8vw, 96px)',
            letterSpacing: '-0.015em',
            lineHeight: 0.95,
            color: 'var(--mz-paper)',
            textWrap: 'balance',
          }}
        >
          {canEnterOnline ? (
            <>
              You are{' '}
              <em style={{ fontStyle: 'italic', color: 'var(--mz-gold-1)' }}>
                cordially invited
              </em>{' '}
              to enter.
            </>
          ) : (
            <>
              Entries open when{' '}
              <em style={{ fontStyle: 'italic', color: 'var(--mz-gold-1)' }}>
                classes are assigned
              </em>
              .
            </>
          )}
        </h2>

        {canEnterOnline ? (
          <>
            <p
              className="max-w-xl italic"
              style={{
                color: 'var(--mz-paper-mute)',
                fontFamily: 'var(--mz-display)',
                fontSize: 'clamp(17px, 2vw, 22px)',
                lineHeight: 1.5,
              }}
            >
              First-received basis until the limit is hit. Refunds (less processing) issued for
              written withdrawals received before closing.
            </p>

            <a
              href={entryWizardUrl}
              className="mt-4 inline-flex min-h-[44px] items-center justify-center gap-3 px-11 py-4 transition-colors"
              style={{
                background: 'var(--mz-paper)',
                color: 'var(--mz-ink)',
                fontFamily: 'var(--mz-display)',
                fontStyle: 'italic',
                fontWeight: 500,
                fontSize: '18px',
              }}
            >
              Open the entry wizard <span aria-hidden="true">→</span>
            </a>
          </>
        ) : (
          <p
            className="max-w-xl italic"
            style={{
              color: 'var(--mz-paper-mute)',
              fontFamily: 'var(--mz-display)',
              fontSize: 'clamp(17px, 2vw, 22px)',
              lineHeight: 1.5,
            }}
          >
            The secretary still needs to assign classes before online entry is available.
          </p>
        )}

        <SeeClassesLink
          href={classesHref}
          className="mt-3 block"
          style={{ color: 'var(--mz-paper)' }}
        />
      </div>
    </section>
  );
}
