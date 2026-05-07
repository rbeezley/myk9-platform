import { HeritageSectionFolio } from '../../components/HeritageSectionFolio';
import { HeritageHeading } from '../../components/HeritageHeading';
import { HeritageOrnamentRule } from '../../components/HeritageOrnamentRule';
import { useRevealOnScroll } from '../../hooks/useRevealOnScroll';
import { formatDateInTimezone } from '../utils/dateFormat';
import type { HeritageFee } from '../types';

interface ParticularsSectionProps {
  licenseLanguage: string;
  entryOpenDate: string | null;
  entryCloseDate: string | null;
  confirmationDate: string | null;
  entryLimit: number | null;
  fees: HeritageFee[];
  timezone: string;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="flex items-baseline justify-between gap-4 border-b py-2"
      style={{ borderColor: 'var(--hl-gold)' }}
    >
      <dt
        className="shrink-0 text-sm"
        style={{ color: 'var(--hl-quill)', fontFamily: "'EB Garamond', Georgia, serif" }}
      >
        {label}
      </dt>
      <span
        className="h-px flex-1 border-b border-dotted"
        style={{ borderColor: 'var(--hl-gold)' }}
      />
      <dd
        className="shrink-0 text-sm"
        style={{ color: 'var(--hl-ink)', fontFamily: "'EB Garamond', Georgia, serif" }}
      >
        {value}
      </dd>
    </div>
  );
}

export function ParticularsSection({
  licenseLanguage,
  entryOpenDate,
  entryCloseDate,
  confirmationDate,
  entryLimit,
  fees,
  timezone,
}: ParticularsSectionProps) {
  const { ref, revealed } = useRevealOnScroll<HTMLDivElement>();

  const rows: Array<{ label: string; value: string }> = [
    { label: 'Sanctioning', value: licenseLanguage },
    entryOpenDate
      ? { label: 'Opens', value: formatDateInTimezone(entryOpenDate, timezone, 'long') }
      : null,
    entryCloseDate
      ? { label: 'Closes', value: formatDateInTimezone(entryCloseDate, timezone, 'long') }
      : null,
    confirmationDate
      ? {
          label: 'Confirmations',
          value: formatDateInTimezone(confirmationDate, timezone, 'long'),
        }
      : null,
    entryLimit != null ? { label: 'Entry limit', value: String(entryLimit) } : null,
  ].filter((r): r is { label: string; value: string } => r !== null);

  return (
    <section className="mx-auto max-w-3xl px-6 py-16">
      <div ref={ref} className={`hl-section-head flex flex-col gap-8 ${revealed ? 'in' : ''}`}>
        <div className="flex items-center gap-3">
          <HeritageSectionFolio numeral="III" />
          <HeritageHeading level={2}>Trial Particulars</HeritageHeading>
        </div>
        <HeritageOrnamentRule className="w-48" />

        {rows.length > 0 && (
          <dl className="w-full">
            {rows.map(row => (
              <DetailRow key={row.label} label={row.label} value={row.value} />
            ))}
          </dl>
        )}

        {fees.length > 0 && (
          <div className="mt-4">
            <p
              className="mb-4 text-sm uppercase tracking-widest"
              style={{ color: 'var(--hl-ink)', fontFamily: "'EB Garamond', Georgia, serif" }}
            >
              Of the Fees
            </p>
            <div className="flex flex-wrap gap-6">
              {fees.map(fee => (
                <div
                  key={fee.label}
                  className="flex flex-col items-center gap-1 border px-6 py-4"
                  style={{ borderColor: 'var(--hl-gold)' }}
                >
                  <span
                    className="text-2xl"
                    style={{
                      fontFamily: "'Cormorant Garamond', Georgia, serif",
                      color: 'var(--hl-ink)',
                    }}
                  >
                    {fee.amount}
                  </span>
                  <span
                    className="text-xs uppercase tracking-widest"
                    style={{
                      color: 'var(--hl-quill)',
                      fontFamily: "'EB Garamond', Georgia, serif",
                    }}
                  >
                    {fee.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
