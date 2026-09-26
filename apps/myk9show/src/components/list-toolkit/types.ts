/**
 * Shared shapes for the list toolkit (docs/plan-list-toolkit.md).
 *
 * A page declares its fields and views with these; the toolkit owns how they
 * look and behave, so Users, Dogs and Entries read the same way.
 */

export interface ListFilterOption {
  value: string;
  label: string;
  /** How many rows would match this value on its own. Omit when unknown. */
  count?: number;
}

interface ListFilterFieldBase {
  key: string;
  label: string;
}

/** Pick one value from a list, e.g. Role or Status. `null` means unfiltered. */
export interface ListOptionsFilterField extends ListFilterFieldBase {
  kind: 'options';
  options: ListFilterOption[];
  value: string | null;
  onChange: (value: string | null) => void;
}

export interface ListDateRange {
  start: Date | null;
  end: Date | null;
}

/** An inclusive calendar-day range, e.g. Created. Either end may be open. */
export interface ListDateRangeFilterField extends ListFilterFieldBase {
  kind: 'dateRange';
  value: ListDateRange;
  onChange: (value: ListDateRange) => void;
}

export type ListFilterField = ListOptionsFilterField | ListDateRangeFilterField;

export interface ListView {
  id: string;
  label: string;
  /** Rows in this view. The count is the stat — no separate stat cards. */
  count?: number;
  /** A view that lives on another page (e.g. a request queue) is a link, not a filter. */
  href?: string;
}
