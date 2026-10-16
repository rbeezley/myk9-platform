import { describe, expect, it } from 'vitest';
import { mergeUnsentWork } from '../dogRegistrationMerge';
import type { ReplicatedDogRegistration } from '../dogRegistrationRows';
import { serverRow } from './dogRegistrationFixtures';

describe('mergeUnsentWork: unsent work wins over the server row with the same id', () => {
  it('shows the device value for a queued add whose acknowledgement was lost', () => {
    const unsent: ReplicatedDogRegistration = {
      id: 'reg-1',
      dogId: 'dog-1',
      organization: 'AKC',
      registrationNumber: 'SR12345601',
      createdAt: '2024-01-01T00:00:00.000Z',
      registeredName: 'Device Value',
      _queuedAdd: true,
    };

    const merged = mergeUnsentWork([serverRow({ registered_name: 'Server Value' })], [unsent]);

    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ id: 'reg-1', registered_name: 'Device Value' });
  });
});
