import { renderHook, act } from '@testing-library/react';
import { useAskQPanelStore } from '@/store/useAskQPanelStore';

describe('useAskQPanelStore', () => {
  beforeEach(() => {
    useAskQPanelStore.getState().close();
  });

  it('starts closed', () => {
    const { result } = renderHook(() => useAskQPanelStore());
    expect(result.current.isOpen).toBe(false);
  });

  it('opens the panel', () => {
    const { result } = renderHook(() => useAskQPanelStore());
    act(() => result.current.open());
    expect(result.current.isOpen).toBe(true);
  });

  it('closes the panel', () => {
    const { result } = renderHook(() => useAskQPanelStore());
    act(() => result.current.open());
    act(() => result.current.close());
    expect(result.current.isOpen).toBe(false);
  });

  it('toggles the panel', () => {
    const { result } = renderHook(() => useAskQPanelStore());
    act(() => result.current.toggle());
    expect(result.current.isOpen).toBe(true);
    act(() => result.current.toggle());
    expect(result.current.isOpen).toBe(false);
  });
});
