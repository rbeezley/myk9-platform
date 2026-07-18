import { describe, expect, it } from 'vitest';
import {
  CLASS_MANAGEMENT_STATUS_FILTER_VALUES,
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
});
