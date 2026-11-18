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
 * wizard already held (going back and returning shows what submit will send).
 */
export function useStaffChoiceDrafts(
  initialChoice: string | null,
  fields: PaymentDetailsFields,
  update: (patch: Partial<PaymentDetailsFields>) => void
) {
  const [drafts, setDrafts] = useState<Record<DetailChoice, ChoiceDraft>>(() => {
    const seeded = {
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
    setDrafts(previous => ({ ...previous, [choice]: { ...previous[choice], [key]: value } }));
    update({ [key]: value });
  };

  return { drafts, patchFor, edit };
}
