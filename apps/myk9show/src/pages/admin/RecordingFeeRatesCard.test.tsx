import { fireEvent, screen, waitFor } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import type { RecordingFeeRate } from '@myk9/core';
import { DUPLICATE_RECORDING_FEE_CODE } from '@/features/payments/useAddRecordingFeeRate';
import { SEEDED_AKC_RECORDING_FEE_RATES } from '@/test/fixtures/recordingFeeRates';
import { RecordingFeeRatesCard } from './RecordingFeeRatesCard';

const mutate = vi.fn();
const queryState: {
  data: RecordingFeeRate[] | undefined;
  isError: boolean;
  isPending: boolean;
  isFetching: boolean;
  fetchStatus: 'idle' | 'fetching' | 'paused';
} = {
  data: SEEDED_AKC_RECORDING_FEE_RATES,
  isError: false,
  isPending: false,
  isFetching: false,
  fetchStatus: 'idle',
};
vi.mock('@/hooks/queries/useRecordingFeeRates', () => ({
  useRecordingFeeRates: () => queryState,
  RECORDING_FEE_RATES_QUERY_KEY: ['registry-recording-fee-rates'],
}));
vi.mock('@/features/payments/useAddRecordingFeeRate', async importOriginal => ({
  ...(await importOriginal<typeof import('@/features/payments/useAddRecordingFeeRate')>()),
  useAddRecordingFeeRate: () => ({ mutate, isPending: false }),
}));

function fill(date: string, amount: string) {
  fireEvent.change(screen.getByLabelText('Effective from'), { target: { value: date } });
  fireEvent.change(screen.getByLabelText('Amount per entry'), { target: { value: amount } });
}

beforeEach(() => {
  mutate.mockReset();
  queryState.data = SEEDED_AKC_RECORDING_FEE_RATES;
  queryState.isError = false;
  queryState.isPending = false;
  queryState.isFetching = false;
  queryState.fetchStatus = 'idle';
});

describe('RecordingFeeRatesCard', () => {
  it('lists the rates newest first with the amount per entry', () => {
    render(<RecordingFeeRatesCard />);

    const rows = screen.getAllByRole('listitem').map(row => row.textContent);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toContain('$5.50 per entry');
    expect(rows[1]).toContain('$4.50 per entry');
    expect(rows[2]).toContain('$3.50 per entry');
  });

  it('adds a row in integer cents once the date and amount are valid', () => {
    render(<RecordingFeeRatesCard />);
    const add = screen.getByRole('button', { name: 'Add rate' });
    expect(add).toBeDisabled();

    fill('2028-01-01', '6.35');

    expect(add).toBeEnabled();
    fireEvent.click(add);
    expect(mutate).toHaveBeenCalledWith(
      { registry: 'AKC', effectiveFrom: '2028-01-01', amountCents: 635 },
      expect.any(Object)
    );
  });

  it.each(['', '5.555', '-1', 'abc', '10001'])('keeps Add disabled for the amount "%s"', amount => {
    render(<RecordingFeeRatesCard />);
    fill('2028-01-01', amount);

    expect(screen.getByRole('button', { name: 'Add rate' })).toBeDisabled();
  });

  it('says an existing effective date is taken, not that the save failed', async () => {
    mutate.mockImplementationOnce((_rate, options) =>
      options.onError(Object.assign(new Error('dup'), { code: DUPLICATE_RECORDING_FEE_CODE }))
    );
    render(<RecordingFeeRatesCard />);
    fill('2027-01-01', '5.50');
    fireEvent.click(screen.getByRole('button', { name: 'Add rate' }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'AKC already has a rate from that date. Pick a different effective date.'
      )
    );
  });

  it('shows an empty state when no rates are set, and still allows adding one', () => {
    queryState.data = [];
    render(<RecordingFeeRatesCard />);

    expect(screen.getByText(/No recording fee rates are set/)).toBeInTheDocument();
    fill('2027-01-01', '5.50');
    expect(screen.getByRole('button', { name: 'Add rate' })).toBeEnabled();
  });

  it('refuses edits against a list it could not read', () => {
    queryState.data = undefined;
    queryState.isError = true;
    render(<RecordingFeeRatesCard />);

    expect(screen.getByRole('alert')).toHaveTextContent('The rate list could not be loaded');
    expect(screen.getByLabelText('Amount per entry')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Add rate' })).toBeDisabled();
  });

  it('treats a paused read over a cached list as unread', () => {
    queryState.fetchStatus = 'paused';
    render(<RecordingFeeRatesCard />);

    expect(screen.getByRole('alert')).toHaveTextContent('The rate list could not be loaded');
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
  });
});
