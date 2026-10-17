import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useFailedNextFeedback } from '../useFailedNextFeedback';

describe('useFailedNextFeedback', () => {
  it('retries once after the render, and a later invalid edit does not steal focus', () => {
    const input = document.createElement('input');
    input.id = 'late';
    const bannerRef = { current: null };
    const { result, rerender } = renderHook(() => useFailedNextFeedback(bannerRef));
    document.body.appendChild(input);
    const other = document.createElement('input');
    document.body.appendChild(other);

    // Nothing to land on and no banner: the single retry runs and finds nothing.
    document.body.removeChild(input);
    result.current(['late']);
    rerender();

    // The control shows up later, while the secretary is typing elsewhere.
    document.body.appendChild(input);
    other.focus();
    rerender();
    rerender();

    expect(other).toHaveFocus();
    expect(input).not.toHaveFocus();
  });

  it('focuses a field that is already mounted at once', () => {
    const input = document.createElement('input');
    input.id = 'now';
    document.body.appendChild(input);
    const { result } = renderHook(() => useFailedNextFeedback({ current: null }));

    result.current(['now']);

    expect(input).toHaveFocus();
  });
});
