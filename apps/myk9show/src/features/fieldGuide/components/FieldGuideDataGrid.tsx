import { type JSX, type ReactNode } from 'react';
import { FIELD_GUIDE_DISPLAY_FAMILY, FIELD_GUIDE_MONO_FAMILY } from '../fonts';
import { fieldGuideColors } from '../tokens';

export interface FieldGuideDataGridCell {
  /** Mono uppercase label, e.g. "DATES", "OPENS". */
  label: string;
  /** Cell value — number, date, or short phrase. ReactNode so callers can
   *  wrap a fragment in `<span style={{ color: orangeDeep }}>` for orange
   *  emphasis. */
  value: ReactNode;
  /** When `true`, paint the value in orange-deep. Convenience over
   *  hand-wrapping in a span. */
  emphasis?: boolean;
}

export interface FieldGuideDataGridProps {
  /** Cells to render. Typically 4–6 — the hero grid is exactly 6. */
  cells: FieldGuideDataGridCell[];
  /** Number of columns at desktop. Default = `cells.length` (single row). */
  columns?: number;
  /** Fallback string when a cell value is null/empty. Default "—". */
  fallback?: string;
}

/**
 * FieldGuideDataGrid — the 6-cell quick-reference grid used as the hero
 * (instead of a flag-bar masthead) and the entry-blank top strip. Renders
 * each cell as `[mono label] [display value]` with hairline dividers and
 * 2px ink top/bottom rules.
 *
 * Mobile collapse is handled by `fieldGuide.css` via the `fg-quickref`
 * class (3 columns at <=960px, 2 at <=640px), so the visual rhythm matches
 * a phone's portrait reading flow even for a 6-cell grid.
 */
export function FieldGuideDataGrid({
  cells,
  columns,
  fallback = '—',
}: FieldGuideDataGridProps): JSX.Element {
  const cols = columns ?? cells.length;

  return (
    <div
      className="fg-quickref"
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gap: 0,
        borderTop: `1px solid ${fieldGuideColors.ink}`,
        borderBottom: `1px solid ${fieldGuideColors.ink}`,
      }}
    >
      {cells.map((cell, i) => (
        <div
          key={`${cell.label}-${i}`}
          className="fg-quickref-cell"
          style={{
            padding: '14px 16px',
            borderRight:
              i === cells.length - 1 ? 'none' : `1px solid ${fieldGuideColors.hair}`,
          }}
        >
          <div
            style={{
              fontFamily: FIELD_GUIDE_MONO_FAMILY,
              fontWeight: 500,
              fontSize: 10,
              letterSpacing: '0.04em',
              color: fieldGuideColors.mute,
              textTransform: 'uppercase',
              marginBottom: 6,
            }}
          >
            {cell.label}
          </div>
          <div
            style={{
              fontFamily: FIELD_GUIDE_DISPLAY_FAMILY,
              fontWeight: 700,
              fontSize: 18,
              letterSpacing: '-0.015em',
              color: cell.emphasis ? fieldGuideColors.orangeDeep : fieldGuideColors.ink,
            }}
          >
            {cell.value || fallback}
          </div>
        </div>
      ))}
    </div>
  );
}
