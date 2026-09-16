import type { Row, Column } from '@tanstack/react-table';

/** Breakpoint at which a column auto-hides via CSS */
export type ResponsiveBreakpoint = 'sm' | 'md' | 'lg' | 'xl' | '2xl';

/** Edit types supported by the built-in editable cell */
export type EditType = 'text' | 'number' | 'select' | 'time' | 'custom';

/** Extended column meta for DataTable features */
export interface DataTableColumnMeta {
  /** Tailwind breakpoint below which this column hides via CSS */
  responsiveHide?: ResponsiveBreakpoint;
  /**
   * Pin this column to the left edge of the table's horizontal scroll area, so
   * it stays visible once the user scrolls right. Intended for the column that
   * identifies the row — without it, reaching a far-right column costs the
   * reader the only thing telling them which row they are looking at
   * (MYK9-222).
   *
   * `true` pins at `left-0` — correct whenever exactly one column pins, since
   * columns to its left simply scroll underneath it.
   *
   * `{ afterLead: true }` pins immediately after a `stickyLeftLead` column
   * instead of at `left-0` (MYK9-592: the dogs-table select column sits ahead
   * of the identity column, and both need to stay visible together — without
   * an offset the trailing `left-0` pin slides on top of the leading one on
   * scroll, and even at scroll-left the leading column has no z-index of its
   * own and paints underneath). The offset is drawn from the shared
   * `STICKY_LEFT_LEAD_WIDTH_CLASS` / `STICKY_LEFT_AFTER_LEAD_CLASS` pair below
   * — never computed at runtime, because Tailwind's JIT only ever generates a
   * class that appears as a literal string in source; a `left-[${n}px]`
   * built from a runtime number would silently emit no CSS at all.
   */
  stickyLeft?: boolean | { afterLead: true };
  /**
   * Marks this column as the fixed-width LEADING sticky-left column that a
   * `stickyLeft: { afterLead: true }` column pins after (MYK9-592). Pins at
   * `left-0` with a z-index above that trailing column's, and forces the
   * cell to `STICKY_LEFT_LEAD_WIDTH_CLASS` so the trailing offset is
   * guaranteed to line up. At most one column should set this.
   */
  stickyLeftLead?: boolean;
  /** Label to use when exporting this column to CSV. */
  exportHeader?: string;
  /** Return a plain export value for this column. Defaults to the column value. */
  exportValue?: (row: unknown) => string | number | boolean | null | undefined;
  /** Exclude this column from CSV export. */
  exportDisabled?: boolean;
  /** Export this column even while it is hidden on screen. */
  exportHidden?: boolean;
  /** Set true when this column renders buttons, links, inputs, or menus. */
  interactive?: boolean;
  /** Enable inline editing for this column */
  editable?: boolean;
  /** Built-in editor type */
  editType?: EditType;
  /** Options for select-type editor */
  editOptions?: Array<{ label: string; value: string }>;
  /** Validate cell value. Returns error string or null. */
  validate?: (value: unknown) => string | null;
  /** Custom editor component for editType: 'custom' */
  editComponent?: (props: EditComponentProps<unknown>) => React.ReactNode;
}

/** Props passed to custom cell editor components */
export interface EditComponentProps<TValue> {
  value: TValue;
  onChange: (value: TValue) => void;
  onCommit: () => void;
  onCancel: () => void;
  row: Row<unknown>;
  column: Column<unknown>;
}

/** Single cell change for batch save */
export interface CellChange {
  rowId: string;
  columnId: string;
  oldValue: unknown;
  newValue: unknown;
}

/** Scoring mode configuration */
export interface ScoringModeConfig {
  enabled: boolean;
  autoAdvance?: boolean;
  conditionalFields?: Record<string, (row: unknown) => boolean>;
  progressIndicator?: boolean;
}

/** CSS class for responsive column hiding */
export const RESPONSIVE_CLASSES: Record<ResponsiveBreakpoint, string> = {
  sm: 'hidden sm:table-cell',
  md: 'hidden md:table-cell',
  lg: 'hidden lg:table-cell',
  xl: 'hidden xl:table-cell',
  '2xl': 'hidden 2xl:table-cell',
};

/**
 * Shared half of the left-pin. The pinned cell has to be opaque or the columns
 * scrolling underneath show straight through it, and `bg-card` is the surface
 * the table itself sits on, so it matches both the header row and an unselected
 * body row exactly. The `::after` hairline is the only cue that the column is
 * pinned rather than merely first, so it is part of the contract.
 *
 * Deliberately no `/opacity` modifier anywhere. `muted`, `border` and `card`
 * are declared as bare `var(--…)` in `tailwind.config.js`, and Tailwind cannot
 * apply an opacity modifier to those — it silently emits NOTHING for
 * `bg-muted/30` or `border-border/50`. (`src/index.css` hand-writes
 * `color-mix()` rules for a fixed list of `primary` opacities for exactly this
 * reason, and that list covers no other token.) A tinted overlay here would
 * therefore not render at all, while the surrounding row's own translucent
 * classes — which are inert for the same reason — would keep looking the way
 * they do today. Matching the surface is both simpler and honest.
 */
