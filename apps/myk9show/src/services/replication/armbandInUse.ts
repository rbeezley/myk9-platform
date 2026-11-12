/**
 * MYK9-1844: the replicated armband write checks on the device that no other dog in
 * the show already wears the number, before anything is queued. Its refusal is an
 * `ArmbandInUseError` carrying an application code, not a Postgres one: the mutation
 * manager reads a 23505 as "a prior attempt committed", and `getUserFriendlyError`
 * maps 23505 to a generic sentence, so a client refusal must never borrow that code.
 * The code survives `createDatabaseError`, which keeps `code` but not the class.
 */
export const ARMBAND_IN_USE_CODE = 'MYK9_ARMBAND_IN_USE';

/**
 * The database's own refusal of a taken number: UNIQUE(show_id, armband_number) in
 * 005_myk9show_specific.sql, under Postgres's default constraint name. The table has
 * other unique constraints (one armband per dog per show, migration 166; the primary
 * key) whose 23505 must not be read as "number in use".
 */
export const ARMBAND_NUMBER_CONSTRAINT = 'armbands_show_id_armband_number_key';

export class ArmbandInUseError extends Error {
  readonly code = ARMBAND_IN_USE_CODE;

  constructor(armband: string) {
    super(`Armband ${armband} is already assigned to another dog in this show.`);
    this.name = 'ArmbandInUseError';
  }
}

/** True for the device refusal, or a server 23505 that names the armband-number constraint. */
export function isArmbandNumberTaken(error: unknown): boolean {
  if (error instanceof ArmbandInUseError) return true;
  if (!error || typeof error !== 'object') return false;
  const { code, message, details } = error as {
    code?: unknown;
    message?: unknown;
    details?: unknown;
  };
  if (code === ARMBAND_IN_USE_CODE) return true;
  if (code !== '23505') return false;
  return [message, details].some(
    text => typeof text === 'string' && text.includes(ARMBAND_NUMBER_CONSTRAINT)
  );
}
