/**
 * MYK9-821 (2/3): the Reason textarea kept whatever was typed for one
 * move-up the next time the dialog opened, even for a different entry.
 *
 * A successful move-up closes the dialog by the PARENT flipping the `open`
 * prop directly (`setMoveUpAction(null)` in `useShowMapActionExecutor`) —
 * Base UI's `onOpenChange` never fires for that transition, so a reset
 * living only in this component's own close handler never runs. This
 * component itself never unmounts across opens (`ShowDeskPanel` always
 * renders it), so `useState` alone cannot self-clear either.
 */
import userEvent from '@testing-library/user-event';
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { ShowMapMoveUpDialog } from '../ShowMapMoveUpDialog';
import type { ShowMapNode } from '../showMapTypes';

const entryA = {
  id: 'entry:dest-A',
  type: 'entry',
  label: '#100 Acorn',
  entryDisplay: { armband: '100', dogName: 'Acorn' },
  childrenCount: 0,
} satisfies ShowMapNode;

const entryB = {
  id: 'entry:dest-B',
  type: 'entry',
  label: '#200 Birch',
  entryDisplay: { armband: '200', dogName: 'Birch' },
  childrenCount: 0,
} satisfies ShowMapNode;

function baseProps(node: ShowMapNode) {
  return {
    open: true,
    node,
    targets: [],
    isSubmitting: false,
    onOpenChange: vi.fn(),
    onConfirm: vi.fn(),
  };
}

describe('ShowMapMoveUpDialog Reason reset (MYK9-821)', () => {
  it('clears the Reason box when the dialog reopens on a different entry, staying open the whole time', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<ShowMapMoveUpDialog {...baseProps(entryA)} />);

    const reasonBox = screen.getByLabelText('Reason');
    await user.type(reasonBox, 'Qualified in Novice');
    expect(reasonBox).toHaveValue('Qualified in Novice');

    // Simulate a successful move-up: the PARENT swaps `node` for a different
    // entry while `open` stays true the whole time (mirrors
    // useShowMapActionExecutor's onSuccess calling setMoveUpAction(null) and
    // then a new move-up action being opened, without ever going through
    // this component's own onOpenChange(false)).
    rerender(<ShowMapMoveUpDialog {...baseProps(entryB)} />);

    expect(screen.getByLabelText('Reason')).toHaveValue('');
  });

  it('clears the Reason box on an ordinary close-then-reopen of the same entry', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const { rerender } = render(
      <ShowMapMoveUpDialog {...baseProps(entryA)} onOpenChange={onOpenChange} />
    );

    const reasonBox = screen.getByLabelText('Reason');
    await user.type(reasonBox, 'Secretary correction');
    expect(reasonBox).toHaveValue('Secretary correction');

    rerender(
      <ShowMapMoveUpDialog
        {...baseProps(entryA)}
        node={undefined}
        open={false}
        onOpenChange={onOpenChange}
      />
    );
    rerender(<ShowMapMoveUpDialog {...baseProps(entryA)} onOpenChange={onOpenChange} />);

    expect(screen.getByLabelText('Reason')).toHaveValue('');
  });
});
