import { beforeEach, describe, expect, it } from 'vitest';
import { clearStaleColumnVisibility } from '../useColumnVisibility';

describe('clearStaleColumnVisibility', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('drops the old stored column choice for that table only', () => {
    localStorage.setItem('datatable-cols-a', JSON.stringify({ x: false }));
    localStorage.setItem('datatable-cols-b', JSON.stringify({ y: false }));
    clearStaleColumnVisibility('a');
    expect(localStorage.getItem('datatable-cols-a')).toBeNull();
    expect(localStorage.getItem('datatable-cols-b')).not.toBeNull();
  });

  it('does nothing without a table id', () => {
    localStorage.setItem('datatable-cols-a', '{}');
    clearStaleColumnVisibility(undefined);
    expect(localStorage.getItem('datatable-cols-a')).toBe('{}');
  });
});
