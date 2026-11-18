import type { SecretaryEntry } from '@/services/database/entries';
import type { RefundEntryFormRow } from '@/services/database/entries/refundEntryForms';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import { mapSecretaryEntryToEntryManagementEntry } from '@/hooks/useEntryManagementData';
import { personName } from '@/hooks/entryDisplayNames';
import {
  formKeyOf,
  formPayerName,
} from '@/components/entries/management/checkInDesk/deskAmountOwed';

export const NAMES_LOADING = 'Looking up…';
export const NAMES_OFFLINE = 'Names need a connection.';
export const NAMES_LOOKUP_FAILED = 'Could not look up names.';

/** The entry form one result entry belongs to (MYK9-1862). */
export interface RefundEntryForm {
  /** Entry Management's form key (`registrationId | pi:<intent> | entry:<id>`). */
  formKey: string;
  /** "Form MK9-000123 · Pat Lee": the confirmation number and whose form it is. */
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

/** "Form <confirmation> · <name>", as Entry Management's form card names the same form. */
export function refundFormLabel(confirmationNumber: string | null, name: string | null): string {
  const form = confirmationNumber ? `Form ${confirmationNumber}` : 'Entry form';
  return name ? `${form} · ${name}` : form;
}

const trimmed = (value: string | null | undefined) => value?.trim() || null;

/**
 * Forms for the roster's entries, by Entry Management's own rules: the form key, the
 * confirmation number, and the payer's name (the Check-in desk's rule), else the form holder's.
 */
export function formsFromRoster(
  roster: readonly SecretaryEntry[] | undefined
): Map<string, RefundEntryForm> {
  const entries = (roster ?? []).map(entry => mapSecretaryEntryToEntryManagementEntry(entry));
  const byForm = new Map<string, EntryManagementEntry[]>();
  for (const entry of entries) {
    const key = formKeyOf(entry);
    byForm.set(key, [...(byForm.get(key) ?? []), entry]);
  }
  const forms = new Map<string, RefundEntryForm>();
  for (const [formKey, formEntries] of byForm) {
    const confirmation =
      formEntries.find(entry => entry.confirmationNumber)?.confirmationNumber ?? null;
    const holder = formEntries.map(entry => trimmed(entry.ownerName)).find(Boolean) ?? null;
    const label = refundFormLabel(confirmation, formPayerName(formEntries, entries) ?? holder);
    for (const entry of formEntries) {
      forms.set(entry.id, { formKey, label, dogName: trimmed(entry.dogName) });
    }
  }
  return forms;
}

/** Forms for the entries read online by id (soft-deleted, or missing from the replica). */
export function formsFromRead(rows: readonly RefundEntryFormRow[] | undefined) {
  const forms = new Map<string, RefundEntryForm>();
  for (const row of rows ?? []) {
    const formKey = formKeyOf({
      id: row.id,
      registrationId: row.registration_id ?? '',
      stripePaymentIntentId: row.stripe_payment_intent_id,
    });
    // The payer is the enrollment's; an online order (no enrollment) is the dog owner's.
    const name =
      personName(row.registration?.payer) ??
      personName(row.dog?.owner) ??
      trimmed(row.handler) ??
      null;
    const label = refundFormLabel(trimmed(row.registration?.confirmation_number), name);
    forms.set(row.id, { formKey, label, dogName: null });
  }
  return forms;
}

/**
 * The roster's forms and the read's together. An entry read online whose form the roster
 * already names takes the roster's label, so one form never reads two ways.
 */
export function mergeRefundForms(
  rosterForms: ReadonlyMap<string, RefundEntryForm>,
  readForms: ReadonlyMap<string, RefundEntryForm>
): Map<string, RefundEntryForm> {
  const labels = new Map([...rosterForms.values()].map(form => [form.formKey, form.label]));
  const forms = new Map(rosterForms);
  for (const [entryId, form] of readForms) {
    if (forms.has(entryId)) continue;
    forms.set(entryId, { ...form, label: labels.get(form.formKey) ?? form.label });
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
