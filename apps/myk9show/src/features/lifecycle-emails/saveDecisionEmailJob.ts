import { supabase } from '@/lib/supabase';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import { saveLifecycleEmailJobForLater } from './api';
import {
  buildDecisionEmailKeyForEntries,
  sortDecidedEntries,
  type DecisionStepType,
} from './decisionEmail';

/**
 * Saves a registration's decision email as ONE ready job and returns its id. The preview and
 * the automatic send both go through here, so both address the same recipient under the same
 * idempotency key: a second save for the same decided entries cannot make a second email.
 * `entries` are the entries of one registration decided together (usually one); the job is
 * anchored on the first by id.
 */
export function saveDecisionEmailJob(
  entries: EntryManagementEntry[],
  stepType: DecisionStepType,
  values: { subject: string; body: string; secretaryNote: string },
  correctionForJobId?: string | null
): Promise<string | null> {
  const [entry] = sortDecidedEntries(entries);
  if (!entry) throw new Error('A decision email needs at least one entry');
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
    idempotencyKey: buildDecisionEmailKeyForEntries(entries, stepType, correctionForJobId),
  });
}
