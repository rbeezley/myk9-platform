import { render, screen } from '@/test/utils/testUtils';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import type { ShowDraft } from '@/store/wizardStore';
import { FeesPaymentsSection } from '../sections/FeesPaymentsSection';
import { ReviewJuniorHandlerFee } from '../ReviewJuniorHandlerFee';

const draft = (overrides: Partial<ShowDraft> = {}) =>
  ({
    organization: 'AKC',
    preEntryFee: 0,
    dayOfShowFee: 0,
    acceptCheckPayments: false,
    acceptCashPayments: false,
    ...overrides,
  }) as ShowDraft;

describe('FeesPaymentsSection junior handler fee', () => {
  it('shows the field and writes the typed fee to the draft', async () => {
    const onUpdate = vi.fn();
    render(<FeesPaymentsSection show={draft()} onUpdate={onUpdate} />);
    const input = screen.getByLabelText(/Junior Handler Fee/i);
    await userEvent.type(input, '15');
    expect(onUpdate).toHaveBeenLastCalledWith({ juniorHandlerFee: 15 });
  });

  it('hides the field for ASCA', () => {
    render(<FeesPaymentsSection show={draft({ organization: 'ASCA' })} onUpdate={vi.fn()} />);
    expect(screen.queryByLabelText(/Junior Handler Fee/i)).toBeNull();
    // Positive control: the sibling fee is still there.
    expect(screen.getByLabelText(/Day-of-Show Fee/i)).toBeInTheDocument();
  });

  it('hides the field when the wizard is adding to an existing show', () => {
    render(
      <FeesPaymentsSection show={draft()} onUpdate={vi.fn()} juniorHandlerFeeEditable={false} />
    );
    expect(screen.queryByLabelText(/Junior Handler Fee/i)).toBeNull();
    expect(screen.getByLabelText(/Day-of-Show Fee/i)).toBeInTheDocument();
  });
});

describe('ReviewJuniorHandlerFee', () => {
  it('shows the fee the draft will write', () => {
    render(<ReviewJuniorHandlerFee show={draft({ juniorHandlerFee: 15 })} />);
    expect(screen.getByText('Junior Handler Fee')).toBeInTheDocument();
    expect(screen.getByText('$15.00')).toBeInTheDocument();
  });

  it.each([
    ['unset', draft()],
    ['zero', draft({ juniorHandlerFee: 0 })],
    ['ASCA', draft({ organization: 'ASCA', juniorHandlerFee: 15 })],
  ])('renders nothing when the fee is %s', (_label, show) => {
    render(<ReviewJuniorHandlerFee show={show} />);
    expect(screen.queryByText('Junior Handler Fee')).toBeNull();
  });
});
