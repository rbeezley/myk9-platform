import { FieldGuideDarkBand } from '../../components/FieldGuideDarkBand';
import { fieldGuideColors } from '../../tokens';

interface TopStripProps {
  showCode: string;
  licenseLanguage: string;
  entryWizardUrl: string;
  /** Optional roster cap to display in the strip — e.g. "360-RUN LIMIT". */
  entryLimit: number | null;
  /** When false, the show has no classes assigned — gate the Enter CTA. */
  canEnterOnline?: boolean;
  entryClosed?: boolean;
}

const SECTION_ANCHORS = [
  { id: '§01', label: 'Welcome' },
  { id: '§02', label: 'Particulars' },
  { id: '§03', label: 'Judges' },
  { id: '§04', label: 'Roster' },
  { id: '§05', label: 'Schedule' },
  { id: '§06', label: 'Plan' },
  { id: '§07', label: 'Registration details' },
] as const;

/**
 * The top ID strip — a sticky dark band carrying the show code, registry
 * meta, anchor links, and the primary "ENTER →" CTA. Mirrors the design
 * mock's `<div class="fg-top">` block.
 */
export function TopStrip({
  showCode,
  licenseLanguage,
  entryWizardUrl,
  entryLimit,
  canEnterOnline = true,
  entryClosed = false,
}: TopStripProps) {
  return (
    <FieldGuideDarkBand
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 30,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 24,
        flexWrap: 'wrap',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <strong style={{ color: fieldGuideColors.orange, fontWeight: 600 }}>{showCode}</strong>
        <span>{licenseLanguage}</span>
        {entryLimit != null && <span>{entryLimit}-RUN LIMIT</span>}
      </div>
      <nav aria-label="Show sections" style={{ display: 'flex', gap: 16 }}>
        {SECTION_ANCHORS.map(anchor => (
          <a
            key={anchor.id}
            href={`#${anchor.id}`}
            aria-label={anchor.label}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: 44,
              color: fieldGuideColors.paperTranslucent,
              textDecoration: 'none',
            }}
          >
            <span aria-hidden="true">{anchor.id}</span>
          </a>
        ))}
      </nav>
      {canEnterOnline ? (
        <a
          href={entryWizardUrl}
          aria-label="Enter show"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: 44,
            padding: '4px 12px',
            background: fieldGuideColors.orange,
            color: fieldGuideColors.paper,
            textDecoration: 'none',
          }}
        >
          ENTER <span aria-hidden="true">→</span>
        </a>
      ) : (
        <span
          style={{
            padding: '4px 12px',
            border: `1px solid ${fieldGuideColors.mute}`,
            color: fieldGuideColors.paperTranslucent,
          }}
        >
          {entryClosed ? 'Entries closed' : 'Classes pending'}
        </span>
      )}
    </FieldGuideDarkBand>
  );
}
