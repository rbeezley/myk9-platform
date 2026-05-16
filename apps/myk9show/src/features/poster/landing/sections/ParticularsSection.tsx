import { type ReactNode } from 'react';
import { PosterSectionHead } from '../../components/PosterSectionHead';
import { useRevealOnScroll } from '@/features/_shared/hooks/useRevealOnScroll';
import {
  POSTER_DISPLAY_TIGHT_FAMILY,
  POSTER_MONO_FAMILY,
} from '../../fonts';
import { posterColors, posterSpacing } from '../../tokens';
import { formatDateInTimezone } from '../utils/dateFormat';

interface ParticularsSectionProps {
  licenseLanguage: string;
  entryOpenDate: string | null;
  entryCloseDate: string | null;
  confirmationDate: string | null;
  entryLimit: number | null;
  trialsCount: number;
  timezone: string;
}

interface Row {
  label: string;
  value: ReactNode;
  sub?: string;
  emphasizeRed?: boolean;
}

/**
 * The Poster particulars table — section №2. Big rows separated by hairlines,
 * with bracket borders top + bottom in ink. The "ENTRY LIMIT" and
 * "CLOSES" rows get red highlight chips (background:red, color:cream)
 * to mirror the design mock's emphasis treatment.
 */
export function ParticularsSection({
  licenseLanguage,
  entryOpenDate,
  entryCloseDate,
  confirmationDate,
  entryLimit,
  trialsCount,
  timezone,
}: ParticularsSectionProps) {
  const { ref, revealed } = useRevealOnScroll<HTMLDivElement>();
  const fmt = (iso: string | null) =>
    iso ? formatDateInTimezone(iso, timezone, 'short') : null;
  const fmtCloseUpper = entryCloseDate
    ? formatDateInTimezone(entryCloseDate, timezone, 'monthDayUpper')
    : null;
  const fmtCloseTime = entryCloseDate
    ? formatDateInTimezone(entryCloseDate, timezone, 'time')
    : null;

  const rows: Row[] = [
    { label: 'Sanctioning', value: licenseLanguage },
    {
      label: 'Format',
      value: trialsCount > 0 ? `${trialsCount} trials` : null,
    },
    { label: 'Entries open', value: fmt(entryOpenDate) },
    {
      label: 'Entries close',
      value: fmtCloseUpper ? (
        <span style={{ background: posterColors.red, color: posterColors.cream, padding: '2px 6px' }}>
          {fmtCloseUpper}
          {fmtCloseTime ? ` · ${fmtCloseTime.toUpperCase()}` : ''}
        </span>
      ) : null,
      emphasizeRed: true,
    },
    {
      label: 'Confirmation',
      value: fmt(confirmationDate),
      sub: 'Running orders & armband numbers emailed',
    },
    {
      label: 'Entry limit',
      value:
        entryLimit != null ? (
          <span style={{ background: posterColors.red, color: posterColors.cream, padding: '2px 6px' }}>
            {entryLimit} RUNS · FIRM
          </span>
        ) : null,
      emphasizeRed: true,
    },
  ].filter(r => r.value);

  if (!rows.length) return null;

  return (
    <section
      id="particulars"
      className="po-section"
      style={{
        maxWidth: posterSpacing.contentMax,
        margin: '0 auto',
        padding: `${posterSpacing.sectionPaddingY}px ${posterSpacing.pageGutterX}px`,
        borderBottom: `2px solid ${posterColors.ink}`,
      }}
    >
      <PosterSectionHead number="02" label="Particulars">
        The <span style={{ color: posterColors.red }}>facts.</span>
      </PosterSectionHead>

      <div ref={ref} className={`po-reveal ${revealed ? 'in' : ''}`}>
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            borderTop: `2px solid ${posterColors.ink}`,
          }}
        >
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={`${row.label}-${i}`}
                style={{
                  borderBottom:
                    i === rows.length - 1
                      ? `2px solid ${posterColors.ink}`
                      : `1px solid ${posterColors.hair}`,
                }}
              >
                <th
                  style={{
                    textAlign: 'left',
                    fontFamily: POSTER_MONO_FAMILY,
                    fontWeight: 500,
                    fontSize: 11,
                    letterSpacing: '0.04em',
                    color: posterColors.mute,
                    padding: '22px 28px 22px 0',
                    width: 280,
                    verticalAlign: 'top',
                  }}
                >
                  {row.label.toUpperCase()}
                </th>
                <td
                  style={{
                    padding: '22px 0',
                    fontFamily: POSTER_DISPLAY_TIGHT_FAMILY,
                    fontWeight: 800,
                    fontSize: 22,
                    letterSpacing: '-0.02em',
                    color: posterColors.ink,
                  }}
                >
                  {row.value}
                  {row.sub && (
                    <span
                      style={{
                        display: 'block',
                        marginTop: 6,
                        fontFamily: POSTER_MONO_FAMILY,
                        fontWeight: 400,
                        fontSize: 12,
                        color: posterColors.mute,
                        letterSpacing: '0.02em',
                        lineHeight: 1.5,
                      }}
                    >
                      {row.sub}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
