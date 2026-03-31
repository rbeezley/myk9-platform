// apps/myk9show/src/pages/secretary/__tests__/useBulkClassOperations.test.ts
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useBulkClassOperations } from '@/hooks/useBulkClassOperations';

describe('useBulkClassOperations', () => {
  it('starts with empty selection', () => {
    const { result } = renderHook(() => useBulkClassOperations());
    expect(result.current.selectedClasses.size).toBe(0);
  });

  it('toggles a class selection', () => {
    const { result } = renderHook(() => useBulkClassOperations());
    act(() => result.current.toggleClass('class-1'));
    expect(result.current.selectedClasses.has('class-1')).toBe(true);
    act(() => result.current.toggleClass('class-1'));
    expect(result.current.selectedClasses.has('class-1')).toBe(false);
  });

  it('toggles all classes in a trial', () => {
    const { result } = renderHook(() => useBulkClassOperations());
    act(() => result.current.toggleAllInTrial('trial-1', ['class-1', 'class-2', 'class-3']));
    expect(result.current.selectedClasses.size).toBe(3);
    // Toggle again deselects all
    act(() => result.current.toggleAllInTrial('trial-1', ['class-1', 'class-2', 'class-3']));
    expect(result.current.selectedClasses.size).toBe(0);
  });

  it('selects all provided class IDs', () => {
    const { result } = renderHook(() => useBulkClassOperations());
    act(() => result.current.selectAll(['class-1', 'class-2']));
    expect(result.current.selectedClasses.size).toBe(2);
  });

  it('clears selection', () => {
    const { result } = renderHook(() => useBulkClassOperations());
    act(() => result.current.selectAll(['class-1', 'class-2']));
    act(() => result.current.clearSelection());
    expect(result.current.selectedClasses.size).toBe(0);
  });
});
