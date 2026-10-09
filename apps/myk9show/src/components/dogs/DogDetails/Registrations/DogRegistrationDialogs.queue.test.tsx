import React from 'react';
import { act, render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Dog } from '@/types/dog-types';

/**
 * MYK9-1071: the Registrations panels' Add and Edit are queued through the
 * replication mutation queue, so they work at a show with no connection. They
 * used to write PostgREST directly. Delete stays online (MYK9-1075).
 */
const { replica, dogsReplica, directMutations, panelProps } = vi.hoisted(() => ({
  replica: {
    addRegistration: vi.fn(),
    updateRegistration: vi.fn(),
    getRegistrationById: vi.fn(),
    isCold: vi.fn(),
    getRegistrationsForDog: vi.fn(),
  },
  dogsReplica: { getDogById: vi.fn(), getPendingMutationIdsForRow: vi.fn() },
  directMutations: {
    createRegistration: vi.fn(),
    updateRegistration: vi.fn(),
    deleteRegistration: vi.fn(),
  },
  panelProps: {} as Record<string, { onSave: (data: unknown) => Promise<void> }>,
}));

vi.mock('@/services/replication/ReplicatedDogRegistrationsTable', () => ({
  replicatedDogRegistrationsTable: replica,
}));
vi.mock('@/services/replication/ReplicatedDogsTable', () => ({
  replicatedDogsTable: dogsReplica,
}));
vi.mock('@/hooks/queries/useRegistrationsDatabase', () => ({
  useDogRegistrationManagement: () => directMutations,
}));
vi.mock('./AddRegistrationPanel', () => ({
  default: (props: { onSave: (data: unknown) => Promise<void> }) => {
    panelProps.add = props;
    return null;
  },
}));
vi.mock('./EditRegistrationPanel', () => ({
  default: (props: { onSave: (data: unknown) => Promise<void> }) => {
    panelProps.edit = props;
    return null;
  },
}));
vi.mock('./ConfirmDeleteRegistrationDialog', () => ({ default: () => null }));

import DogRegistrationDialogs from './DogRegistrationDialogs';

const form = {
  organization: 'AKC',
  registeredName: 'Official Name',
  breed: 'Beagle',
  variety: '',
  registrationNumber: 'SR1',
  status: 'Active',
  registrationDate: '2026-08-21',
};

function renderDialogs() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <DogRegistrationDialogs dog={{ id: 'dog-1', callName: 'Bea' } as Dog} />
    </QueryClientProvider>
  );
}

describe('DogRegistrationDialogs queues add and edit (MYK9-1071)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    replica.addRegistration.mockResolvedValue({ id: 'reg-new' });
    replica.updateRegistration.mockResolvedValue('mutation-1');
    replica.getRegistrationById.mockResolvedValue({ id: 'reg-1', dogId: 'dog-1' });
    replica.isCold.mockResolvedValue(false);
    replica.getRegistrationsForDog.mockResolvedValue([]);
    dogsReplica.getDogById.mockResolvedValue({ id: 'dog-1' });
    // The old direct path resolves too, so a regression fails on the assertion.
    const succeed = (_input: unknown, options?: { onSuccess?: () => void }) =>
      options?.onSuccess?.();
    directMutations.createRegistration.mockImplementation(succeed);
    directMutations.updateRegistration.mockImplementation(succeed);
  });

  it('queues an Add as an INSERT and never calls the direct create', async () => {
    renderDialogs();
    await act(async () => {
      await panelProps.add!.onSave(form);
    });

    expect(replica.addRegistration).toHaveBeenCalledWith(
      'dog-1',
      expect.objectContaining({
        organization: 'AKC',
        registrationNumber: 'SR1',
        registeredName: 'Official Name',
        breed: 'Beagle',
        variety: null,
        status: 'Active',
        registrationDate: '2026-08-21',
      }),
      {}
    );
    expect(directMutations.createRegistration).not.toHaveBeenCalled();
  });

  it('queues an Edit as an UPDATE and never calls the direct update', async () => {
    renderDialogs();
    await act(async () => {
      await panelProps.edit!.onSave({ ...form, id: 'reg-1', registeredName: 'Renamed' });
    });

    expect(replica.updateRegistration).toHaveBeenCalledWith(
      'reg-1',
      expect.objectContaining({ registeredName: 'Renamed', registrationNumber: 'SR1' })
    );
    expect(directMutations.updateRegistration).not.toHaveBeenCalled();
  });
});
