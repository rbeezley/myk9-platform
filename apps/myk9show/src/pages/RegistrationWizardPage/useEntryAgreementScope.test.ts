/**
 * MYK9-1799: the entry-agreement tick is kept while she moves between steps, and dropped
 * when the entry it was given for is emptied, wherever that happens.
 */
import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useEntryAgreementScope } from './useEntryAgreementScope';

function setup(initial: { dogCount: number; entryCount: number }) {
  const untick = vi.fn<() => void>();
  const hook = renderHook(
    (props: { dogCount: number; entryCount: number }) =>
      useEntryAgreementScope({ ...props, untick }),
    { initialProps: initial }
  );
  return { untick, rerender: hook.rerender };
}

describe('useEntryAgreementScope', () => {
  it('unticks when the last dog is taken out of the entry, on any step', () => {
    const { untick, rerender } = setup({ dogCount: 1, entryCount: 2 });

    rerender({ dogCount: 0, entryCount: 2 });

    expect(untick).toHaveBeenCalledTimes(1);
  });

  it('unticks when the last class is taken out of the entry, on any step', () => {
    const { untick, rerender } = setup({ dogCount: 1, entryCount: 1 });

    rerender({ dogCount: 1, entryCount: 0 });

    expect(untick).toHaveBeenCalledTimes(1);
  });

  it('keeps the tick while the entry only changes size', () => {
    const { untick, rerender } = setup({ dogCount: 1, entryCount: 2 });

    rerender({ dogCount: 2, entryCount: 3 });
    rerender({ dogCount: 1, entryCount: 1 });

    expect(untick).not.toHaveBeenCalled();
  });

  it('does not treat a restored draft whose selections are still arriving as a removal', () => {
    const { untick, rerender } = setup({ dogCount: 0, entryCount: 0 });

    rerender({ dogCount: 1, entryCount: 2 });

    expect(untick).not.toHaveBeenCalled();
  });
});
