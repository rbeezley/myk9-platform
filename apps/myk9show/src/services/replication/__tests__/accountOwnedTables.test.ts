import { describe, expect, it } from 'vitest';
import { replicatedEntriesTable } from '../ReplicatedEntriesTable';
import { replicatedWaitlistEntriesTable } from '../ReplicatedWaitlistEntriesTable';
import { replicatedArmbandsTable } from '../ReplicatedArmbandsTable';
import { replicatedPaperworkPrintsTable } from '../ReplicatedPaperworkPrintsTable';
import { replicatedDogsTable } from '../ReplicatedDogsTable';
import { replicatedClassesTable } from '../ReplicatedClassesTable';
import { replicatedTrialsTable } from '../ReplicatedTrialsTable';

/**
 * MYK9-1133: which replicated tables keep their rows per account. A table is
 * added here on purpose: its readers then show only the signed-in account's
 * rows and its sync stamps and owns rows (the other tables are untouched).
 */
describe('account-owned replicated tables', () => {
  it.each([
    ['entries', replicatedEntriesTable],
    ['waitlist_entries', replicatedWaitlistEntriesTable],
    ['armbands', replicatedArmbandsTable],
    ['paperwork_prints', replicatedPaperworkPrintsTable],
  ])('%s keeps rows per account', (_name, table) => {
    expect(table.usesAccountOwnedRows()).toBe(true);
  });

  it.each([
    ['dogs', replicatedDogsTable],
    ['classes', replicatedClassesTable],
    ['trials', replicatedTrialsTable],
  ])('%s is unchanged', (_name, table) => {
    expect(table.usesAccountOwnedRows()).toBe(false);
  });
});
