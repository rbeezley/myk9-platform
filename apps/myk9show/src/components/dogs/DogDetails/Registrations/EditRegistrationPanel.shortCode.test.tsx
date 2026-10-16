import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import EditRegistrationPanel from './EditRegistrationPanel';

/** MYK9-1207: a registration stored with the short code `AKC` shows, and saves, the full label. */
describe('EditRegistrationPanel stored short org code', () => {
  const stored = {
    id: 'r1',
    organization: 'AKC',
    registeredName: 'CH Maple',
    breed: 'Beagle',
    registrationNumber: 'SR123',
    status: 'Active',
  };

  it('shows the full label selected instead of the placeholder', async () => {
    render(
      <EditRegistrationPanel open={true} onClose={vi.fn()} onSave={vi.fn()} registration={stored} />
    );
    const select = await screen.findByRole('combobox', { name: /registration organization/i });
    expect(select).toHaveTextContent('AKC (American Kennel Club)');
    expect(select).not.toHaveTextContent(/select organization/i);
  });

  it('submits the full label when saved', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { user } = render(
      <EditRegistrationPanel
        open={true}
        onClose={vi.fn()}
        onSave={onSave}
        registration={stored}
        variant="inline"
      />
    );
    await user.clear(await screen.findByLabelText(/registration number/i));
    await user.type(screen.getByLabelText(/registration number/i), 'SR124');
    await user.click(screen.getByRole('button', { name: /save changes/i }));
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({ organization: 'AKC (American Kennel Club)' }),
        expect.anything()
      )
    );
  });
});
