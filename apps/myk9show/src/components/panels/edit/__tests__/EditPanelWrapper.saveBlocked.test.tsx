/** MYK9-2144: a caller can hold Save with a plain reason shown beside it. */
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { render } from '@/test/utils/testUtils';
import { EditPanelWrapper } from '../EditPanelWrapper';

const schema = z.object({ name: z.string() });

function renderPanel(saveBlockedReason?: string) {
  return render(
    <EditPanelWrapper
      open
      onClose={vi.fn()}
      title="Edit Show"
      initialData={{ name: 'Pat' }}
      schema={schema}
      onSave={vi.fn()}
      forceHasChanges
      {...(saveBlockedReason ? { saveBlockedReason } : {})}
    >
      <div />
    </EditPanelWrapper>
  );
}

describe('EditPanelWrapper saveBlockedReason', () => {
  it('disables Save and says why', () => {
    renderPanel('Wait for the new premium to finish.');
    expect(screen.getByRole('button', { name: /Save Changes|Save/ })).toBeDisabled();
    expect(screen.getByText('Wait for the new premium to finish.')).toBeInTheDocument();
  });

  it('leaves Save on when nothing blocks it', () => {
    renderPanel();
    expect(screen.getByRole('button', { name: /Save Changes|Save/ })).toBeEnabled();
    expect(screen.queryByTestId('edit-panel-save-blocked')).toBeNull();
  });
});
