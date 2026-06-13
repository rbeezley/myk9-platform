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

export interface ArmbandAssignmentFailure {
  dogId: string;
  error: string;
}

export interface ShowRegistrationSubmissionResult {
  aborted: false;
  registrationNumber?: string | undefined;
  dbRegistrationId?: string | undefined;
  armbandAssignments: ArmbandAssignment[];
  /**
   * Dogs whose armband claim or replicated armband sync failed. The entries
   * themselves are already submitted at this point, so callers must surface
   * these to the user — a silently missing armband means no ring number on show day.
   */
  armbandFailures: ArmbandAssignmentFailure[];
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
  createSubmissionId: () => string;
}

export interface SubmitShowRegistrationParams {
  showId: string;
  userId: string;
  registrationId: string;
  ownerResolution: SelectedDogsOwnerResult;
  paymentMethod?: PaymentMethod | undefined;
  paymentDetails?: PaymentDetails | undefined;
  classSelections: ClassSelectionData[];
  handlerAssignments: Record<string, HandlerInfo>;
  classes: ClassLike[];
  showFeeInfo: ShowFeeInfo;
  /**
   * Whether the submitting user may assign armbands. Armband assignment is a
   * staff-only action (the `assign_armband` RPC rejects everyone else with
   * P0001). Exhibitor self-entries leave armbands unassigned for the secretary
   * to set later, so the doomed RPC call must be skipped — otherwise every
   * self-entry fires a guaranteed 400. Defaults to true for staff callers.
   */
  canAssignArmbands?: boolean | undefined;
  isActive?: (() => boolean) | undefined;
  deps: Pick<
    SubmitShowRegistrationDeps,
    'submitRegistration' | 'confirmRegistration'
  > &
    Partial<SubmitShowRegistrationDeps>;
}

const DEFAULT_DEPS: Omit<
  SubmitShowRegistrationDeps,
  'submitRegistration' | 'confirmRegistration'
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
  registrationId,
  ownerResolution,
  paymentMethod,
  paymentDetails,
  classSelections,
  handlerAssignments,
  classes,
  showFeeInfo,
  canAssignArmbands = true,
  isActive,
  deps,
}: SubmitShowRegistrationParams): Promise<SubmitShowRegistrationResult> {
  const resolvedDeps: SubmitShowRegistrationDeps = { ...DEFAULT_DEPS, ...deps };

  if (!paymentMethod) {
    throw new Error('Payment method is required to submit show registration');
  }

  if (paymentMethod === 'credit_card') {
    throw new Error('Invariant: submitShowRegistration called with credit_card payment method');
  }

  await resolvedDeps.submitRegistration(registrationId, paymentDetails);
  if (!isStillActive(isActive)) return { aborted: true };

  const enrollment = await ensureEnrollment({
    showId,
    ownerResolution,
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
  let armbandFailures: ArmbandAssignmentFailure[] = [];

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

    // Only staff may claim armbands; exhibitor self-entries skip this so the
    // staff-only assign_armband RPC isn't called (and rejected) on every submit.
    if (canAssignArmbands) {
      ({ assignments: armbandAssignments, failures: armbandFailures } =
        await assignArmbandsForEntries({
          showId,
          dogIds: entryInputs.map(entry => entry.dogId),
          submittedEntries: rpcResult.entries,
          deps: resolvedDeps,
        }));
      if (!isStillActive(isActive)) return { aborted: true };
    }
  }

  return {
    aborted: false,
    registrationNumber: enrollment.registrationNumber,
    dbRegistrationId: enrollment.dbRegistrationId,
    armbandAssignments,
    armbandFailures,
  };
}

async function ensureEnrollment({
  showId,
  ownerResolution,
  paymentDetails,
  deps,
}: {
  showId: string;
  ownerResolution: SelectedDogsOwnerResult;
  paymentDetails?: PaymentDetails | undefined;
  deps: SubmitShowRegistrationDeps;
}): Promise<{ registrationNumber?: string | undefined; dbRegistrationId?: string | undefined }> {
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
  dogIds,
  submittedEntries,
  deps,
}: {
  showId: string;
  dogIds: string[];
  submittedEntries: Array<{ entryId: string; dogId: string }>;
  deps: SubmitShowRegistrationDeps;
}): Promise<{ assignments: ArmbandAssignment[]; failures: ArmbandAssignmentFailure[] }> {
  const uniqueDogIds = [...new Set(dogIds)];
  const failures: ArmbandAssignmentFailure[] = [];
  const entryIdsByDog = new Map<string, string[]>();
  submittedEntries.forEach(({ entryId, dogId }) => {
    const entryIds = entryIdsByDog.get(dogId) ?? [];
    entryIds.push(entryId);
    entryIdsByDog.set(dogId, entryIds);
  });

  // Entries are already submitted, so an armband failure must not throw and
  // unwind the submission — but it must not vanish either. Collect failures
  // per dog so the caller can tell the user which dogs need manual armbands.
  const claimResults = await Promise.allSettled(
    uniqueDogIds.map(async dogId => {
      const { armband, error } = await deps.claimNextArmband(showId, dogId, {
        entryIds: entryIdsByDog.get(dogId) ?? [],
      });
      if (armband) return { dogId, armband };
      if (error) throw error;
      return null;
    })
  );
  const armbandAssignments: ArmbandAssignment[] = [];
  claimResults.forEach((result, index) => {
    const dogId = uniqueDogIds[index]!;
    if (result.status === 'fulfilled') {
      if (result.value) armbandAssignments.push(result.value);
    } else {
      failures.push({ dogId, error: toErrorMessage(result.reason) });
    }
  });

  return { assignments: armbandAssignments, failures };
}

function toErrorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}
