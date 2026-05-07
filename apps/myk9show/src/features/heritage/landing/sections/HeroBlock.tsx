import { useCountdown } from '../../hooks/useCountdown';
import { HeritageOrnamentRule } from '../../components/HeritageOrnamentRule';
import { HeritageEngravedFrame } from '../../components/HeritageEngravedFrame';
import { HeritageHeading } from '../../components/HeritageHeading';
import { useRevealOnScroll } from '../../hooks/useRevealOnScroll';
import { formatDateInTimezone } from '../utils/dateFormat';

interface HeroBlockProps {
  clubName: string;
  showName: string;
  showSubtitle: string;
  entryCloseDate: string | null;
  trialStartDate: string | null;
  trialEndDate: string | null;
  venueName: string | null;
  venueCity: string | null;
  timezone: string;
  entryWizardUrl: string;
}

function CountdownBlock({
  days,
  hours,
  minutes,
  closed,
}: {
  days: number;
  hours: number;
  minutes: number;
  closed: boolean;
}) {
  if (closed) {
    return (
      <div
        className="inline-block border px-6 py-2 text-sm uppercase tracking-widest"
        style={{
          borderColor: 'var(--hl-claret)',
          color: 'var(--hl-claret)',
          fontFamily: "'EB Garamond', Georgia, serif",
        }}
      >
        Entries closed
      </div>
    );
  }

  const blocks = [
    { value: days, label: 'Days' },
    { value: hours, label: 'Hours' },
    { value: minutes, label: 'Min' },
  ];

  return (
    <div className="flex items-end gap-6">
      {blocks.map(({ value, label }) => (
        <div key={label} className="flex flex-col items-center">
          <span
            className="tabular-nums"
            style={{
              fontFamily: "'Cormorant Garamond', Georgia, serif",
              fontSize: 'clamp(40px, 6vw, 72px)',
              lineHeight: 1,
              color: 'var(--hl-ink)',
            }}
          >
            {String(value).padStart(2, '0')}
          </span>
          <span
            className="mt-1 text-xs uppercase tracking-widest"
            style={{ color: 'var(--hl-quill)', fontFamily: "'EB Garamond', Georgia, serif" }}
          >
            {label}
          </span>
        </div>
      ))}
      <span
        className="mb-2 text-sm italic"
        style={{ color: 'var(--hl-quill)', fontFamily: "'EB Garamond', Georgia, serif" }}
      >
        until close
      </span>
    </div>
  );
}

export function HeroBlock({
  clubName,
  showName,
  showSubtitle,
  entryCloseDate,
  trialStartDate,
  trialEndDate,
  venueName,
  venueCity,
  timezone,
  entryWizardUrl,
}: HeroBlockProps) {
  const { ref, revealed } = useRevealOnScroll<HTMLDivElement>(0.1);
  const { days, hours, minutes, closed } = useCountdown(entryCloseDate, timezone);

  const locationLabel = [venueName, venueCity].filter(Boolean).join(', ');
  const dateLabel = [
    trialStartDate ? formatDateInTimezone(trialStartDate, timezone, 'short') : null,
    trialEndDate && trialEndDate !== trialStartDate
      ? formatDateInTimezone(trialEndDate, timezone, 'short')
      : null,
  ]
    .filter(Boolean)
    .join(' – ');

  return (
    <section id="overview" className="px-6 py-16 text-center md:px-18 md:py-24">
      <HeritageEngravedFrame className="mx-auto max-w-3xl">
        <div
          ref={ref}
          className={`hl-section-head flex flex-col items-center gap-4 py-10 ${revealed ? 'in' : ''}`}
        >
          {/* Supra */}
          <p
            className="text-sm italic"
            style={{ color: 'var(--hl-quill)', fontFamily: "'EB Garamond', Georgia, serif" }}
          >
            The Officers &amp; Members do present
          </p>

          {/* Club name */}
          <p
            className="text-lg tracking-[0.18em] uppercase"
            style={{ color: 'var(--hl-ink)', fontFamily: "'EB Garamond', Georgia, serif" }}
          >
            {clubName}
          </p>

          <HeritageOrnamentRule className="w-full max-w-xs" />

          <p
            className="text-sm italic"
            style={{ color: 'var(--hl-quill)', fontFamily: "'EB Garamond', Georgia, serif" }}
          >
            the
          </p>

          {/* Show name */}
          <HeritageHeading level={1} italic className="max-w-2xl">
            {showName}
          </HeritageHeading>

          {/* Subtitle */}
          <p
            className="text-xs uppercase tracking-[0.32em]"
            style={{ color: 'var(--hl-quill)', fontFamily: "'EB Garamond', Georgia, serif" }}
          >
            {showSubtitle}
          </p>

          <HeritageOrnamentRule variant="gold" className="w-full max-w-xs" />

          {/* Meta grid */}
          <div className="flex flex-wrap justify-center gap-8 text-sm">
            {dateLabel && (
              <div className="flex flex-col items-center gap-0.5">
                <span
                  className="text-xs uppercase tracking-widest"
                  style={{ color: 'var(--hl-quill)', fontFamily: "'EB Garamond', Georgia, serif" }}
                >
                  Held on
                </span>
                <span
                  style={{ color: 'var(--hl-ink)', fontFamily: "'EB Garamond', Georgia, serif" }}
                >
                  {dateLabel}
                </span>
              </div>
            )}
            {locationLabel && (
              <div className="flex flex-col items-center gap-0.5">
                <span
                  className="text-xs uppercase tracking-widest"
                  style={{ color: 'var(--hl-quill)', fontFamily: "'EB Garamond', Georgia, serif" }}
                >
                  At the
                </span>
                <span
                  style={{ color: 'var(--hl-ink)', fontFamily: "'EB Garamond', Georgia, serif" }}
                >
                  {locationLabel}
                </span>
              </div>
            )}
          </div>

          {/* Countdown */}
          {entryCloseDate && (
            <div className="mt-4 flex flex-col items-center gap-3">
              <CountdownBlock days={days} hours={hours} minutes={minutes} closed={closed} />
              {!closed && (
                <p
                  className="text-xs italic"
                  style={{ color: 'var(--hl-quill)', fontFamily: "'EB Garamond', Georgia, serif" }}
                >
                  Entries close {formatDateInTimezone(entryCloseDate, timezone, 'long')}
                </p>
              )}
            </div>
          )}

          {/* CTA */}
          <a
            href={entryWizardUrl}
            className="mt-4 border px-8 py-3 text-sm uppercase tracking-widest transition-colors hover:bg-[var(--hl-claret)] hover:text-[var(--hl-paper)]"
            style={{
              borderColor: 'var(--hl-claret)',
              color: 'var(--hl-claret)',
              fontFamily: "'EB Garamond', Georgia, serif",
            }}
          >
            Submit Entry
          </a>
        </div>
      </HeritageEngravedFrame>
    </section>
  );
}
