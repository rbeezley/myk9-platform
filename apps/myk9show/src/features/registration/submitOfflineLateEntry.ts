import type { ArmbandAssignment } from '@/components/shows/RegistrationWorkflow/ConfirmationStep.types';
import { getShowEntryFee, type ShowFeeInfo } from '@/components/shows/RegistrationWorkflow/PaymentStep/utils';
import {
  replicatedDogsTable,
  replicatedEntriesTable,
  type ReplicatedEntry,
} from '@/services/replication';
import type {
  ClassSelectionData,
  HandlerInfo,
  PaymentDetails,
  PaymentMethod,
} from '@/types/show-registration-types';
import { makeHandlerKey } from '@/types/show-registration-types';
import { generateUUID } from '@/utils/idUtils';

interface ClassLike {
  id: string;
  entryFee?: number | undefined;
}

export interface SubmitOfflineLateEntryParams {
  showId: string;
  classSelections: ClassSelectionData[];
  handlerAssignments: Record<string, HandlerInfo>;
  classes: ClassLike[];
  paymentMethod: PaymentMethod | undefined;
  paymentDetails?: PaymentDetails | undefined;
  showFeeInfo: ShowFeeInfo;
}

export interface SubmitOfflineLateEntryResult {
  armbandAssignments: ArmbandAssignment[];
  entryIds: string[];
}

function paymentStatusFor(method: PaymentMethod): ReplicatedEntry['paymentStatus'] {
  return method === 'waived' ? 'waived' : 'paid';
}

function nextArmbandNumber(entries: ReplicatedEntry[]): number {
  const maxParsed = entries
    .map(entry => parseInt(entry.armband ?? '', 10))
    .filter(number => !Number.isNaN(number))
    .reduce((max, number) => (number > max ? number : max), 0);

  return maxParsed + 1;
}

export async function submitOfflineLateEntry({
  showId,
  classSelections,
  handlerAssignments,
  classes,
  paymentMethod,
  paymentDetails,
  showFeeInfo,
}: SubmitOfflineLateEntryParams): Promise<SubmitOfflineLateEntryResult> {
  if (!paymentMethod) {
    throw new Error('Payment method is required to save a late entry');
  }
  if (paymentMethod === 'credit_card') {
    throw new Error('Offline late entries cannot use card checkout');
  }

  const classesById = new Map(classes.map(cls => [cls.id, cls]));
  const existingEntries = await replicatedEntriesTable.getEntriesByShow(showId);
  let nextArmband = nextArmbandNumber(existingEntries);
  const armbandsByDog = new Map<string, string>();
  const armbandAssignments: ArmbandAssignment[] = [];
  const entryIds: string[] = [];

  for (const selection of classSelections) {
    const dogArmband = armbandsByDog.get(selection.dogId) ?? String(nextArmband++);
    if (!armbandsByDog.has(selection.dogId)) {
      armbandsByDog.set(selection.dogId, dogArmband);
      armbandAssignments.push({ dogId: selection.dogId, armband: dogArmband });
    }

    const dogMutationId = (await replicatedDogsTable.getPendingMutationIdsForRow(selection.dogId))[0];

    for (const selectedClass of selection.selectedClasses) {
      const handler = handlerAssignments[makeHandlerKey(selection.dogId, selectedClass.classId)];
      const classData = classesById.get(selectedClass.classId);
      const entryFee = paymentMethod === 'waived' ? 0 : getShowEntryFee(showFeeInfo, classData?.entryFee);
      const submittedAt = new Date().toISOString();
      const entry: ReplicatedEntry = {
        id: generateUUID(),
        dogId: selection.dogId,
        showId,
        classId: selectedClass.classId,
        trialId: selection.trialId,
        trial_id: selection.trialId,
        handler: handler?.handlerName || '',
        handlerId: handler?.handlerId,
        isDayOfShow: true,
        paymentMethod,
        paymentStatus: paymentStatusFor(paymentMethod),
        entryStatus: 'confirmed',
        entry_status: 'confirmed',
        entryFee,
        armband: dogArmband,
        jumpHeight: selectedClass.jumpHeight,
        moveUpRequested: selectedClass.moveUpRequested,
        move_up_requested: selectedClass.moveUpRequested,
        specialRequests: paymentDetails?.paymentNotes ?? null,
        special_requests: paymentDetails?.paymentNotes ?? null,
        submittedAt,
        updated_at: submittedAt,
      };

      const createdEntry = await replicatedEntriesTable.createEntry(entry, dogMutationId);
      entryIds.push(createdEntry.id);
    }
  }

  return { armbandAssignments, entryIds };
}
