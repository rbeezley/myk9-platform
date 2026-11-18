import type { SecretaryEntry } from '@/services/database/entries';
import type { RefundEntryFormRow } from '@/services/database/entries/refundEntryForms';
import { mapSecretaryEntryToEntryManagementEntry } from '@/hooks/useEntryManagementData';
import { personName } from '@/hooks/entryDisplayNames';
import { formKeyOf } from '@/components/entries/management/checkInDesk/deskAmountOwed';

export const NAMES_LOADING = 'Looking up…';
export const NAMES_OFFLINE = 'Names need a connection.';
export const NAMES_LOOKUP_FAILED = 'Could not look up names.';

/** The entry form one result entry belongs to (MYK9-1862). */
export interface RefundEntryForm {
  /** Entry Management's form key (`registrationId | pi:<intent> | entry:<id>`). */
  formKey: string;
  /** "Form MK9-000123 · Pat Lee": the confirmation number, and the form's own payer when read. */
  label: string;
  /** The dog's call name, only when the entry was already loaded on this device. */
  dogName: string | null;
}

/** One line of a skipped group or failed payment: a form, once, with the dogs loaded for it. */
export interface RefundFormLine {
  key: string;
  label: string;
  dogs: string | null;
}

/**
 * "Form <confirmation> · <payer>". A person is named only from the form record's own payer
 * (`enrollments.handler_id`), never inferred from the dogs' owners or handlers; an online order
 * has no form record, so it reads "Entry form".
 */
export function refundFormLabel(confirmationNumber: string | null, payer: string | null): string {
  const form = confirmationNumber ? `Form ${confirmationNumber}` : 'Entry form';
  return payer ? `${form} · ${payer}` : form;
}

const trimmed = (value: string | null | undefined) => value?.trim() || null;

/** What a source says about one entry's form; the label is resolved per form in `mergeRefundForms`. */
export interface RefundFormFact {
  formKey: string;
  confirmation: string | null;
  payer: string | null;
  dogName: string | null;
}

/** The roster's entries: their form key and confirmation at once, by Entry Management's mapping. */
export function formsFromRoster(
  roster: readonly SecretaryEntry[] | undefined
): Map<string, RefundFormFact> {
  const facts = new Map<string, RefundFormFact>();
  for (const row of roster ?? []) {
    const entry = mapSecretaryEntryToEntryManagementEntry(row);
    facts.set(entry.id, {
      formKey: formKeyOf(entry),
      confirmation: trimmed(entry.confirmationNumber),
      payer: null,
      dogName: trimmed(entry.dogName),
    });
  }
  return facts;
}

/** The form read: every result entry's form, confirmation and the form's own payer. */
export function formsFromRead(
  rows: readonly RefundEntryFormRow[] | undefined
): Map<string, RefundFormFact> {
  const facts = new Map<string, RefundFormFact>();
  for (const row of rows ?? []) {
    facts.set(row.id, {
      formKey: formKeyOf({
        id: row.id,
        registrationId: row.registration_id ?? '',
        stripePaymentIntentId: row.stripe_payment_intent_id,
      }),
      confirmation: trimmed(row.registration?.confirmation_number),
      payer: personName(row.registration?.payer),
      dogName: null,
    });
  }
  return facts;
}

/**
 * Both sources together. The form read places an entry when it has it (the form record wins
 * over a roster row with incomplete enrollment data); the roster places the rest at once and
 * gives the dog names. Confirmation and payer resolve per form, so one form never reads two ways.
 */
export function mergeRefundForms(
  rosterFacts: ReadonlyMap<string, RefundFormFact>,
  readFacts: ReadonlyMap<string, RefundFormFact>
): Map<string, RefundEntryForm> {
  const placed = new Map<string, RefundFormFact>(rosterFacts);
  for (const [entryId, fact] of readFacts) placed.set(entryId, fact);

  const byForm = new Map<string, { confirmation: string | null; payer: string | null }>();
  for (const fact of [...readFacts.values(), ...rosterFacts.values()]) {
    const known = byForm.get(fact.formKey) ?? { confirmation: null, payer: null };
    byForm.set(fact.formKey, {
      confirmation: known.confirmation ?? fact.confirmation,
      payer: known.payer ?? fact.payer,
    });
  }

  const forms = new Map<string, RefundEntryForm>();
  for (const [entryId, fact] of placed) {
    const form = byForm.get(fact.formKey);
    forms.set(entryId, {
      formKey: fact.formKey,
      label: refundFormLabel(form?.confirmation ?? null, form?.payer ?? null),
      dogName: rosterFacts.get(entryId)?.dogName ?? null,
    });
  }
  return forms;
}

/** The lines for one group's entry ids: each form once, then how many entries are not placed. */
export function refundFormLines(
  entryIds: readonly string[],
  forms: ReadonlyMap<string, RefundEntryForm>
): { lines: RefundFormLine[]; unresolved: number } {
  const byForm = new Map<string, { label: string; dogs: string[] }>();
  let unresolved = 0;
  for (const entryId of new Set(entryIds)) {
    const form = forms.get(entryId);
    if (!form) {
      unresolved += 1;
      continue;
    }
    const line = byForm.get(form.formKey) ?? { label: form.label, dogs: [] };
    if (form.dogName && !line.dogs.includes(form.dogName)) line.dogs.push(form.dogName);
    byForm.set(form.formKey, line);
  }
  const lines = [...byForm].map(([key, { label, dogs }]) => ({
    key,
    label,
    dogs: dogs.length > 0 ? dogs.join(', ') : null,
  }));
  return { lines, unresolved };
}

export function unresolvedLabel(count: number): string {
  return count === 1 ? 'An entry not named' : `${count} entries not named`;
}
