import { useState } from 'react';
import type { PaymentDetailsFields } from './usePaymentDetailsFields';

/** The secretary's choices that carry typed details of their own. */
export type DetailChoice = 'check_received' | 'cash_received' | 'waived';

/** What one choice holds. Free entry uses only `paymentNotes`: the reason it is free. */
export type ChoiceDraft = Pick<
  PaymentDetailsFields,
  'paymentReference' | 'paymentDate' | 'paymentNotes'
>;

const DRAFT_KEYS = ['paymentReference', 'paymentDate', 'paymentNotes'] as const;
const EMPTY_DRAFT: ChoiceDraft = { paymentReference: '', paymentDate: '', paymentNotes: '' };

/** Every detail choice's draft. */
export type StaffChoiceDrafts = Record<DetailChoice, ChoiceDraft>;

/**
 * Where the wizard keeps the drafts for the entry being keyed in, so they outlive the
 * Payment step: going Back to Classes unmounts it, and the wizard's payment details
 * hold only the selected choice's values. `reset` runs when the wizard starts over.
 */
export interface StaffChoiceDraftStore {
  get: () => StaffChoiceDrafts | undefined;
  set: (drafts: StaffChoiceDrafts) => void;
  reset: () => void;
}

/** A store for one wizard: create it once (`useState(createStaffChoiceDraftStore)`). */
export function createStaffChoiceDraftStore(): StaffChoiceDraftStore {
  let current: StaffChoiceDrafts | undefined;
  return {
    get: () => current,
    set: drafts => {
      current = drafts;
    },
    reset: () => {
      current = undefined;
    },
  };
}

export function isDetailChoice(choice: string | null): choice is DetailChoice {
  return choice === 'check_received' || choice === 'cash_received' || choice === 'waived';
}

/**
 * MYK9-2162: each of the secretary's payment choices keeps its own details, so a
 * check number typed under "Check received" is never saved as the cash receipt
 * number, and notes about money received never become the reason an entry is free.
 *
 * The wizard still receives one details snapshot (`paymentReference`,
 * `paymentDate`, `paymentNotes`): it always mirrors the SELECTED choice's draft.
 * Switching choices loads that choice's draft (empty for a choice with no typed
 * details), and switching back restores what was typed for it.
 *
 * `initialChoice` is the choice the step opened on; it inherits the details the
 * wizard already held (going back and returning shows what submit will send). The
 * other choices' drafts come back from `store`, the wizard's copy for this entry.
 */
export function useStaffChoiceDrafts(
  initialChoice: string | null,
  fields: PaymentDetailsFields,
  update: (patch: Partial<PaymentDetailsFields>) => void,
  store?: StaffChoiceDraftStore
) {
  const [drafts, setDrafts] = useState<StaffChoiceDrafts>(() => {
    const seeded = store?.get() ?? {
      check_received: EMPTY_DRAFT,
      cash_received: EMPTY_DRAFT,
      waived: EMPTY_DRAFT,
    };
    if (!isDetailChoice(initialChoice)) return seeded;
    const own: ChoiceDraft =
      initialChoice === 'waived'
        ? { ...EMPTY_DRAFT, paymentNotes: fields.paymentNotes }
        : {
            paymentReference: fields.paymentReference,
            paymentDate: fields.paymentDate,
            paymentNotes: fields.paymentNotes,
          };
    return { ...seeded, [initialChoice]: own };
  });

  /** The fields to send so the snapshot holds `choice`'s own details, or nothing to send. */
  const patchFor = (choice: string): Partial<PaymentDetailsFields> => {
    const target = isDetailChoice(choice) ? drafts[choice] : EMPTY_DRAFT;
    const patch: Partial<PaymentDetailsFields> = {};
    for (const key of DRAFT_KEYS) {
      if (fields[key] !== target[key]) patch[key] = target[key];
    }
    return patch;
  };

  /** Edit one field of the selected choice's draft and send it on. */
  const edit = (choice: DetailChoice, key: keyof ChoiceDraft, value: string) => {
    const next = { ...drafts, [choice]: { ...drafts[choice], [key]: value } };
    setDrafts(next);
    store?.set(next);
    update({ [key]: value });
  };

  return { drafts, patchFor, edit };
}
