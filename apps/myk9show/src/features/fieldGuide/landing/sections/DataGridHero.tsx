import { FieldGuideChip } from '../../components/FieldGuideChip';
import { FieldGuideDataGrid } from '../../components/FieldGuideDataGrid';
import { FieldGuideHeading } from '../../components/FieldGuideHeading';
import {
  FIELD_GUIDE_BODY_FAMILY,
} from '../../fonts';
import { fieldGuideColors, fieldGuideSpacing } from '../../tokens';
import type { FieldGuideQuickRefCell } from '../types';

interface DataGridHeroProps {
  showName: string;
  showSubtitle: string;
  /** Mono-orange chips at the top of the hero — status + format markers. */
  heroChips?: Array<{ label: string; variant?: 'default' | 'orange' | 'cyan' }>;
  /** Single descriptive paragraph beneath the title, max ~720px wide. */
  description?: string | null;
  cells: FieldGuideQuickRefCell[];
}

/**
 * The Field Guide hero — *not* a flag bar. A stack of chips, the giant
 * sans-700 title with mono-orange subtitle, an optional description
 * paragraph, and the 6-cell quick-reference grid. The grid is the
 * load-bearing element: clubs choose this style precisely because they
 * want exhibitors to be able to scan dates / closes / cap in one glance.
 */
export function DataGridHero({
  showName,
  showSubtitle,
  heroChips = [],
  description,
  cells,
}: DataGridHeroProps) {
  return (
    <header
      style={{
        maxWidth: fieldGuideSpacing.contentMax,
        margin: '0 auto',
        padding: '40px 32px 32px',
        borderBottom: `2px solid ${fieldGuideColors.ink}`,
      }}
    >
      {heroChips.length > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            marginBottom: 18,
            flexWrap: 'wrap',
          }}
        >
          {heroChips.map((c, i) => (
            <FieldGuideChip key={`${c.label}-${i}`} variant={c.variant ?? 'default'}>
              {c.label}
            </FieldGuideChip>
          ))}
        </div>
      )}

      <FieldGuideHeading level="h1" subtitle={showSubtitle} style={{ marginBottom: 16, maxWidth: '22ch' }}>
        {showName || 'Untitled Trial'}
      </FieldGuideHeading>

      {description && (
        <p
          style={{
            fontFamily: FIELD_GUIDE_BODY_FAMILY,
            fontSize: 16,
            lineHeight: 1.55,
            color: fieldGuideColors.soft,
            maxWidth: 720,
            marginTop: 0,
            marginBottom: 28,
          }}
        >
          {description}
        </p>
      )}

      {/* Cell count varies by data — let the grid use cells.length so adding
          a DRAW cell later (when trials.draw_date lands) auto-fits. */}
      <FieldGuideDataGrid cells={cells} />
    </header>
  );
}
