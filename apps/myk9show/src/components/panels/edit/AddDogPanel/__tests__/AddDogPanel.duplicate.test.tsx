import { describe, it, expect, vi } from 'vitest';
import { act, screen } from '@testing-library/react';
import { fromAny } from '@total-typescript/shoehorn';
import { render } from '@/test/utils/testUtils';
import { AddDogPanel } from '../index';
import { PanelSaveHandledError } from '../../panelSaveErrors';
import type { EditPanelSaveContext } from '../../EditPanelWrapper';

const captured = vi.hoisted(() => ({ onSave: null as unknown }));

// Keep the real wrapper; only record the panel's onSave so the test can drive a
// save with exact form data instead of keying a three-tab form by hand.
vi.mock('../../EditPanelWrapper', async importOriginal => {
  const actual = await importOriginal<typeof import('../../EditPanelWrapper')>();
  const Real = actual.EditPanelWrapper;
  return {
    ...actual,
    EditPanelWrapper: (props: { onSave: unknown }) => {
      captured.onSave = props.onSave;
      return <Real {...(props as React.ComponentProps<typeof Real>)} />;
    },
  };
});

const existingDog = fromAny({
  id: 'dog-1',
  callName: 'Ace',
  name: 'Ace',
  ownerId: 'person-1',
  sex: 'male',
  breed: 'Labrador Retriever',
  registrations: [
    {
      id: 'reg-1',
      organization: 'AKC',
      registrationNumber: 'SR12345601',
      registeredName: 'Ace of Spades',
      breed: 'Labrador Retriever',
      status: 'Active',
    },
  ],
});

vi.mock('@/hooks/useDogStoreCompat', () => ({
  useDogStoreCompat: () => ({
    addDog: vi.fn(),
    addDogOfflineFirst: vi.fn(),
    dogs: [existingDog],
    isLoading: false,
    error: null,
  }),
}));

const formData = {
  callName: 'Ace',
  gender: 'Male',
  dateOfBirth: '2020-01-01',
  ownerId: 'person-1',
  microchip: '',
  registrations: [
    {
      id: 'reg-new',
      organization: 'AKC',
      registrationNumber: 'SR12345601',
      registeredName: 'Ace of Spades',
      breed: 'Labrador Retriever',
      status: 'Active',
    },
  ],
};

// M18: a likely duplicate used to throw a plain Error, which the wrapper
// reported as "Failed to save changes" next to the calm duplicate card.
describe('AddDogPanel duplicate-dog prompt (M18)', () => {
  it('rejects with the handled marker and shows the duplicate card', async () => {
    const onDogCreated = vi.fn();
    render(<AddDogPanel open onClose={vi.fn()} onDogCreated={onDogCreated} />);

    const save = captured.onSave as (
      data: typeof formData,
      context: EditPanelSaveContext
    ) => Promise<void>;
    let rejection: unknown;
    await act(async () => {
      rejection = await save(formData, { runSelfNavigation: fn => fn() }).catch(
        (error: unknown) => error
      );
    });

    expect(rejection).toBeInstanceOf(PanelSaveHandledError);
    expect(onDogCreated).not.toHaveBeenCalled();
    expect(await screen.findByRole('button', { name: /use existing dog/i })).toBeInTheDocument();
  });
});
