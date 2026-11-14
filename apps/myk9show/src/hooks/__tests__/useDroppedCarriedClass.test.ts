import { describe, expect, it } from 'vitest';
import { renderHook } from '@/test/utils/testUtils';
import { useDroppedCarriedClass } from '../useDroppedCarriedClass';

describe('useDroppedCarriedClass (MYK9-1996)', () => {
  it('holds a dropped class while nothing is picked, after the URL drops it', () => {
    const { result, rerender } = renderHook(
      ({ dropped, picked }: { dropped: string[]; picked: number }) =>
        useDroppedCarriedClass(dropped, picked),
      { initialProps: { dropped: ['class-gone'], picked: 0 } }
    );
    expect(result.current).toBe('class-gone');

    // The page rewrites the URL, so the next render reports nothing dropped.
    rerender({ dropped: [], picked: 0 });
    expect(result.current).toBe('class-gone');

    // Picking a class clears the notice.
    rerender({ dropped: [], picked: 1 });
    expect(result.current).toBeNull();
  });

  it('settles on a link with one stale and one valid class instead of looping', () => {
    // ?class=class-gone,class-2: one id dropped, one still picked.
    const { result } = renderHook(() => useDroppedCarriedClass(['class-gone'], 1));
    expect(result.current).toBeNull();
  });
});
