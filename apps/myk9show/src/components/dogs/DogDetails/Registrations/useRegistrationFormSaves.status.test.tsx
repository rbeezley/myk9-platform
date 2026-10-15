import { expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@/test/utils/testUtils';
import { registrationToFormData } from '@/components/dogs/registrationForm';
import { useRegistrationFormSaves } from './useRegistrationFormSaves';

it('editing only the date sends the exact lowercase stored status to the database', async () => {
  const updateRegistration = vi.fn();
  const createRegistration = vi.fn();
  const data = {
    ...registrationToFormData({
      id: 'registration-pending',
      organization: 'AKC',
      registeredName: 'CH Pending Dog',
      registrationNumber: 'SR777',
      breed: 'Beagle',
      status: 'pending',
    }),
    registrationDate: '2026-09-23',
  };
  function SaveHarness() {
    const { handleUpdate } = useRegistrationFormSaves({ createRegistration, updateRegistration });
    return <button onClick={() => void handleUpdate(data)}>Save date</button>;
  }
  const { user } = render(<SaveHarness />);
  await user.click(screen.getByRole('button', { name: 'Save date' }));
  await waitFor(() =>
    expect(updateRegistration).toHaveBeenCalledWith(
      {
        id: 'registration-pending',
        updates: expect.objectContaining({ status: 'pending', registration_date: '2026-09-23' }),
      },
      expect.any(Object)
    )
  );
  updateRegistration.mock.calls[0]?.[1]?.onSuccess?.();
});
