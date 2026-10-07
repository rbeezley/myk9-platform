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
  /** The unfiltered option's wording, e.g. "All classes". Defaults to "Any <label>". */
  allLabel?: string;
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

/**
 * Pick any number of values from a list, e.g. Trial or Class in the Filter
 * menu (docs/plan-entries-filter-button.md). An empty list means unfiltered.
 */
export interface ListMultiOptionsFilterField extends ListFilterFieldBase {
  kind: 'multiOptions';
  options: ListFilterOption[];
  values: string[];
  onChange: (values: string[]) => void;
}

/** Every field the Filter menu takes. `ListFilterBar` still takes only `ListFilterField`. */
export type ListMenuFilterField = ListFilterField | ListMultiOptionsFilterField;

export interface ListView {
  id: string;
  label: string;
  /**
   * Rows in this view. The count is the stat — no separate stat cards.
   * `undefined` shows no count (a link view); `null` means the count is UNKNOWN
   * (still loading, or the query failed) and renders "—", never "0".
   */
  count?: number | null;
  /** A view that lives on another page (e.g. a request queue) is a link, not a filter. */
  href?: string;
}
