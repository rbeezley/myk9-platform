import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useBreadcrumb } from './useBreadcrumb';
import type { Show } from '@/types/show-types';
import type { Trial } from '@/components/trials/types/trial.types';

// MYK9-929 review: a class crumb opens the one class-detail URL, not the legacy /classes/:id.

const show = { id: 's1', name: 'Spring Show' } as Show;
const trial = { id: 't1', showId: 's1', trialNumber: '1' } as Trial;

describe('useBreadcrumb class crumb', () => {
  it('links to the canonical class-detail URL when the show and trial are known', () => {
    const { result } = renderHook(() =>
      useBreadcrumb({ currentPage: 'entries', show, trial, classId: 'c1', className: 'Novice' })
    );
    const crumb = result.current.find(item => item.id === 'c1');
    expect(crumb?.href).toBe('/shows/s1/trials/t1/classes/c1');
  });

  it('keeps the legacy redirect only when there is no show or trial to build the URL from', () => {
    const { result } = renderHook(() =>
      useBreadcrumb({ currentPage: 'entries', classId: 'c1', className: 'Novice' })
    );
    expect(result.current.find(item => item.id === 'c1')?.href).toBe('/classes/c1');
  });
});