const STICKY_LEFT_HAIRLINE =
  "after:pointer-events-none after:absolute after:inset-y-0 after:right-0 after:w-px after:bg-border after:content-['']";

const STICKY_LEFT_BASE = `sticky left-0 bg-card ${STICKY_LEFT_HAIRLINE}`;

/** Left-pin classes for a header cell. */
export const STICKY_LEFT_HEADER_CLASSES = `${STICKY_LEFT_BASE} z-20`;

/**
 * Left-pin classes for a body cell.
 *
 * The selected-row mirror is defensive, not load-bearing: `data-state=selected`
 * comes from `row.getIsSelected()`, and nothing in the app passes `selectable`
 * to `DataTable` today (the dogs table bridges selection to its own hook), so
 * it never fires. It is here so that the first table to turn DataTable's own
 * selection on does not discover that an opaque pinned cell covers the row
 * highlight. Delete it with that feature, not before.
 */
export const STICKY_LEFT_BODY_CLASSES = `${STICKY_LEFT_BASE} z-10 group-data-[state=selected]/row:bg-muted`;

/**
 * The lead column's forced width and the trailing column's matching left
 * offset (MYK9-592). Both are literal Tailwind scale classes (2.5rem / 40px),
 * not arbitrary values built from a runtime number — see the `stickyLeft` doc
 * above for why that matters. Keep these two in step: the offset is only
 * correct if it equals the width.
 */
export const STICKY_LEFT_LEAD_WIDTH_CLASS = 'w-10';
const STICKY_LEFT_AFTER_LEAD_OFFSET_CLASS = 'left-10';

/** Left-pin classes for the LEADING column's header cell — above the
 * trailing (`afterLead`) column's z-20 header. */
export const STICKY_LEFT_LEAD_HEADER_CLASSES = `sticky left-0 ${STICKY_LEFT_LEAD_WIDTH_CLASS} bg-card z-30 ${STICKY_LEFT_HAIRLINE}`;

/** Left-pin classes for the LEADING column's body cell — above the trailing
 * (`afterLead`) column's z-10 body. */
export const STICKY_LEFT_LEAD_BODY_CLASSES = `sticky left-0 ${STICKY_LEFT_LEAD_WIDTH_CLASS} bg-card z-20 group-data-[state=selected]/row:bg-muted ${STICKY_LEFT_HAIRLINE}`;

/** Left-pin classes for a header cell pinned after a `stickyLeftLead` column. */
export const STICKY_LEFT_AFTER_LEAD_HEADER_CLASSES = `sticky ${STICKY_LEFT_AFTER_LEAD_OFFSET_CLASS} bg-card z-20 ${STICKY_LEFT_HAIRLINE}`;

/** Left-pin classes for a body cell pinned after a `stickyLeftLead` column. */
export const STICKY_LEFT_AFTER_LEAD_BODY_CLASSES = `sticky ${STICKY_LEFT_AFTER_LEAD_OFFSET_CLASS} bg-card z-10 group-data-[state=selected]/row:bg-muted ${STICKY_LEFT_HAIRLINE}`;

/**
 * Resolve the layout utilities a DataTable cell gets from its column meta.
 * Pure so the mapping can be asserted without a DOM.
 */
export function getColumnLayoutClasses(
  meta: DataTableColumnMeta | undefined,
  cell: 'header' | 'body'
): string {
  const classes: string[] = [];
  if (meta?.responsiveHide) classes.push(RESPONSIVE_CLASSES[meta.responsiveHide]);
  if (meta?.stickyLeftLead) {
    classes.push(
      cell === 'header' ? STICKY_LEFT_LEAD_HEADER_CLASSES : STICKY_LEFT_LEAD_BODY_CLASSES
    );
  }
  if (meta?.stickyLeft === true) {
    classes.push(cell === 'header' ? STICKY_LEFT_HEADER_CLASSES : STICKY_LEFT_BODY_CLASSES);
  } else if (meta?.stickyLeft && meta.stickyLeft.afterLead) {
    classes.push(
      cell === 'header'
        ? STICKY_LEFT_AFTER_LEAD_HEADER_CLASSES
        : STICKY_LEFT_AFTER_LEAD_BODY_CLASSES
    );
  }
  return classes.join(' ');
}
