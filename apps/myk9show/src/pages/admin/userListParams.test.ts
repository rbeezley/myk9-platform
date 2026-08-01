import { describe, expect, it } from 'vitest';
import {
  DEFAULT_USER_LIST_PARAMS,
  parseUserListParams,
  userListHref,
  userListParamsToSearch,
  type UserListParams,
} from './userListParams';

const parse = (query: string) => parseUserListParams(new URLSearchParams(query));
const encode = (state: UserListParams) => userListParamsToSearch(state).toString();

describe('parseUserListParams', () => {
  it('returns defaults for an empty query', () => {
    expect(parse('')).toEqual(DEFAULT_USER_LIST_PARAMS);
  });

  it('reads every field', () => {
    const state = parse(
      'q=ada&role=judge&status=suspended&deleted=1&sort=lastLogin&dir=desc&page=3&size=50'
    );

    expect(state.searchTerm).toBe('ada');
    expect(state.filters.role).toBe('judge');
    expect(state.filters.status).toBe('suspended');
    expect(state.filters.showDeleted).toBe(true);
    expect(state.sort).toEqual({ id: 'lastLogin', desc: true });
    expect(state.page).toBe(3);
    expect(state.pageSize).toBe(50);
  });

  it('treats a sort without a direction as ascending', () => {
    expect(parse('sort=name')).toMatchObject({ sort: { id: 'name', desc: false } });
  });

  it('parses a date range to local midnight', () => {
    const { start, end } = parse('from=2026-01-05&to=2026-02-10').filters.dateRange;

    expect(start?.getFullYear()).toBe(2026);
    expect(start?.getMonth()).toBe(0);
    expect(start?.getDate()).toBe(5);
    expect(end?.getMonth()).toBe(1);
    expect(end?.getDate()).toBe(10);
  });

  describe('hostile input falls back rather than throwing', () => {
    it.each([
      ['role=notarole', (s: UserListParams) => s.filters.role, 'all'],
      ['status=deleted', (s: UserListParams) => s.filters.status, 'all'],
      ['page=0', (s: UserListParams) => s.page, 1],
      ['page=-4', (s: UserListParams) => s.page, 1],
      ['page=abc', (s: UserListParams) => s.page, 1],
      ['size=37', (s: UserListParams) => s.pageSize, 25],
      ['deleted=true', (s: UserListParams) => s.filters.showDeleted, false],
    ])('%s', (query, read, expected) => {
      expect(read(parse(query))).toEqual(expected);
    });

    it('ignores a malformed date', () => {
      expect(parse('from=last-tuesday').filters.dateRange.start).toBeNull();
      expect(parse('from=2026-13-99').filters.dateRange.start).toBeNull();
    });
  });
});

describe('userListParamsToSearch', () => {
  it('encodes nothing when everything is at its default', () => {
    expect(encode(DEFAULT_USER_LIST_PARAMS)).toBe('');
  });

  it('omits page 1 and the default page size', () => {
    expect(encode({ ...DEFAULT_USER_LIST_PARAMS, page: 1, pageSize: 25 })).toBe('');
  });

  it('omits the direction for an ascending sort', () => {
    expect(encode({ ...DEFAULT_USER_LIST_PARAMS, sort: { id: 'name', desc: false } })).toBe(
      'sort=name'
    );
  });

  it('treats a whitespace-only search as empty', () => {
    expect(encode({ ...DEFAULT_USER_LIST_PARAMS, searchTerm: '   ' })).toBe('');
  });
});

describe('round trip', () => {
  it.each([
    'q=ada&role=judge',
    'status=suspended&deleted=1',
    'sort=lastLogin&dir=desc',
    'page=4&size=100',
    'from=2026-01-05&to=2026-02-10',
  ])('%s survives encode(parse(x))', query => {
    // The breadcrumb hands this string back to the roster, so anything lost here
    // is a filter the admin silently loses on the way back.
    expect(encode(parse(query))).toBe(query);
  });
});

describe('userListParamsToSearch carry-over', () => {
  const carry = (query: string, state: UserListParams = DEFAULT_USER_LIST_PARAMS) =>
    userListParamsToSearch(state, new URLSearchParams(query)).toString();

  it('keeps params the roster does not own', () => {
    // The support deep-link puts ?userId= on this route. Rebuilding the query
    // from list state alone used to drop it on the first keystroke, closing the
    // roles dialog under the admin.
    expect(carry('userId=abc')).toBe('userId=abc');
  });

  it('keeps a foreign param alongside its own', () => {
    const result = carry('userId=abc', { ...DEFAULT_USER_LIST_PARAMS, searchTerm: 'ada' });
    expect(new URLSearchParams(result).get('userId')).toBe('abc');
    expect(new URLSearchParams(result).get('q')).toBe('ada');
  });

  it('does not duplicate or stale-carry params it does own', () => {
    // `q=old` must be replaced by the new state, not appended to it.
    const result = carry('q=old&userId=abc', { ...DEFAULT_USER_LIST_PARAMS, searchTerm: 'new' });
    expect(new URLSearchParams(result).getAll('q')).toEqual(['new']);
  });

  it('drops an owned param that has returned to its default', () => {
    expect(carry('q=old&userId=abc')).toBe('userId=abc');
  });

  it('is unchanged when no carry-over is supplied', () => {
    expect(
      userListParamsToSearch({ ...DEFAULT_USER_LIST_PARAMS, searchTerm: 'ada' }).toString()
    ).toBe('q=ada');
  });
});

describe('userListHref', () => {
  it('stays clean for an unfiltered roster', () => {
    expect(userListHref(DEFAULT_USER_LIST_PARAMS)).toBe('/admin/users');
  });

  it('carries the view state', () => {
    expect(userListHref({ ...DEFAULT_USER_LIST_PARAMS, searchTerm: 'ada', page: 2 })).toBe(
      '/admin/users?q=ada&page=2'
    );
  });
});
