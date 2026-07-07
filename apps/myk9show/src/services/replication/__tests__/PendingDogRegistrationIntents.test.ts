import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { databaseManager } from '@myk9/replication';
import {
  clearPendingDogRegistrationIntents,
  getPendingDogRegistrationIntent,
  savePendingDogRegistrationIntents,
} from '../PendingDogRegistrationIntents';

describe('PendingDogRegistrationIntents', () => {
  beforeEach(async () => {
    await databaseManager.reset();
  });

  afterEach(async () => {
    await databaseManager.reset();
  });

  it('saves and reads pending registration intents by dog id', async () => {
    await savePendingDogRegistrationIntents('dog-1', [
      {
        organization: 'AKC',
        number: 'SW123456',
        registeredName: 'Beacon Hill Fast Lane',
        type: 'Border Collie',
        status: 'pending',
      },
    ]);

    const intent = await getPendingDogRegistrationIntent('dog-1');

    expect(intent).toEqual(
      expect.objectContaining({
        dogId: 'dog-1',
        syncStatus: 'pending',
        registrations: [
          {
            organization: 'AKC',
            number: 'SW123456',
            registeredName: 'Beacon Hill Fast Lane',
            type: 'Border Collie',
            status: 'pending',
          },
        ],
      })
    );
  });

  it('clears pending registration intents by dog id', async () => {
    await savePendingDogRegistrationIntents('dog-1', [
      {
        organization: 'AKC',
        number: 'SW123456',
        type: 'Border Collie',
        status: 'pending',
      },
    ]);

    await clearPendingDogRegistrationIntents('dog-1');

    await expect(getPendingDogRegistrationIntent('dog-1')).resolves.toBeNull();
  });
});
