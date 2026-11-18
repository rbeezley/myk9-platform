import type { ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { createTestQueryClient } from '@/test/utils/testUtils';

const insert = vi.fn();
vi.mock('@/lib/supabase', () => ({
  supabase: { from: () => ({ insert }) },
}));

import { parseRecordingFeeDollars, useAddRecordingFeeRate } from './useAddRecordingFeeRate';

beforeEach(() => {
  insert.mockReset();
  insert.mockResolvedValue({ error: null });
});

describe('parseRecordingFeeDollars (MYK9-2044)', () => {
  it.each([
    ['5.50', 550],
    ['5', 500],
    ['4.35', 435],
    ['0.01', 1],
    ['1000', 100_000],
  ])('reads "%s" as %s cents', (typed, cents) => {
    expect(parseRecordingFeeDollars(typed)).toBe(cents);
  });

  it.each(['0', '0.00', '0.0', '1000.01', '5.555', '-1', 'abc', ''])(
    'refuses "%s" (a rate is from one cent to one thousand dollars)',
    typed => {
      expect(parseRecordingFeeDollars(typed)).toBeNull();
    }
  );
});

describe('useAddRecordingFeeRate (MYK9-2044)', () => {
  function renderAdd() {
    const client = createTestQueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    return renderHook(() => useAddRecordingFeeRate(), { wrapper }).result;
  }

  it('inserts a positive rate in integer cents', async () => {
    const result = renderAdd();
    await act(() =>
      result.current.mutateAsync({ registry: 'AKC', effectiveFrom: '2027-01-01', amountCents: 550 })
    );

    expect(insert).toHaveBeenCalledWith({
      registry: 'AKC',
      effective_from: '2027-01-01',
      amount_cents: 550,
    });
  });

  it('refuses a $0.00 rate without writing it', async () => {
    const result = renderAdd();
    await expect(
      act(() =>
        result.current.mutateAsync({ registry: 'AKC', effectiveFrom: '2027-01-01', amountCents: 0 })
      )
    ).rejects.toThrow('Enter a per-entry amount between $0.01 and $1,000.00.');
    expect(insert).not.toHaveBeenCalled();
  });
});
