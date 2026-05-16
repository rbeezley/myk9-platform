import { formatEditorialDateRange, formatShortDate } from '../utils/dateFormat';
// formatShortDate retained for the "Closes" cell which needs the full
// "Jun 3, 2026" form rather than a bare range.

interface IssueStripProps {
  trialStartDate: string | null;
  trialEndDate: string | null;
  entryCloseDate: string | null;
  entryLimit: number | null;
  licenseLanguage: string;
  timezone: string;
}

/**
 * Issue strip — the meta row directly under the hero cover spread that
 * mimics a print magazine's "issue particulars" panel. Four cells in a
 * single row at desktop, two cells per row at mobile.
 *
 * Each cell pairs a tracked smallcaps label (`Inter Tight`, mute) with a
 * display value in Cormorant Garamond, with the optional accented portion
 * rendered in italic gold-3 via inline `<em>` markup.
 */
export function IssueStrip({
  trialStartDate,
  trialEndDate,
  entryCloseDate,
  entryLimit,
  licenseLanguage,
  timezone,
}: IssueStripProps) {
  const dateValue = formatEditorialDateRange(trialStartDate, trialEndDate, timezone) || null;

  const closeValue = entryCloseDate ? formatShortDate(entryCloseDate, timezone) : null;

  const cells: Array<{ label: string; value: React.ReactNode } | null> = [
    dateValue ? { label: 'Dates', value: dateValue } : null,
    closeValue ? { label: 'Closes', value: closeValue } : null,
    entryLimit != null
      ? {
          label: 'Capacity',
          value: (
            <>
              {entryLimit} <em className="em-gold">runs</em>
            </>
          ),
        }
      : null,
    licenseLanguage ? { label: 'License', value: licenseLanguage } : null,
  ];

  const visible = cells.filter((c): c is NonNullable<typeof c> => c !== null);
  if (!visible.length) return null;

  return (
    <section
      className="mx-auto grid w-full max-w-[1280px] gap-6 px-6 py-6 md:grid-cols-4 md:gap-12 md:px-16"
      style={{ borderBottom: '1px solid var(--mz-ink)' }}
    >
      {visible.map(cell => (
        <div key={cell.label}>
          <div
            className="text-xs uppercase"
            style={{
              color: 'var(--mz-mute)',
              fontFamily: 'var(--mz-meta)',
              letterSpacing: '0.32em',
              marginBottom: '6px',
            }}
          >
            {cell.label}
          </div>
          <div
            style={{
              fontFamily: 'var(--mz-display)',
              fontWeight: 500,
              fontSize: '22px',
              letterSpacing: '-0.005em',
              color: 'var(--mz-ink)',
            }}
          >
            {cell.value}
          </div>
        </div>
      ))}
    </section>
  );
}
