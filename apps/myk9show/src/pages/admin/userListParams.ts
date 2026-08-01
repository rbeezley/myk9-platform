/**
 * The roster's view state, encoded in the URL.
 *
 * Phase B of docs/plan-ia-admin-person-detail.md turns a row click into a real
 * navigation to `/people/:id`. React state does not survive that round trip, so
 * search / filters / sort / pagination live in the query string instead: the
 * browser's own Back button restores them, and an admin can hand a colleague the
 * exact list they are looking at.
 *
 * Defaults are omitted when encoding, so an unfiltered roster stays `/admin/users`.
 */

import type { UserRole as UserRoleType } from '@/types/user-types';
import type { UserFilter, UserSort } from './UserManagementPage.types';
import {
  DEFAULT_USER_FILTER,
  USER_ROLE_FILTER_VALUES,
  USER_STATUS_FILTER_VALUES,
} from './UserManagementPage.types';

export const DEFAULT_USER_PAGE_SIZE = 25;
export const USER_PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

export interface UserListParams {
  searchTerm: string;
  filters: UserFilter;
  sort: UserSort | null;
  page: number;
  pageSize: number;
}

export const DEFAULT_USER_LIST_PARAMS: UserListParams = {
  searchTerm: '',
  filters: DEFAULT_USER_FILTER,
  sort: null,
  page: 1,
  pageSize: DEFAULT_USER_PAGE_SIZE,
};

/** `yyyy-mm-dd` in, local midnight out. Anything else is treated as absent. */
function parseDate(raw: string | null): Date | null {
  if (!raw) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!match) return null;
  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  // The Date constructor rolls overflow forward rather than rejecting it —
  // `2026-13-99` would silently become April 2027 and filter the roster by a
  // date nobody asked for. Only accept a date that reads back unchanged.
  const roundTrips =
    date.getFullYear() === Number(year) &&
    date.getMonth() === Number(month) - 1 &&
    date.getDate() === Number(day);
  return roundTrips ? date : null;
}

function formatDate(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function parsePositiveInt(raw: string | null, fallback: number): number {
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Read view state out of the URL. Every field falls back to its default rather
 * than throwing — a hand-edited or stale URL should show the roster, not an
 * error.
 */
export function parseUserListParams(params: URLSearchParams): UserListParams {
  const role = params.get('role');
  const status = params.get('status');
  const sortId = params.get('sort');

  return {
    searchTerm: params.get('q') ?? '',
    filters: {
      role: (USER_ROLE_FILTER_VALUES as readonly string[]).includes(role ?? '')
        ? (role as UserRoleType | 'all')
        : 'all',
      status: (USER_STATUS_FILTER_VALUES as readonly string[]).includes(status ?? '')
        ? (status as UserFilter['status'])
        : 'all',
      showDeleted: params.get('deleted') === '1',
      dateRange: {
        start: parseDate(params.get('from')),
        end: parseDate(params.get('to')),
      },
    },
    sort: sortId ? { id: sortId, desc: params.get('dir') === 'desc' } : null,
    page: parsePositiveInt(params.get('page'), 1),
    pageSize: USER_PAGE_SIZE_OPTIONS.includes(Number(params.get('size')))
      ? Number(params.get('size'))
      : DEFAULT_USER_PAGE_SIZE,
  };
}

/** Query keys this module owns. Anything else in the URL belongs to someone else. */
const LIST_PARAM_KEYS = new Set([
  'q',
  'role',
  'status',
  'deleted',
  'from',
  'to',
  'sort',
  'dir',
  'page',
  'size',
]);

/**
 * Write view state back to the URL, omitting anything still at its default.
 *
 * Pass `carryOver` (the current search params) so keys this module does not own
 * survive. Without it, every filter or search keystroke rebuilds the query
 * string from list state alone and silently drops foreign params — which is how
 * the support deep-link's `?userId=` used to vanish the moment an admin typed
 * in the search box, closing the roles dialog under them.
 */
export function userListParamsToSearch(
  state: UserListParams,
  carryOver?: URLSearchParams
): URLSearchParams {
  const params = new URLSearchParams();

  if (carryOver) {
    for (const [key, value] of carryOver.entries()) {
      if (!LIST_PARAM_KEYS.has(key)) params.append(key, value);
    }
  }

  const { searchTerm, filters, sort, page, pageSize } = state;

  if (searchTerm.trim()) params.set('q', searchTerm);
  if (filters.role !== 'all') params.set('role', filters.role);
  if (filters.status !== 'all') params.set('status', filters.status);
  if (filters.showDeleted) params.set('deleted', '1');
  if (filters.dateRange.start) params.set('from', formatDate(filters.dateRange.start));
  if (filters.dateRange.end) params.set('to', formatDate(filters.dateRange.end));
  if (sort) {
    params.set('sort', sort.id);
    if (sort.desc) params.set('dir', 'desc');
  }
  if (page > 1) params.set('page', String(page));
  if (pageSize !== DEFAULT_USER_PAGE_SIZE) params.set('size', String(pageSize));

  return params;
}

/** The roster URL for a given view state — what the breadcrumb links back to. */
export function userListHref(state: UserListParams): string {
  const query = userListParamsToSearch(state).toString();
  return query ? `/admin/users?${query}` : '/admin/users';
}
