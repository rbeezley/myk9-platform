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
    expect(result.current.suggestedPrompt).toBeNull();
  });

  it('opens the panel with a suggested prompt', () => {
    const { result } = renderHook(() => useAskQPanelStore());
    const initialRequestId = result.current.promptRequestId;

    act(() => result.current.openWithPrompt('What should I do if a dog scratches?'));

    expect(result.current.isOpen).toBe(true);
    expect(result.current.suggestedPrompt).toBe('What should I do if a dog scratches?');
    expect(result.current.promptRequestId).toBe(initialRequestId + 1);
  });

  it('increments the prompt request id when the same prompt is selected again', () => {
    const { result } = renderHook(() => useAskQPanelStore());

    act(() => result.current.openWithPrompt('What should I do if a dog scratches?'));
    const firstRequestId = result.current.promptRequestId;
    act(() => result.current.openWithPrompt('What should I do if a dog scratches?'));

    expect(result.current.promptRequestId).toBe(firstRequestId + 1);
  });

  it('clears the suggested prompt without closing the panel', () => {
    const { result } = renderHook(() => useAskQPanelStore());

    act(() => result.current.openWithPrompt('What should I do if a dog scratches?'));
    act(() => result.current.clearSuggestedPrompt());

    expect(result.current.isOpen).toBe(true);
    expect(result.current.suggestedPrompt).toBeNull();
  });

  it('closes the panel', () => {
    const { result } = renderHook(() => useAskQPanelStore());
    act(() => result.current.open());
    act(() => result.current.close());
    expect(result.current.isOpen).toBe(false);
    expect(result.current.suggestedPrompt).toBeNull();
  });

  it('toggles the panel', () => {
    const { result } = renderHook(() => useAskQPanelStore());
    act(() => result.current.toggle());
    expect(result.current.isOpen).toBe(true);
    act(() => result.current.toggle());
    expect(result.current.isOpen).toBe(false);
  });
});
