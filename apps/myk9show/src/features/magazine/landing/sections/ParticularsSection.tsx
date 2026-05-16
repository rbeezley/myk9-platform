import { MagazineHeading } from '../../components/MagazineHeading';
import { MagazineSectionFolio } from '../../components/MagazineSectionFolio';
import { useRevealOnScroll } from '../../hooks/useRevealOnScroll';
import { formatDateInTimezone } from '../utils/dateFormat';
import type { MagazineFee } from '../types';

interface ParticularsSectionProps {
  licenseLanguage: string;
  entryOpenDate: string | null;
  entryCloseDate: string | null;
  confirmationDate: string | null;
  entryLimit: number | null;
  fees: MagazineFee[];
  timezone: string;
}

interface ParticularsRow {
  label: string;
  primary: string;
  secondary?: string;
}

/**
 * Definition list of trial particulars — sanctioning, dates, capacity, fees.
 * Rendered as `column-count: 2` so the rows pack into two vertical columns
 * at desktop and stack at mobile.
 *
 * Each row is a `<div>` containing a `<dt>` (smallcaps label) + `<dd>`
 * (Cormorant display value, with optional `<span class="sub">` sub-line
 * for fine print).
 *
 * Why `<div>` inside `<dl>`: per spec, `<dl>` only allows `<dt>` / `<dd>`,
 * but the design handoff groups label + value in a bordered row with a
 * dotted-gold underline. Wrapping each row in a `<div>` is the WHATWG-
 * blessed escape hatch and keeps the rows valid HTML.
 */
function buildRows(props: ParticularsSectionProps): ParticularsRow[] {
  const rows: ParticularsRow[] = [{ label: 'Sanctioning', primary: props.licenseLanguage }];
  if (props.entryOpenDate) {
    rows.push({
      label: 'Opens',
      primary: formatDateInTimezone(props.entryOpenDate, props.timezone, 'long'),
    });
  }
  if (props.entryCloseDate) {
    rows.push({
      label: 'Closes',
      primary: formatDateInTimezone(props.entryCloseDate, props.timezone, 'long'),
    });
  }
  if (props.confirmationDate) {
    rows.push({
      label: 'Confirmations',
      primary: formatDateInTimezone(props.confirmationDate, props.timezone, 'long'),
    });
  }
  if (props.entryLimit != null) {
    rows.push({ label: 'Entry limit', primary: String(props.entryLimit), secondary: 'runs total' });
  }
  for (const fee of props.fees) {
    rows.push({ label: fee.label, primary: fee.amount });
  }
  return rows;
}

export function ParticularsSection(props: ParticularsSectionProps) {
  const { ref, revealed } = useRevealOnScroll<HTMLDivElement>();
  const rows = buildRows(props);
  if (!rows.length) return null;

  return (
    <section
      id="particulars"
      className="mx-auto w-full max-w-[1280px] px-6 py-16 md:px-16 md:py-24"
      style={{ borderBottom: '1px solid var(--mz-ink)' }}
    >
      <div
        ref={ref}
        className={`mz-section-head mx-auto mb-16 max-w-3xl text-center ${revealed ? 'in' : ''}`}
      >
        <MagazineSectionFolio label="The particulars" className="mb-6" />
        <MagazineHeading level={2}>
          All the <em className="em-gold">facts &amp; figures</em>
        </MagazineHeading>
      </div>

      <div className="mz-particulars">
        <dl>
          {rows.map(row => (
            <div key={row.label} className="mz-particulars__row">
              <dt>{row.label}</dt>
              <dd>
                {row.primary}
                {row.secondary && <span className="sub">{row.secondary}</span>}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
