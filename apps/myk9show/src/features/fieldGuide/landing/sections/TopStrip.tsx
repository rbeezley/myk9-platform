import { FieldGuideDarkBand } from '../../components/FieldGuideDarkBand';
import { fieldGuideColors } from '../../tokens';

interface TopStripProps {
  showCode: string;
  licenseLanguage: string;
  entryWizardUrl: string;
  /** Optional roster cap to display in the strip — e.g. "360-RUN LIMIT". */
  entryLimit: number | null;
}

const SECTION_ANCHORS = ['§01', '§02', '§03', '§04', '§05', '§06', '§07'];

/**
 * The top ID strip — a sticky dark band carrying the show code, registry
 * meta, anchor links, and the primary "ENTER →" CTA. Mirrors the design
 * mock's `<div class="fg-top">` block.
 */
export function TopStrip({ showCode, licenseLanguage, entryWizardUrl, entryLimit }: TopStripProps) {
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
      <nav style={{ display: 'flex', gap: 16 }}>
        {SECTION_ANCHORS.map(a => (
          <a
            key={a}
            href={`#${a}`}
            style={{ color: 'rgba(246,241,230,0.7)', textDecoration: 'none' }}
          >
            {a}
          </a>
        ))}
      </nav>
      <a
        href={entryWizardUrl}
        style={{
          padding: '4px 12px',
          background: fieldGuideColors.orange,
          color: fieldGuideColors.paper,
          textDecoration: 'none',
        }}
      >
        ENTER →
      </a>
    </FieldGuideDarkBand>
  );
}
