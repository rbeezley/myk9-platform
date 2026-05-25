import { describe, expect, it, vi } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { ShowMapReviewQueueSheet } from '../ShowMapReviewQueueSheet';
import type { ReviewQueueDogGroup } from '../showMapReviewQueue';

const sampleGroups: ReviewQueueDogGroup[] = [
  {
    key: 'dog:dog-bravo',
    dogId: 'dog-bravo',
    dogName: 'Bravo',
    handler: 'Test Secretary',
    entryIds: ['e-bravo-1', 'e-bravo-2', 'e-bravo-3'],
    entryNodeIds: ['entry:e-bravo-1', 'entry:e-bravo-2', 'entry:e-bravo-3'],
    count: 3,
  },
  {
    key: 'dog:dog-ace',
    dogId: 'dog-ace',
    dogName: 'Ace',
    handler: 'Alice Martin',
    entryIds: ['e-ace-1'],
    entryNodeIds: ['entry:e-ace-1'],
    count: 1,
  },
];

function renderSheet(overrides: Partial<Parameters<typeof ShowMapReviewQueueSheet>[0]> = {}) {
  const onClose = vi.fn();
  const onApprove = vi.fn();
  const props = {
    open: true,
    onClose,
    onApprove,
    isApproving: false,
    groups: sampleGroups,
    ...overrides,
  };
  return {
    ...render(<ShowMapReviewQueueSheet {...props} />),
    onClose,
    onApprove,
  };
}

describe('ShowMapReviewQueueSheet', () => {
  it('renders one row per dog group with handler and count', () => {
    const { getByText } = renderSheet();
    expect(getByText('Review queue')).toBeInTheDocument();
    expect(getByText('Bravo')).toBeInTheDocument();
    expect(getByText('Test Secretary · 3 entries')).toBeInTheDocument();
    expect(getByText('Ace')).toBeInTheDocument();
    expect(getByText('Alice Martin · 1 entry')).toBeInTheDocument();
  });

  it('defaults to all dogs selected and total count shown', () => {
    const { getByTestId } = renderSheet();
    expect(getByTestId('review-queue-selected-count').textContent).toBe('4 selected');
  });

  it('approves all entry IDs across all selected dogs when Approve is clicked', async () => {
    const { user, getByTestId, onApprove } = renderSheet();
    await user.click(getByTestId('review-queue-approve'));
    expect(onApprove).toHaveBeenCalledTimes(1);
    expect(onApprove).toHaveBeenCalledWith([
      'e-bravo-1',
      'e-bravo-2',
      'e-bravo-3',
      'e-ace-1',
    ]);
  });

  it('updates count and excludes entries when a dog is unchecked', async () => {
    const { user, getByTestId, onApprove } = renderSheet();
    await user.click(getByTestId('review-queue-toggle-dog:dog-bravo'));
    expect(getByTestId('review-queue-selected-count').textContent).toBe('1 selected');

    await user.click(getByTestId('review-queue-approve'));
    expect(onApprove).toHaveBeenCalledWith(['e-ace-1']);
  });

  it('disables Approve when no dogs are selected', async () => {
    const { user, getByTestId } = renderSheet();
    await user.click(getByTestId('review-queue-toggle-dog:dog-bravo'));
    await user.click(getByTestId('review-queue-toggle-dog:dog-ace'));
    expect(getByTestId('review-queue-approve')).toBeDisabled();
    expect(getByTestId('review-queue-selected-count').textContent).toBe('0 selected');
  });

  it('invokes onClose when Cancel is clicked', async () => {
    const { user, getByTestId, onClose } = renderSheet();
    await user.click(getByTestId('review-queue-cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows "No entries are currently waiting for approval." when the queue is empty', () => {
    const { getByText, queryByTestId } = renderSheet({ groups: [] });
    expect(
      getByText('No entries are currently waiting for approval.')
    ).toBeInTheDocument();
    // Select-all row is hidden when there's nothing to select.
    expect(queryByTestId('review-queue-select-all')).toBeNull();
  });

  it('does not render when closed', () => {
    const { queryByText } = renderSheet({ open: false });
    expect(queryByText('Review queue')).toBeNull();
  });

  it('disables both buttons while approving', () => {
    const { getByTestId } = renderSheet({ isApproving: true });
    expect(getByTestId('review-queue-approve')).toBeDisabled();
    expect(getByTestId('review-queue-cancel')).toBeDisabled();
  });
});
