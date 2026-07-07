import { databaseManager, REPLICATION_STORES } from '@myk9/replication';
import type { DogInput } from '@/store/dogStore';

export type PendingDogRegistrationInput = NonNullable<DogInput['registrations']>[number];

export interface PendingDogRegistrationIntent {
  id: string;
  type: 'pending-dog-registration-intents';
  dogId: string;
  registrations: PendingDogRegistrationInput[];
  syncStatus: 'pending' | 'syncing' | 'needs_review' | 'failed' | 'synced';
  createdAt: string;
  updatedAt: string;
}

const intentIdForDog = (dogId: string): string => `pending-dog-registration-intents:${dogId}`;

export async function savePendingDogRegistrationIntents(
  dogId: string,
  registrations: DogInput['registrations']
): Promise<void> {
  if (!registrations || registrations.length === 0) {
    await clearPendingDogRegistrationIntents(dogId);
    return;
  }

  const now = new Date().toISOString();
  const db = await databaseManager.getDatabase('PendingDogRegistrationIntents');
  const existing = (await db.get(
    REPLICATION_STORES.OFFLINE_QUEUE,
    intentIdForDog(dogId)
  )) as PendingDogRegistrationIntent | undefined;

  const intent: PendingDogRegistrationIntent = {
    id: intentIdForDog(dogId),
    type: 'pending-dog-registration-intents',
    dogId,
    registrations: registrations.map(registration => ({
      organization: registration.organization || 'AKC',
      number: registration.number || '',
      registeredName: registration.registeredName,
      type: registration.type || '',
      status: registration.status || 'pending',
    })),
    syncStatus: existing?.syncStatus ?? 'pending',
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  await db.put(REPLICATION_STORES.OFFLINE_QUEUE, intent);
}

export async function getPendingDogRegistrationIntent(
  dogId: string
): Promise<PendingDogRegistrationIntent | null> {
  const db = await databaseManager.getDatabase('PendingDogRegistrationIntents');
  const intent = (await db.get(
    REPLICATION_STORES.OFFLINE_QUEUE,
    intentIdForDog(dogId)
  )) as PendingDogRegistrationIntent | undefined;

  return intent ?? null;
}

export async function clearPendingDogRegistrationIntents(dogId: string): Promise<void> {
  const db = await databaseManager.getDatabase('PendingDogRegistrationIntents');
  await db.delete(REPLICATION_STORES.OFFLINE_QUEUE, intentIdForDog(dogId));
}
