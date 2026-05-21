import type { ArmbandAssignment } from '@/components/shows/RegistrationWorkflow/ConfirmationStep.types';
import type { ShowFeeInfo } from '@/components/shows/RegistrationWorkflow/PaymentStep/utils';
import { claimNextArmband } from '@/services/database/armbands';
import { submitShowEntries } from '@/services/database/entries';
import { createShowRegistration } from '@/services/database/show-registrations';
import type {
  ClassSelectionData,
  HandlerInfo,
  PaymentDetails,
  PaymentMethod,
} from '@/types/show-registration-types';
import { registrationToEntries } from '@/utils/registrationToEntries';
import type { SelectedDogsOwnerResult } from './selectedDogsOwner';

interface ClassLike {
  id: string;
  entryFee?: number | undefined;
}

interface CurrentRegistrationLike {
  registrationNumber?: string | undefined;
}

export interface ShowRegistrationSubmissionResult {
  aborted: false;
  registrationNumber?: string | undefined;
  dbRegistrationId?: string | undefined;
  armbandAssignments: ArmbandAssignment[];
}

export interface AbortedShowRegistrationSubmissionResult {
  aborted: true;
}

export type SubmitShowRegistrationResult =
  | ShowRegistrationSubmissionResult
  | AbortedShowRegistrationSubmissionResult;

interface SubmitShowRegistrationDeps {
  submitRegistration: (registrationId: string, paymentDetails?: PaymentDetails) => Promise<void>;
  confirmRegistration: (
    registrationId: string,
    paymentReference: string,
    paymentDetails?: PaymentDetails
  ) => Promise<{ confirmationNumber?: string | undefined; dbRegistrationId?: string | undefined }>;
  createShowRegistration: typeof createShowRegistration;
  submitShowEntries: typeof submitShowEntries;
  claimNextArmband: typeof claimNextArmband;
  updateEntryRegistration: (
    entryId: string,
    updates: { armband?: string | undefined },
    userId: string
  ) => Promise<unknown>;
  createSubmissionId: () => string;
}

export interface SubmitShowRegistrationParams {
  showId: string;
  userId: string;
  registrationId: string;
  currentRegistration: CurrentRegistrationLike;
  ownerResolution: SelectedDogsOwnerResult;
  paymentMethod?: PaymentMethod | undefined;
  paymentDetails?: PaymentDetails | undefined;
  classSelections: ClassSelectionData[];
  handlerAssignments: Record<string, HandlerInfo>;
  classes: ClassLike[];
  showFeeInfo: ShowFeeInfo;
  isActive?: (() => boolean) | undefined;
  deps: Pick<
    SubmitShowRegistrationDeps,
    'submitRegistration' | 'confirmRegistration' | 'updateEntryRegistration'
  > &
    Partial<SubmitShowRegistrationDeps>;
}

const DEFAULT_DEPS: Omit<
  SubmitShowRegistrationDeps,
  'submitRegistration' | 'confirmRegistration' | 'updateEntryRegistration'
> = {
  createShowRegistration,
  submitShowEntries,
  claimNextArmband,
  createSubmissionId: () => crypto.randomUUID(),
};

function isStillActive(isActive: (() => boolean) | undefined): boolean {
  return isActive ? isActive() : true;
}

