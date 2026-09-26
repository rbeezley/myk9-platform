/**
 * Pure helpers behind ListFilterBar: which fields are active, and what their
 * chips say. Kept apart from the component so the wording is testable without
 * a DOM.
 */

import type { ListDateRange, ListFilterField } from './types';

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
 * The value half of an active chip ("Judge", "after Jul 3, 2026"). A value the
 * field no longer offers still shows — raw — so a stale URL is visible and
 * removable rather than silently filtering.
 */
export function describeFieldValue(field: ListFilterField): string {
  if (field.kind === 'dateRange') return describeDateRange(field.value);
  if (field.value === null) return '';
  return field.options.find(option => option.value === field.value)?.label ?? field.value;
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
