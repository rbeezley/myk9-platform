import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { render } from '@/test/utils/testUtils';

import { PaperworkPrintConfirmationDialog } from './PaperworkPrintConfirmationDialog';

describe('PaperworkPrintConfirmationDialog', () => {
  it('does not claim printing and requires an explicit staff confirmation', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <PaperworkPrintConfirmationDialog
        open
        reportLabel="Check-in Sheet"
        isSaving={false}
        onConfirm={onConfirm}
        onOpenChange={vi.fn()}
      />
    );
    expect(screen.getByText(/physical pages or labels/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Not yet' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Mark printed' }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });
});
