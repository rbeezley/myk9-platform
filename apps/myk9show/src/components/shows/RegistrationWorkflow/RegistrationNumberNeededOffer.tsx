import { useEffect, useState } from 'react';
import { Phone } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  useRegistrationNumberNeededEmail,
  type RegistrationNumberNeededTarget,
} from '@/features/lifecycle-emails';
import { getTrialRegistry } from '@/features/registries';
import { mapSecretaryEntryToEntryManagementEntry } from '@/hooks/useEntryManagementData';
import { getEntriesForShow } from '@/services/database/entries';
import { getTrialsByShow } from '@/services/database/trials';
import type { ClassSelectionData } from '@/types/show-registration-types';

interface RegistrationNumberNeededOfferProps {
  showId: string;
  showName?: string | undefined;
  /** The selections this save created entries for. */
  classSelections: readonly ClassSelectionData[];
}

const READ_ATTEMPTS = 6;
const READ_RETRY_MS = 2000;
// Entries already offered in this browser session: a remount of the confirmation
// step must not offer the same email twice.
const offeredEntryIds = new Set<string>();

const pairKey = (dogId: string, classId: string | null | undefined) => `${dogId}|${classId ?? ''}`;

/**
 * After a secretary saves entries (MYK9-1162), offers the "registration number
 * needed" email for each entry the SERVER holds. The entries are found by the
 * dog and class just saved (a live entry for a pair is unique), and the read is
 * retried briefly because the new rows may not have reached the device yet.
 * Nothing here decides "held": it reads the server's verdict. An exhibitor with
 * no email address gets no email, and the secretary is told so.
 */
export function RegistrationNumberNeededOffer({
  showId,
  showName,
  classSelections,
}: RegistrationNumberNeededOfferProps) {
  const { offer, dialog } = useRegistrationNumberNeededEmail({ showId, showName });
  const [noEmail, setNoEmail] = useState<RegistrationNumberNeededTarget[]>([]);
  const wantedKey = classSelections
    .flatMap(selection =>
      selection.selectedClasses.map(({ classId }) => pairKey(selection.dogId, classId))
    )
    .sort()
    .join(',');

  useEffect(() => {
    if (!wantedKey) return;
    const wanted = new Set(wantedKey.split(','));
    let cancelled = false;

    const run = async () => {
      for (let attempt = 0; attempt < READ_ATTEMPTS && !cancelled; attempt += 1) {
        if (attempt > 0) await new Promise(resolve => setTimeout(resolve, READ_RETRY_MS));
        if (cancelled) return;
        const { data } = await getEntriesForShow(showId).catch(() => ({ data: null }));
        const entries = (data ?? [])
          .map(row => mapSecretaryEntryToEntryManagementEntry(row))
          .filter(entry => wanted.has(pairKey(entry.dogId, entry.classes[0]?.classId)));
        if (entries.length < wanted.size && attempt < READ_ATTEMPTS - 1) continue;

        const held = entries.filter(
          entry => entry.awaitingRegistrationNumber === true && !offeredEntryIds.has(entry.id)
        );
        if (held.length === 0) return;
        const { data: trials } = await getTrialsByShow(showId).catch(() => ({ data: null }));
        const targets = held.map(entry => {
          const trial = (trials ?? []).find(
            candidate => candidate.id === entry.classes[0]?.trialId
          );
          return { entry, registryId: trial ? getTrialRegistry(trial).id : null };
        });
        if (cancelled) return;
        for (const target of targets) offeredEntryIds.add(target.entry.id);
        const result = await offer(targets);
        if (!cancelled) setNoEmail(result.noEmail);
        return;
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [offer, showId, wantedKey]);

  return (
    <>
      {noEmail.length > 0 && (
        <Alert>
          <Phone className="h-4 w-4" aria-hidden="true" />
          <AlertDescription>
            <strong>No email sent. </strong>
            {noEmail.map(({ entry }) => entry.dogName).join(', ')}
            {noEmail.length === 1 ? ' is' : ' are'} held for a registration number, but the
            exhibitor has no email on file. Contact them by phone. The Registration number needed
            list keeps track.
          </AlertDescription>
        </Alert>
      )}
      {dialog}
    </>
  );
}
