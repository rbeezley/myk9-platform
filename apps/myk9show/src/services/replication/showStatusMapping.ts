/**
 * shows.status CHECK values (verified against the live constraint,
 * 2026-10-03). A status in this list is written as itself; it must never fall
 * through to a default (MYK9-983: `upcoming` became `draft` on every full-row
 * UPDATE, unpublishing the show).
 */
export const SHOW_DB_STATUSES = [
  'draft',
  'published',
  'upcoming',
  'in_progress',
  'completed',
  'cancelled',
] as const;

export type ShowDbStatus = (typeof SHOW_DB_STATUSES)[number];

/** Non-DB spellings the app still produces, and the DB status each means. */
const LEGACY_SHOW_STATUS_ALIASES: Readonly<Record<string, ShowDbStatus>> = {
  unpublished: 'draft',
  'In Progress': 'in_progress',
  Completed: 'completed',
  Cancelled: 'cancelled',
};

/**
 * Map an app-level show status to its shows.status CHECK value.
 *
 * An absent status is a brand-new show and starts as `draft`. Any other value
 * the CHECK would not accept throws, rather than silently becoming `draft`.
 */
export function mapShowStatusToDb(status: string | null | undefined): ShowDbStatus {
  if (status === undefined || status === null) return 'draft';
  if ((SHOW_DB_STATUSES as readonly string[]).includes(status)) return status as ShowDbStatus;
  const alias = LEGACY_SHOW_STATUS_ALIASES[status];
  if (alias) return alias;
  throw new Error(`Unknown show status "${status}": not a shows.status value`);
}
