/**
 * Pure helpers behind ListFilterBar and ListResultLine: which fields are
 * active, and what the status sentence says about them. Kept apart from the component so the wording is testable without
 * a DOM.
 */

import type { ListDateRange, ListFilterField, ListView } from './types';

export function isFieldActive(field: ListFilterField): boolean {
  if (field.kind === 'options') return field.value !== null;
  return field.value.start !== null || field.value.end !== null;
}

const DAY_FORMAT: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };

function formatDay(date: Date): string {
  return date.toLocaleDateString(undefined, DAY_FORMAT);
}

export function describeDateRange({ start, end }: ListDateRange): string {
  if (start && end) return `${formatDay(start)} – ${formatDay(end)}`;
  if (start) return `after ${formatDay(start)}`;
  if (end) return `before ${formatDay(end)}`;
  return 'any time';
}

/**
 * The value half of an active filter ("Judge", "after Jul 3, 2026"). A value the
 * field no longer offers still shows — raw — so a stale URL is visible and
 * removable rather than silently filtering.
 */
export function describeFieldValue(field: ListFilterField): string {
  if (field.kind === 'dateRange') return describeDateRange(field.value);
  if (field.value === null) return '';
  return field.options.find(option => option.value === field.value)?.label ?? field.value;
}

interface FilterSummaryBase {
  search?: string;
  fields?: readonly ListFilterField[];
  /**
   * Plain-language parts for a filter the page applies that is NOT part of the
   * view state and has no field of its own (a month scrubber, a param kept for a
   * stale link), so nothing narrows the list silently. After the fields, before
   * the search.
   */
  extra?: readonly string[];
}

/**
 * A page with views must say what its view state contributes. `viewCriteria`
 * is REQUIRED whenever `views` is passed (the type enforces it), so a page
 * cannot forget: it lists every restriction the view-state values apply right
 * now (e.g. `["Status: In progress"]`). They are named whenever no preset view
 * matches the state (Custom); the preset's own label stands in for them when
 * one does.
 */
interface FilterSummaryWithViews extends FilterSummaryBase {
  views: readonly ListView[];
  /** The preset the state matches exactly, or null/unknown for Custom. */
  activeViewId: string | null;
  /** The view that means "no narrowing" and is left out of the sentence. Defaults to the first. */
  defaultViewId?: string;
  viewCriteria: readonly string[];
}

interface FilterSummaryWithoutViews extends FilterSummaryBase {
  views?: undefined;
}

type FilterSummaryInput = FilterSummaryWithViews | FilterSummaryWithoutViews;

/**
 * The plain-language parts of whatever is narrowing a list, for the status
 * sentence ("Showing 12 of 214 entries (Pending, Class: Novice A, matching
 * "bob")"). View (or, for Custom, its criteria), then each active field, then
 * the search. A Custom view with no criteria still says so, never nothing.
 */
export function summarizeFilters(input: FilterSummaryInput): string[] {
  const { search, fields = [], extra = [] } = input;
  const parts: string[] = [];
  if (input.views) {
    const { views, activeViewId, viewCriteria } = input;
    const defaultViewId = input.defaultViewId ?? views[0]?.id;
    const view = views.find(candidate => candidate.id === activeViewId);
    if (view) {
      if (view.id !== defaultViewId) parts.push(view.label);
    } else if (viewCriteria.length > 0) {
      parts.push(...viewCriteria);
    } else {
      parts.push('Custom view');
    }
  }
  for (const field of fields) {
    if (isFieldActive(field)) parts.push(`${field.label}: ${describeFieldValue(field)}`);
  }
  parts.push(...extra);
  const term = search?.trim();
  if (term) parts.push(`matching \u201c${term}\u201d`);
  return parts;
}

/** `yyyy-mm-dd` for an `<input type="date">`, in local time. */
export function toDateInputValue(date: Date | null): string {
  if (!date) return '';
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Local midnight for a `yyyy-mm-dd` input value; anything else is no date. */
export function fromDateInputValue(raw: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!match) return null;
  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  return Number.isNaN(date.getTime()) ? null : date;
}
