import type { ArmbandAssignment } from '@/components/shows/RegistrationWorkflow/ConfirmationStep.types';
import { getShowEntryFee, type ShowFeeInfo } from '@/components/shows/RegistrationWorkflow/PaymentStep/utils';
import {
  replicatedArmbandsTable,
  replicatedDogRegistrationsTable,
  replicatedDogsTable,
  replicatedEntriesTable,
  replicatedShowsTable,
  type ReplicatedEntry,
} from '@/services/replication';
import { resolveStartNumber } from '@/utils/armbandUtils';
import type {
  ClassSelectionData,
  HandlerInfo,
  PaymentDetails,
  PaymentMethod,
  PaymentStatus,
} from '@/types/show-registration-types';
import { PaymentStatus as PaymentStatusEnum } from '@/types/show-registration-types';
import { makeHandlerKey } from '@/types/show-registration-types';
import { generateUUID } from '@/utils/idUtils';
import type { EntrySubmissionOutcome } from '@/services/database/entries';

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
  paymentStatus?: PaymentStatus | undefined;
  paymentDetails?: PaymentDetails | undefined;
  showFeeInfo: ShowFeeInfo;
}

export interface SubmitOfflineLateEntryResult {
  armbandAssignments: ArmbandAssignment[];
  entryIds: string[];
  entryOutcomes: EntrySubmissionOutcome[];
}

interface DogReservation {
  armband: string;
  dependencyIds: string[];
}

function paymentStatusFor(
  method: PaymentMethod,
  paymentStatus?: PaymentStatus
): ReplicatedEntry['paymentStatus'] {
  if (method === 'waived') return 'waived';
  if (method === 'secretary_paid' || method === 'group_payment') return 'paid';
  if (
    paymentStatus === PaymentStatusEnum.PAID_BY_CASH ||
    paymentStatus === PaymentStatusEnum.PAID_BY_CHECK ||
    paymentStatus === PaymentStatusEnum.PAID_ONLINE
  ) {
    return 'paid';
  }
  return 'pending';
}

function maxArmbandNumber(armbands: Array<{ armbandNumber: string }>): string | null {
  const max = armbands
    .map(armband => parseInt(armband.armbandNumber, 10))
    .filter(number => Number.isFinite(number))
    .reduce((currentMax, number) => Math.max(currentMax, number), 0);

  return max > 0 ? String(max) : null;
}

export async function submitOfflineLateEntry({
  showId,
  classSelections,
  handlerAssignments,
  classes,
  paymentMethod,
  paymentStatus,
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
  const [cachedShow, showArmbands] = await Promise.all([
    replicatedShowsTable.getShowById(showId),
    replicatedArmbandsTable.getByShow(showId),
  ]);
  const startingArmbandNumber = cachedShow?.startingArmbandNumber ?? 100;
  let nextArmband = resolveStartNumber(maxArmbandNumber(showArmbands), startingArmbandNumber);
  const dogReservations = new Map<string, DogReservation>();
  const armbandAssignments: ArmbandAssignment[] = [];
  const entryIds: string[] = [];
  const entryOutcomes: EntrySubmissionOutcome[] = [];

  for (const selection of classSelections) {
    const dogDependencyIds = [
      ...(await replicatedDogsTable.getPendingMutationIdsForRow(selection.dogId)),
      ...(await replicatedDogRegistrationsTable.getPendingMutationIdsForDog(selection.dogId)),
    ];
    let reservation = dogReservations.get(selection.dogId);
    if (!reservation) {
      const existingArmband = showArmbands.find(armband => armband.dogId === selection.dogId);
      if (existingArmband) {
        reservation = {
          armband: existingArmband.armbandNumber,
          dependencyIds: await replicatedArmbandsTable.getPendingMutationIdsForRow(
            existingArmband.id
          ),
        };
      } else {
        const armband = String(nextArmband++);
        const armbandMutationId = await replicatedArmbandsTable.upsertAssignedArmband({
          showId,
          dogId: selection.dogId,
          armbandNumber: armband,
          dependsOn: dogDependencyIds,
        });
        reservation = {
          armband,
          dependencyIds: armbandMutationId ? [armbandMutationId] : [],
        };
        armbandAssignments.push({ dogId: selection.dogId, armband });
      }
      dogReservations.set(selection.dogId, reservation);
    }
    const dependencyIds = [...dogDependencyIds, ...reservation.dependencyIds];

    for (const selectedClass of selection.selectedClasses) {
      const handler = handlerAssignments[makeHandlerKey(selection.dogId, selectedClass.classId)];
      const classData = classesById.get(selectedClass.classId);
      const entryFee = paymentMethod === 'waived' ? 0 : getShowEntryFee(showFeeInfo, classData?.entryFee);
      const capacityOverride = selectedClass.capacityOverride === true;
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
        entrySource: 'myk9',
        capacityOverride,
        paymentMethod,
        paymentStatus: paymentStatusFor(paymentMethod, paymentStatus),
        entryStatus: 'confirmed',
        entry_status: 'confirmed',
        entryFee,
        armband: reservation.armband,
        jumpHeight: selectedClass.jumpHeight,
        moveUpRequested: selectedClass.moveUpRequested,
        move_up_requested: selectedClass.moveUpRequested,
        specialRequests: paymentDetails?.paymentNotes ?? null,
        special_requests: paymentDetails?.paymentNotes ?? null,
        submittedAt,
        updated_at: submittedAt,
      };

      const createdEntry = await replicatedEntriesTable.createEntry(entry, dependencyIds);
      entryIds.push(createdEntry.id);
      entryOutcomes.push({
        dogId: selection.dogId,
        classId: selectedClass.classId,
        outcome: 'created',
        entryId: createdEntry.id,
        waitlistEntryId: null,
        waitlistPosition: null,
        feeCents: Math.round(entryFee * 100),
        capacityOverride,
      });
    }
  }

  return { armbandAssignments, entryIds, entryOutcomes };
}
