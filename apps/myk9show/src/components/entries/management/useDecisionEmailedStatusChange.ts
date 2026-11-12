import { toast } from 'sonner';
import type { useEntryDecisionLifecycleEmails } from '@/features/lifecycle-emails';
import type { DecisionStepType } from '@/features/lifecycle-emails/decisionEmail';
import { EntryStatus } from '@/types/show-registration-types';
import type {
  BulkActionResult,
  BulkStatusChangeOptions,
  EntryManagementEntry,
  StatusChangeOptions,
} from '@/types/entry-management-types';
import { getEligibleForBulkStatusChange } from './bulkActionEligibility';

type SingleStatusChange = (
  entryId: string,
  status: EntryStatus,
  withdrawalReason?: string,
  options?: StatusChangeOptions
) => boolean | void | Promise<boolean | void>;

type BulkStatusChange = (
  entryIds: string[],
  status: EntryStatus,
  onFullSuccess?: () => void,
  options?: BulkStatusChangeOptions
) => BulkActionResult | Promise<BulkActionResult>;

type LifecycleEmails = Pick<
  ReturnType<typeof useEntryDecisionLifecycleEmails>,
  'decisionEmailPlan' | 'openDecisionPrompt' | 'sendDecisionEmail'
>;

interface Args {
  entries: EntryManagementEntry[];
  showName: string | undefined;
  lifecycleEmails: LifecycleEmails;
  onStatusChange: SingleStatusChange;
  onBulkStatusChange: BulkStatusChange;
}

const EMAIL_NAME: Record<DecisionStepType, string> = {
  accepted: 'acceptance',
  waitlisted: 'waitlist',
};

function decisionStepType(status: EntryStatus): DecisionStepType | null {
  if (status === EntryStatus.ACCEPTED) return 'accepted';
  if (status === EntryStatus.WAITLIST) return 'waitlisted';
  return null;
}

/** One group per entry form (registration); an entry with no registration has no email. */
function groupByRegistration(entries: EntryManagementEntry[]): EntryManagementEntry[][] {
  const groups = new Map<string, EntryManagementEntry[]>();
  for (const entry of entries) {
    if (!entry.registrationId) continue;
    groups.set(entry.registrationId, [...(groups.get(entry.registrationId) ?? []), entry]);
  }
  return [...groups.values()];
}

/**
 * The one decision-email step for every way an entry can be Accepted or Waitlisted: the
 * per-entry status control, an entry form's Accept, and the bulk bar (MYK9-1800). Each
 * decision sends ONE email per entry form (registration), listing every class decided in
 * that action. What happens is the show's plan, read when she presses the button:
 *  - send: the email goes once the Undo toast closes without Undo (written from the entries
 *    as they stand then, and from the snapshot if she has left the show);
 *  - preview: one entry form opens its preview; several get one plain notice, never a stack
 *    of dialogs or a silent skip;
 *  - none: the step is off.
 * Reject and every other status change pass straight through.
 */
export function useDecisionEmailedStatusChange({
  entries,
  showName,
  lifecycleEmails,
  onStatusChange,
  onBulkStatusChange,
}: Args): { onStatusChange: SingleStatusChange; onBulkStatusChange: BulkStatusChange } {
  const { sendDecisionEmail, openDecisionPrompt, decisionEmailPlan } = lifecycleEmails;

  const planFor = (stepType: DecisionStepType | null, decided: EntryManagementEntry[]) =>
    stepType && decided.some(entry => entry.registrationId) ? decisionEmailPlan(stepType) : 'none';

  // Captured when she presses the button: the show she decided on, not the one on screen later.
  const sendOnStood = (stepType: DecisionStepType) => {
    const decidedOnShowName = showName ?? 'this show';
    return (stood: EntryManagementEntry[]) => {
      for (const group of groupByRegistration(stood)) {
        sendDecisionEmail(group, stepType, decidedOnShowName);
      }
    };
  };

  const previewDecided = (decided: EntryManagementEntry[], stepType: DecisionStepType) => {
    const groups = groupByRegistration(decided);
    if (groups.length === 1 && groups[0]) {
      openDecisionPrompt(groups[0], stepType);
    } else if (groups.length > 1) {
      toast.info(
        `${groups.length} ${EMAIL_NAME[stepType]} emails were not sent automatically. Use "Email Exhibitor" on each entry form.`
      );
    }
  };

  const handleStatusChange: SingleStatusChange = async (
    entryId,
    status,
    withdrawalReason,
    options
  ) => {
    const entry = entries.find(candidate => candidate.id === entryId);
    const stepType = decisionStepType(status);
    const plan = planFor(stepType, entry ? [entry] : []);
    const statusSaved = await onStatusChange(
      entryId,
      status,
      withdrawalReason,
      // The email waits for the decision to stand, on the Undo toast's own clock, and is
      // written from the entry as it is then (the Accept may have just given it an armband).
      plan === 'send' && stepType
        ? { ...options, onStood: stoodEntry => sendOnStood(stepType)([stoodEntry]) }
        : options
    );
    if (entry && stepType && plan === 'preview' && statusSaved !== false) {
      previewDecided([{ ...entry, entryStatus: status }], stepType);
    }
    return statusSaved;
  };

  const handleBulkStatusChange: BulkStatusChange = async (
    entryIds,
    status,
    onFullSuccess,
    options
  ) => {
    const stepType = decisionStepType(status);
    // The entries this change may touch, as the bulk handler will narrow them.
    const targets = stepType
      ? getEligibleForBulkStatusChange(
          entries.filter(entry => entryIds.includes(entry.id)),
          status
        )
      : [];
    const plan = planFor(stepType, targets);
    const saved = await onBulkStatusChange(
      entryIds,
      status,
      onFullSuccess,
      plan === 'send' && stepType ? { ...options, onStood: sendOnStood(stepType) } : options
    );
    if (stepType && plan === 'preview' && saved !== false) {
      previewDecided(
        targets.map(entry => ({ ...entry, entryStatus: status })),
        stepType
      );
    }
    return saved;
  };

  return { onStatusChange: handleStatusChange, onBulkStatusChange: handleBulkStatusChange };
}
