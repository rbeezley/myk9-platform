import { describe, expect, it, vi } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { ShowMapEntryReviewSheet } from '../ShowMapEntryReviewSheet';
import type { ShowMapEntryDisplay } from '../showMapTypes';

const bravoDisplay: ShowMapEntryDisplay = {
  armband: '100',
  dogName: 'Bravo',
  dogId: 'dog-bravo',
  breed: 'Akita',
  handler: 'Test Secretary',
  handlerId: 'person-secretary',
};

function renderSheet(overrides: Partial<Parameters<typeof ShowMapEntryReviewSheet>[0]> = {}) {
  const onClose = vi.fn();
  const onApprove = vi.fn();
  const props = {
    open: true,
    onClose,
    onApprove,
    isApproving: false,
    entryDisplay: bravoDisplay,
    parentClassLabel: 'Container Novice',
    ...overrides,
  };
  return {
    ...render(<ShowMapEntryReviewSheet {...props} />),
    onClose,
    onApprove,
  };
}

describe('ShowMapEntryReviewSheet', () => {
  it('renders entry context fields when open', () => {
    const { getByText, getByTestId } = renderSheet();

    expect(getByText('Review entry')).toBeInTheDocument();
    expect(getByText('Submitted, waiting for secretary approval.')).toBeInTheDocument();
    expect(getByText('#100')).toBeInTheDocument();
    expect(getByText('Bravo')).toBeInTheDocument();
    expect(getByText('Akita')).toBeInTheDocument();
    expect(getByText('Test Secretary')).toBeInTheDocument();
    expect(getByText('Container Novice')).toBeInTheDocument();
    expect(getByTestId('entry-review-fields')).toBeInTheDocument();
  });

  it('invokes onApprove when the Approve button is clicked', async () => {
    const { user, onApprove, getByTestId } = renderSheet();
    await user.click(getByTestId('entry-review-approve'));
    expect(onApprove).toHaveBeenCalledTimes(1);
  });

  it('invokes onClose when the Cancel button is clicked', async () => {
    const { user, onClose, getByTestId } = renderSheet();
    await user.click(getByTestId('entry-review-cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('disables both action buttons while approving', () => {
    const { getByTestId } = renderSheet({ isApproving: true });
    expect(getByTestId('entry-review-approve')).toBeDisabled();
    expect(getByTestId('entry-review-cancel')).toBeDisabled();
  });

  it('omits optional fields when not provided', () => {
    const { queryByText } = renderSheet({
      entryDisplay: { dogName: 'Charlie' },
      parentClassLabel: undefined,
    });
    expect(queryByText('Container Novice')).toBeNull();
    expect(queryByText('Akita')).toBeNull();
    expect(queryByText('#100')).toBeNull();
  });

  it('does not render when closed', () => {
    const { queryByText } = renderSheet({ open: false });
    expect(queryByText('Review entry')).toBeNull();
  });
});
