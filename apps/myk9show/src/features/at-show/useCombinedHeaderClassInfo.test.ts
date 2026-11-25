import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { ClassInfo } from '@myk9/ringside';
import { useCombinedHeaderClassInfo } from './useCombinedHeaderClassInfo';
import type { PaperClaim } from './usePaperClaims';

const mocks = vi.hoisted(() => ({ claim: 'not-paper' as PaperClaim }));
vi.mock('./usePaperClaims', () => ({
  usePaperClaims: () => ({ claimOf: () => mocks.claim, paperClassIds: new Set<string>() }),
}));

const info = { className: 'Novice', classStatus: 'in_progress', actualClassId: 'a' } as ClassInfo;
const headerOf = (cancelled: (id: string) => boolean = () => false) =>
  renderHook(() => useCombinedHeaderClassInfo('show-1', info, 'a', 'b', cancelled)).result.current;

describe('useCombinedHeaderClassInfo (MYK9-1970)', () => {
  it.each(['paper', 'unknown'] as const)(
    'withholds the next-up layout on a combined class whose claim is %s',
    claim => {
      mocks.claim = claim;
      expect(headerOf()?.paperClaim).toBe(claim);
    }
  );

  it('leaves a known phone-scored combined class alone', () => {
    mocks.claim = 'not-paper';
    expect(headerOf()?.paperClaim).toBeUndefined();
  });

  it('still reads Cancelled only when every section is cancelled', () => {
    mocks.claim = 'not-paper';
    expect(headerOf(() => true)?.classStatus).toBe('cancelled');
    expect(headerOf(id => id === 'a')?.classStatus).toBe('in_progress');
  });
});
