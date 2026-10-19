import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useSubmitFieldErrors } from './useSubmitFieldErrors';

function mountControl(id: string) {
  const input = document.createElement('input');
  input.id = id;
  document.body.appendChild(input);
  return input;
}

describe('useSubmitFieldErrors', () => {
  it('hides errors until a failing submit, then shows them and focuses the first control', () => {
    const input = mountControl('name');
    const { result } = renderHook(() => useSubmitFieldErrors({ name: 'Enter a name.' }));
    expect(result.current.shown).toEqual({});

    let failed = false;
    act(() => {
      failed = result.current.fail();
    });
    expect(failed).toBe(true);
    expect(result.current.shown).toEqual({ name: 'Enter a name.' });
    expect(input).toHaveFocus();
    input.remove();
  });

  it('clears a field once it becomes valid', () => {
    const { result, rerender } = renderHook(({ errors }) => useSubmitFieldErrors(errors), {
      initialProps: { errors: { a: 'A', b: 'B' } as Record<string, string> },
    });
    act(() => {
      result.current.fail();
    });
    expect(result.current.shown).toEqual({ a: 'A', b: 'B' });
    rerender({ errors: { b: 'B' } });
    expect(result.current.shown).toEqual({ b: 'B' });
  });

  it('returns false and does not focus when nothing is wrong', () => {
    const other = mountControl('other');
    const { result } = renderHook(() => useSubmitFieldErrors({}));
    let failed = true;
    act(() => {
      failed = result.current.fail();
    });
    expect(failed).toBe(false);
    expect(result.current.shown).toEqual({});
    expect(other).not.toHaveFocus();
    other.remove();
  });
});