export async function submitShowRegistration({
  showId,
  userId,
  registrationId,
  currentRegistration,
  ownerResolution,
  paymentMethod = 'credit_card',
  paymentDetails,
  classSelections,
  handlerAssignments,
  classes,
  showFeeInfo,
  isActive,
  deps,
}: SubmitShowRegistrationParams): Promise<SubmitShowRegistrationResult> {
  const resolvedDeps: SubmitShowRegistrationDeps = { ...DEFAULT_DEPS, ...deps };

  await resolvedDeps.submitRegistration(registrationId, paymentDetails);
  if (!isStillActive(isActive)) return { aborted: true };

  const enrollment = await ensureEnrollment({
    showId,
    registrationId,
    currentRegistration,
    ownerResolution,
    paymentMethod,
    paymentDetails,
    deps: resolvedDeps,
  });
  if (!isStillActive(isActive)) return { aborted: true };

  const entryInputs = registrationToEntries(
    showId,
    classSelections,
    handlerAssignments,
    classes,
    showFeeInfo
  );
  let armbandAssignments: ArmbandAssignment[] = [];

  if (entryInputs.length > 0 && enrollment.dbRegistrationId) {
    const rpcResult = await resolvedDeps.submitShowEntries({
      showId,
      registrationId: enrollment.dbRegistrationId,
      entries: entryInputs.map(entry => ({
        dogId: entry.dogId,
        classId: entry.classId,
        handlerName: entry.registrationData.handler,
        paymentMethod,
        clientFeeCents: Math.round((entry.registrationData.entryFee ?? 0) * 100),
      })),
      submissionId: resolvedDeps.createSubmissionId(),
      paymentMethod,
    });
    if (!isStillActive(isActive)) return { aborted: true };

    armbandAssignments = await assignArmbandsForEntries({
      showId,
      userId,
      dogIds: entryInputs.map(entry => entry.dogId),
      submittedEntries: rpcResult.entries,
      deps: resolvedDeps,
    });
    if (!isStillActive(isActive)) return { aborted: true };
  }

  return {
    aborted: false,
    registrationNumber: enrollment.registrationNumber,
    dbRegistrationId: enrollment.dbRegistrationId,
    armbandAssignments,
  };
}

async function ensureEnrollment({
  showId,
  registrationId,
  currentRegistration,
  ownerResolution,
  paymentMethod,
  paymentDetails,
  deps,
}: {
  showId: string;
  registrationId: string;
  currentRegistration: CurrentRegistrationLike;
  ownerResolution: SelectedDogsOwnerResult;
  paymentMethod: PaymentMethod;
  paymentDetails?: PaymentDetails | undefined;
  deps: SubmitShowRegistrationDeps;
}): Promise<{ registrationNumber?: string | undefined; dbRegistrationId?: string | undefined }> {
  if (paymentMethod === 'credit_card') {
    const result = await deps.confirmRegistration(registrationId, 'MOCK-PAYMENT-REF', paymentDetails);
    return {
      registrationNumber: result.confirmationNumber ?? currentRegistration.registrationNumber,
      dbRegistrationId: result.dbRegistrationId,
    };
  }

  if (!ownerResolution.ok) {
    throw new Error(
      'Internal: payment submit reached with unresolved enrollment owner. ' +
        'Selected dogs span multiple owners or have no owner set.'
    );
  }

  const result = await deps.createShowRegistration(
    showId,
    ownerResolution.ownerId,
    paymentDetails?.paymentReference,
    paymentDetails
  );

  return {
    registrationNumber: result.data?.confirmationNumber,
    dbRegistrationId: result.data?.id,
  };
}

async function assignArmbandsForEntries({
  showId,
  userId,
  dogIds,
  submittedEntries,
  deps,
}: {
  showId: string;
  userId: string;
  dogIds: string[];
  submittedEntries: Array<{ entryId: string; dogId: string }>;
  deps: SubmitShowRegistrationDeps;
}): Promise<ArmbandAssignment[]> {
  const uniqueDogIds = [...new Set(dogIds)];
  const armbandAssignments = (
    await Promise.all(
      uniqueDogIds.map(async dogId => {
        const { armband } = await deps.claimNextArmband(showId, dogId);
        return armband ? { dogId, armband } : null;
      })
    )
  ).filter((result): result is ArmbandAssignment => result !== null);

  if (armbandAssignments.length === 0) return [];

  const armbandByDog = new Map(armbandAssignments.map(result => [result.dogId, result.armband]));
  await Promise.all(
    submittedEntries.map(({ entryId, dogId }) =>
      armbandByDog.has(dogId)
        ? deps
            .updateEntryRegistration(entryId, { armband: armbandByDog.get(dogId) }, userId)
            .catch(() => {})
        : Promise.resolve()
    )
  );

  return armbandAssignments;
}
