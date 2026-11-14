import type { ShowTabId } from '@/routes/showManagementSections';

/**
 * The class a secretary is working on rides in the URL, and each of the three class-aware show
 * tabs spells it differently: Show Desk `focus`, Results `classId`, Entry Forms `class`.
 * Switching tabs copies it across so the tab opens on the same class instead of its own default
 * (MYK9-1996). Only the class travels; every other param is the departing tab's own.
 */
const CLASS_PARAM: Partial<Record<ShowTabId, string>> = {
  overview: 'focus',
  results: 'classId',
  entries: 'class',
};

/** The one class the departing tab has selected, or null (none, or Entry Forms filtered to several). */
export function selectedClassOnTab(tab: ShowTabId, search: string): string | null {
  const param = CLASS_PARAM[tab];
  if (!param) return null;
  const value = new URLSearchParams(search).get(param)?.trim();
  if (!value) return null;
  const ids = value.split(',').filter(Boolean);
  return ids.length === 1 ? (ids[0] ?? null) : null;
}

/** The query string (with its `?`, or empty) for `to` when leaving `from` with `search`. */
export function carriedClassSearch(from: ShowTabId, to: ShowTabId, search: string): string {
  const param = CLASS_PARAM[to];
  const classId = selectedClassOnTab(from, search);
  if (!param || !classId) return '';
  return `?${new URLSearchParams({ [param]: classId }).toString()}`;
}
