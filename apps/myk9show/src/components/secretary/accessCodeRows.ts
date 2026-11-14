import type { ShowPasscodes } from '@myk9/core';

export type AccessCodeRole = 'admin' | 'judge' | 'steward' | 'exhibitor';

/** One row of get_show_access_codes. A judge row carries the judge's person id and name (MYK9-1950). */
export type AccessCodeRpcRow = {
  role: AccessCodeRole;
  passcode: string | null;
  recoverable: boolean;
  person_id?: string | null;
  judge_display_name?: string | null;
};

export type DisplayRole = 'Admin' | 'Judge' | 'Steward' | 'Exhibitor';

export type DisplayCodeRow = {
  /** Stable React key: the judge's person id for a judge row, else the role. */
  key: string;
  role: DisplayRole;
  /** What the row is called on screen: the judge's name for a judge row, else the role. */
  label: string;
  code: string;
};

/** The set the wizard or a regeneration returned. Its judge is always null: judge codes are per judge. */
export function rowsFromProvidedPasscodes(passcodes: ShowPasscodes): DisplayCodeRow[] {
  const rows: DisplayCodeRow[] = [
    { key: 'admin', role: 'Admin', label: 'Admin', code: passcodes.admin },
  ];
  if (passcodes.judge) {
    rows.push({ key: 'judge', role: 'Judge', label: 'Judge', code: passcodes.judge });
  }
  rows.push(
    { key: 'steward', role: 'Steward', label: 'Steward', code: passcodes.steward },
    { key: 'exhibitor', role: 'Exhibitor', label: 'Exhibitor', code: passcodes.exhibitor }
  );
  return rows;
}

/** One row per code the server returned, a named row per judge. Codes the server cannot show are left out. */
export function rowsFromRetrievedCodes(codes: AccessCodeRpcRow[]): DisplayCodeRow[] {
  return codes.flatMap((row): DisplayCodeRow[] => {
    if (!row.passcode) return [];
    const role = `${row.role.charAt(0).toUpperCase()}${row.role.slice(1)}` as DisplayRole;
    if (row.role === 'judge') {
      return [
        {
          key: `judge:${row.person_id ?? row.passcode}`,
          role,
          label: row.judge_display_name?.trim() || 'Judge',
          code: row.passcode,
        },
      ];
    }
    return [{ key: row.role, role, label: role, code: row.passcode }];
  });
}
