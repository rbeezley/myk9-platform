import { MonogramSectionHead } from '../../components/MonogramSectionHead';
import { useRevealOnScroll } from '@/features/_shared/hooks/useRevealOnScroll';
import { MONOGRAM_BODY_FAMILY, MONOGRAM_DISPLAY_FAMILY } from '../../fonts';
import { monogramColors } from '../../tokens';
import { formatDateInTimezone } from '../utils/dateFormat';
import type { MonogramFee } from '../types';

interface ParticularsSectionProps {
  licenseLanguage: string;
  entryOpenDate: string | null;
  entryCloseDate: string | null;
  confirmationDate: string | null;
  entryLimit: number | null;
  fees: MonogramFee[];
  trialsCount: number;
  timezone: string;
}

interface ParticularRow {
  label: string;
  value: React.ReactNode;
}

/**
 * Particulars — folio ii. A 2-column definition-list grid covering the dry
 * facts an entrant needs at a glance: license number, sport, dates, fees.
 *
 * Rows are filtered to non-empty values so the layout breathes when a trial
 * is under-configured. Falls back gracefully when fees / dates are missing
 * rather than rendering empty cells.
 */
export function ParticularsSection({
  licenseLanguage,
  entryOpenDate,
  entryCloseDate,
  confirmationDate,
  entryLimit,
  fees,
  trialsCount,
  timezone,
}: ParticularsSectionProps) {
  const { ref, revealed } = useRevealOnScroll<HTMLDivElement>();

  const formatDate = (iso: string | null) =>
    iso ? formatDateInTimezone(iso, timezone, 'short') : null;

  const rows: ParticularRow[] = [
    { label: 'License', value: licenseLanguage },
    {
      label: 'Trials',
      value:
        trialsCount > 0 ? (
          <>
            {trialsCount}
            <span style={ITALIC_BRONZE}> {trialsCount === 1 ? 'trial' : 'trials'}</span>
          </>
        ) : null,
    },
    { label: 'Entries open', value: formatDate(entryOpenDate) },
    { label: 'Entries close', value: formatDate(entryCloseDate) },
    {
      label: 'Confirmation',
      value: confirmationDate ? (
        <>
          {formatDate(confirmationDate)}
          <span style={ITALIC_BRONZE}> · emailed to all entrants</span>
        </>
      ) : null,
    },
    {
      label: 'Entry limit',
      value:
        entryLimit != null ? (
          <>
            {entryLimit} runs<span style={ITALIC_BRONZE}> · firm</span>
          </>
        ) : null,
    },
    ...fees.map(fee => ({
      label: fee.label,
      value: fee.amount,
    })),
  ].filter(r => r.value);

  if (rows.length === 0) return null;

  return (
    <section className="mg-section">
      <MonogramSectionHead
        numeral="ii"
        eyebrow="Trial particulars"
        title={
          <>
            All the{' '}
            <span style={{ fontStyle: 'italic', color: monogramColors.bronze }}>
              facts &amp; figures
            </span>
          </>
        }
      />

      <div
        ref={ref}
        className={`mg-particulars ${revealed ? 'in' : ''}`}
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: 0,
          borderTop: `1px solid ${monogramColors.ink}`,
        }}
      >
        {rows.map((row, i) => {
          const isOdd = i % 2 === 0;
          return (
            <div
              key={`${row.label}-${i}`}
              className="mg-particulars__row"
              style={{
                display: 'grid',
                gridTemplateColumns: '200px 1fr',
                gap: 32,
                alignItems: 'baseline',
                padding: isOdd ? '22px 36px 22px 4px' : '22px 4px 22px 36px',
                borderBottom: '1px solid rgba(28, 24, 21, 0.16)',
                borderRight: isOdd ? '1px solid rgba(28, 24, 21, 0.16)' : 'none',
              }}
            >
              <span
                style={{
                  fontFamily: MONOGRAM_BODY_FAMILY,
                  fontSize: 11,
                  fontWeight: 500,
                  letterSpacing: '0.32em',
                  textTransform: 'uppercase',
                  color: monogramColors.bronze,
                }}
              >
                {row.label}
              </span>
              <span
                style={{
                  fontFamily: MONOGRAM_DISPLAY_FAMILY,
                  fontSize: 22,
                  color: monogramColors.ink,
                  letterSpacing: '-0.01em',
                }}
              >
                {row.value}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

const ITALIC_BRONZE: React.CSSProperties = {
  fontStyle: 'italic',
  color: monogramColors.bronze,
};
