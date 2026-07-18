import { describe, expect, it } from 'vitest';
import {
  CLASS_MANAGEMENT_STATUS_FILTER_VALUES,
  getClassManagementHref,
  isClassManagementStatusFilter,
  normalizeClassManagementSearchParams,
} from '../classManagementFilters';

describe('classManagementFilters', () => {
  it('only accepts known lifecycle status values', () => {
    expect([...CLASS_MANAGEMENT_STATUS_FILTER_VALUES]).toEqual([
      'all',
      'not_started',
      'in_progress',
      'completed',
    ]);
    expect(isClassManagementStatusFilter('not_started')).toBe(true);
    expect(isClassManagementStatusFilter('cancelled')).toBe(false);
    expect(isClassManagementStatusFilter(null)).toBe(false);
  });

  it('defaults status/search/element to all/empty/all and drops them from the URL', () => {
    const result = normalizeClassManagementSearchParams(new URLSearchParams(''));

    expect(result.status).toBe('all');
    expect(result.search).toBe('');
    expect(result.element).toBe('all');
    expect(result.params.toString()).toBe('');
  });

  it('round-trips a valid status/search/element combination', () => {
    const input = new URLSearchParams('status=in_progress&search=fido&element=obedience');
    const result = normalizeClassManagementSearchParams(input);

    expect(result.status).toBe('in_progress');
    expect(result.search).toBe('fido');
    expect(result.element).toBe('obedience');
    expect(result.params.toString()).toBe(input.toString());

    // Re-normalizing the already-normalized params is idempotent (copy-link).
    const again = normalizeClassManagementSearchParams(result.params);
    expect(again.params.toString()).toBe(result.params.toString());
  });

  it('drops an invalid status to the "all" default', () => {
    const result = normalizeClassManagementSearchParams(new URLSearchParams('status=cancelled'));

    expect(result.status).toBe('all');
    expect(result.params.has('status')).toBe(false);
  });

  it('treats an explicit element=all the same as absent', () => {
    const result = normalizeClassManagementSearchParams(new URLSearchParams('element=all'));

    expect(result.element).toBe('all');
    expect(result.params.has('element')).toBe(false);
  });

  it('clears the status param when set back to "all"', () => {
    const result = normalizeClassManagementSearchParams(
      new URLSearchParams('status=all&search=&element=all')
    );

    expect(result.params.toString()).toBe('');
  });

  it('defaults density to comfortable and drops it from the URL', () => {
    const result = normalizeClassManagementSearchParams(new URLSearchParams(''));

    expect(result.density).toBe('comfortable');
    expect(result.params.has('density')).toBe(false);
  });

  it('round-trips density=compact', () => {
    const input = new URLSearchParams('density=compact');
    const result = normalizeClassManagementSearchParams(input);

    expect(result.density).toBe('compact');
    expect(result.params.toString()).toBe(input.toString());

    const again = normalizeClassManagementSearchParams(result.params);
    expect(again.density).toBe('compact');
    expect(again.params.toString()).toBe(result.params.toString());
  });

  it('falls back an invalid density value to comfortable', () => {
    const result = normalizeClassManagementSearchParams(new URLSearchParams('density=huge'));

    expect(result.density).toBe('comfortable');
    expect(result.params.has('density')).toBe(false);
  });
});

describe('getClassManagementHref', () => {
  it('builds an unfiltered path when no status/search/element is given', () => {
    expect(getClassManagementHref({ showId: 'show-1', trialId: 't1' })).toBe(
      '/shows/show-1/classes/t1'
    );
  });

  it('produces a URL whose query round-trips through the normalizer unchanged (copy-link)', () => {
    const href = getClassManagementHref({
      showId: 'show-1',
      trialId: 't1',
      status: 'in_progress',
      search: 'fido',
      element: 'obedience',
    });

    expect(href).toBe('/shows/show-1/classes/t1?status=in_progress&search=fido&element=obedience');

    const [, query] = href.split('?');
    const result = normalizeClassManagementSearchParams(new URLSearchParams(query));
    expect(result.status).toBe('in_progress');
    expect(result.search).toBe('fido');
    expect(result.element).toBe('obedience');
    // Idempotent — re-normalizing the parsed-back params changes nothing.
    expect(result.params.toString()).toBe(query);
  });

  it('drops an explicit "all" status/element from the built URL, matching the normalizer default', () => {
    const href = getClassManagementHref({
      showId: 'show-1',
      trialId: 't1',
      status: 'all',
      element: 'all',
    });
    expect(href).toBe('/shows/show-1/classes/t1');
  });

  it('encodes show and trial ids', () => {
    expect(getClassManagementHref({ showId: 'show/1', trialId: 'trial 1' })).toBe(
      '/shows/show%2F1/classes/trial%201'
    );
  });
});
