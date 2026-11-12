import { supabase } from '@/lib/supabase';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import { saveLifecycleEmailJobForLater } from './api';
import { buildDecisionEmailIdempotencyKey, type DecisionStepType } from './decisionEmail';

/**
 * Saves an entry's decision email as a ready job and returns its id. The preview and the
 * automatic send both go through here, so both address the same recipient under the same
 * idempotency key: a second save for the same entry and decision cannot make a second email.
 */
export function saveDecisionEmailJob(
  entry: EntryManagementEntry,
  stepType: DecisionStepType,
  values: { subject: string; body: string; secretaryNote: string },
  correctionForJobId?: string | null
): Promise<string | null> {
  return saveLifecycleEmailJobForLater({
    supabase,
    showId: entry.showId,
    stepType,
    recipientScope: 'enrollment',
    entryId: entry.id,
    enrollmentId: entry.registrationId,
    recipientEmail: entry.ownerEmail,
    recipientName: entry.ownerName,
    subject: values.subject,
    body: values.body,
    secretaryNote: values.secretaryNote,
    correctionForJobId: correctionForJobId ?? null,
    idempotencyKey: buildDecisionEmailIdempotencyKey(entry, stepType, correctionForJobId),
  });
}
