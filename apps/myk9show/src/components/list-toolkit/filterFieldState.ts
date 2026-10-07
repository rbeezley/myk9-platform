/**
 * Pure helpers behind ListFilterBar: which fields are active, and how a date
 * range reads. Kept apart from the component so the wording is testable without
 * a DOM.
 */

import type { ListDateRange, ListFilterOption, ListMenuFilterField } from './types';

export function isFieldActive(field: ListMenuFilterField): boolean {
  if (field.kind === 'options') return field.value !== null;
  if (field.kind === 'multiOptions') return field.values.length > 0;
  return field.value.start !== null || field.value.end !== null;
}

/** `values` with `value` added at the end, or removed when it is already there. */
export function toggleValue(values: readonly string[], value: string): string[] {
  return values.includes(value) ? values.filter(v => v !== value) : [...values, value];
}

/** Only the values the field still offers, so a stale link cannot filter on nothing. */
export function keepKnownValues(
  values: readonly string[],
  options: readonly ListFilterOption[]
): string[] {
  const known = new Set(options.map(option => option.value));
  return values.filter(value => known.has(value));
}

/** An option's label; a value the field no longer offers reads raw, so it stays visible. */
function labelFor(options: readonly ListFilterOption[], value: string): string {
  return options.find(option => option.value === value)?.label ?? value;
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
 * The plain sentence for one applied filter, "Class: Interior Novice B, Exterior Excellent",
 * or null when the field is not narrowing anything. Several values keep the order the field
 * lists them in, so the sentence does not reshuffle as you pick.
 */
export function describeAppliedFilter(field: ListMenuFilterField): string | null {
  if (!isFieldActive(field)) return null;
  if (field.kind === 'options') {
    return `${field.label}: ${labelFor(field.options, field.value ?? '')}`;
  }
  if (field.kind === 'multiOptions') {
    const offered = field.options.filter(option => field.values.includes(option.value));
    const stale = field.values.filter(value => !field.options.some(o => o.value === value));
    const labels = [...offered.map(option => option.label), ...stale];
    return `${field.label}: ${labels.join(', ')}`;
  }
  return `${field.label}: ${describeDateRange(field.value)}`;
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
