import { formatDateInTimezone } from '../utils/dateFormat';

interface FinalCtaSectionProps {
  entryWizardUrl: string;
  entryCloseDate: string | null;
  timezone: string;
}

/**
 * Section H · The final advertisement. A deep-band CTA — Gazette's only
 * dark-background section, sitting between the body of the page and the
 * footer. Renders as a full-width band with 4px double rules above and
 * below for the "final notice" feel.
 */
export function FinalCtaSection({
  entryWizardUrl,
  entryCloseDate,
  timezone,
}: FinalCtaSectionProps) {
  const closeLabel = entryCloseDate
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
          Notice{closeLabel ? ` · Entries close ${closeLabel}` : ' · Entries open'}
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
          You are <em style={{ fontStyle: 'italic', fontWeight: 400, color: 'rgba(247,241,227,0.85)' }}>cordially invited</em> to enter.
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
          First-received basis until the limit is hit.
        </p>
        <a
          href={entryWizardUrl}
          className="inline-flex items-center gap-3.5 px-9 py-4 transition-colors"
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
      </div>
    </section>
  );
}
