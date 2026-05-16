import { GazetteSectionHead } from '../../components/GazetteSectionHead';
import { formatDateInTimezone } from '../utils/dateFormat';
import type { GazetteFee } from '../types';

interface ParticularsSectionProps {
  licenseLanguage: string;
  entryOpenDate: string | null;
  entryCloseDate: string | null;
  confirmationDate: string | null;
  entryLimit: number | null;
  fees: GazetteFee[];
  timezone: string;
  volumeRoman: string;
}

interface Row {
  label: string;
  primary: string;
  sub?: string | null;
}

/**
 * Section B · Particulars — a definition-list rendered as two columns under
 * 900px and one column on mobile. Each row is `dt` label + `dd` value with a
 * dotted bottom rule and optional `<sub>`-style sub-line.
 *
 * The "Notice to Exhibitors" kicker matches the design mock verbatim — these
 * editorial copy strings are part of the visual register and shouldn't be
 * data-driven.
 */
export function ParticularsSection({
  licenseLanguage,
  entryOpenDate,
  entryCloseDate,
  confirmationDate,
  entryLimit,
  fees,
  timezone,
  volumeRoman,
}: ParticularsSectionProps) {
  const rows: Row[] = [
    { label: 'Sanctioning', primary: licenseLanguage, sub: null },
    entryOpenDate
      ? { label: 'Opens', primary: formatDateInTimezone(entryOpenDate, timezone, 'long') }
      : null,
    entryCloseDate
      ? {
          label: 'Closes',
          primary: formatDateInTimezone(entryCloseDate, timezone, 'long'),
          sub: formatDateInTimezone(entryCloseDate, timezone, 'time'),
        }
      : null,
    confirmationDate
      ? {
          label: 'Confirmations',
          primary: formatDateInTimezone(confirmationDate, timezone, 'long'),
          sub: 'Running orders & armbands emailed',
        }
      : null,
    entryLimit != null
      ? {
          label: 'Entry limit',
          primary: `${entryLimit} runs · firm`,
          sub: 'Over-entries refunded',
        }
      : null,
    ...fees.map<Row>(f => ({ label: f.label, primary: f.amount })),
  ].filter((r): r is Row => r !== null);

  return (
    <section
      id="particulars"
      className="mx-auto max-w-[1100px] border-b px-6 py-12 md:px-12 md:py-14"
      style={{ borderColor: 'var(--gz-ink)' }}
    >
      <GazetteSectionHead
        sectionLetter="B"
        pageRuleTitle="PARTICULARS"
        page={2}
        volume={volumeRoman}
        kicker="Notice to Exhibitors"
        title={<>The trial, <em>in particular</em></>}
        dek="All the facts an entrant requires, set out in the customary manner."
      />
      <dl
        className="grid grid-cols-1 gap-x-12 md:grid-cols-2"
        style={{ columnGap: 48 }}
      >
        {rows.map(row => (
          <div
            key={row.label}
            className="grid items-baseline gap-4 border-b border-dotted py-3"
            style={{
              gridTemplateColumns: '130px 1fr',
              borderColor: 'var(--gz-hair)',
              breakInside: 'avoid-column',
            }}
          >
            <dt
              className="text-[10.5px] font-medium uppercase"
              style={{
                color: 'var(--gz-brown)',
                letterSpacing: '0.18em',
                fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
              }}
            >
              {row.label}
            </dt>
            <dd
              className="m-0"
              style={{
                fontFamily: "'Playfair Display', Georgia, serif",
                fontWeight: 600,
                fontSize: 17,
                color: 'var(--gz-ink)',
                letterSpacing: '-0.005em',
                lineHeight: 1.3,
              }}
            >
              {row.primary}
              {row.sub && (
                <span
                  className="mt-1 block"
                  style={{
                    fontFamily: "'Source Serif 4', Georgia, serif",
                    fontWeight: 400,
                    fontSize: 13,
                    color: 'var(--gz-mute)',
                    lineHeight: 1.5,
                  }}
                >
                  {row.sub}
                </span>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
