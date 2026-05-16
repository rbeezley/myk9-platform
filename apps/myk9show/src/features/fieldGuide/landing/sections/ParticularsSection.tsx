import { useRevealOnScroll } from '@/features/_shared/hooks/useRevealOnScroll';
import { FieldGuideChip } from '../../components/FieldGuideChip';
import { FieldGuideSectionHead } from '../../components/FieldGuideSectionHead';
import {
  FieldGuideTable,
  FieldGuideTableLabelCell,
  FieldGuideTableRow,
  FieldGuideTableValueCell,
} from '../../components/FieldGuideTable';
import { fieldGuideSpacing } from '../../tokens';
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

/**
 * §02 Trial particulars — the dense reference table that defines what
 * Field Guide is for. Mono-cap labels on the left, ink-data on the
 * right, alternating-row backgrounds for scan-ability.
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
    iso ? formatDateInTimezone(iso, timezone, 'iso') : null;

  const rows: Array<{ label: string; value: React.ReactNode }> = [
    { label: 'SANCTIONING', value: licenseLanguage },
    {
      label: 'FORMAT',
      value: trialsCount > 0 ? `${trialsCount} trial${trialsCount === 1 ? '' : 's'}` : null,
    },
    {
      label: 'ENTRY LIMIT',
      value:
        entryLimit != null ? (
          <FieldGuideChip variant="orange">{`${entryLimit} RUNS · FIRM`}</FieldGuideChip>
        ) : null,
    },
    { label: 'OPEN — CLOSE', value: entryOpenDate || entryCloseDate ? `${fmt(entryOpenDate) ?? '—'} → ${fmt(entryCloseDate) ?? '—'}` : null },
    { label: 'CONFIRMATION', value: fmt(confirmationDate) },
  ].filter(r => r.value);

  if (rows.length === 0) return null;

  return (
    <section
      id="§02"
      className="fg-section"
      style={{
        maxWidth: fieldGuideSpacing.contentMax,
        margin: '0 auto',
        padding: `${fieldGuideSpacing.sectionPaddingY}px ${fieldGuideSpacing.pageGutterX}px`,
      }}
    >
      <FieldGuideSectionHead folio="§02" title="Trial particulars" meta="REFERENCE DATA" />
      <div ref={ref} className={`fg-reveal ${revealed ? 'in' : ''}`}>
        <FieldGuideTable ariaLabel="Trial particulars">
          {rows.map((r, i) => (
            <FieldGuideTableRow key={`${r.label}-${i}`} alt={i % 2 === 1}>
              <FieldGuideTableLabelCell>{r.label}</FieldGuideTableLabelCell>
              <FieldGuideTableValueCell>{r.value}</FieldGuideTableValueCell>
            </FieldGuideTableRow>
          ))}
        </FieldGuideTable>
      </div>
    </section>
  );
}
