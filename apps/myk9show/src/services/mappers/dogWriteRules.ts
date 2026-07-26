/**
 * The rules that decide what a dog value MEANS on the way to storage.
 *
 * A dog patch is written to two places — Postgres via `mapDogInputToUpdate` and
 * IndexedDB via `mapPartialDogInputToReplicated` — and every divergence this
 * codebase has hit came from those two mappers each deciding a rule for
 * themselves: one trimmed the call name and one did not, one nulled a `0`
 * weight and one stored `"0"`, one wrote `sex: ''` through and one cleared it.
 * Each time, the local row and the server row disagreed until an unrelated
 * refetch happened to overwrite one of them.
 *
 * So the rules live here, above every mapper, and the mappers only translate
 * vocabulary (`null` is "cleared" in a DB patch, `undefined` is "cleared" in a
 * local merge). A rule stated once cannot be stated inconsistently.
 */
import type { DogStatus } from '@/types/dog-types';
import type { DogInput } from '@/store/dogStore';

/**
 * The single place the call-name normalisation rule lives. Trimming is part of
 * the rule, not a step some callers apply and others skip — `"   "` is not a
 * name, and `"  Tera  "` and `"Tera"` are the same name.
 */
const normalizeCallName = (value: string | null | undefined): string => (value ?? '').trim();

/**
 * Resolve the call name for a dog about to be created.
 *
 * MYK9-90 §5.1 — `dogs.call_name` is NOT NULL after 20260727110000, so this is
 * the one rule that decides whether a dog may be created at all. It lives in a
 * single function on purpose: earlier rounds of this change scattered the check
 * across two mappers, a replication payload builder and two Postgres functions,
 * each seeing the value at a different point in the write lifecycle, and a
 * whitespace-only name slipped through the gaps between them.
 *
 * A caller that supplied only one name supplied the call name (safe direction:
 * name -> call_name; the reverse copy is what §5.3 removes).
 *
 * Throws rather than returning empty so callers cannot accidentally persist or
 * queue a row first and discover the problem afterwards.
 */
export const resolveRequiredCallName = (input: Pick<DogInput, 'callName' | 'name'>): string => {
  const callName = normalizeCallName(input.callName) || normalizeCallName(input.name);
  if (!callName) {
    throw new Error('A dog needs a call name.');
  }
  return callName;
};

/**
 * Normalise a dog patch ONCE, before it is written anywhere.
 *
 * MYK9-90 §5.1 — the update-path analogue of `resolveRequiredCallName`. The
 * IndexedDB write (`mapPartialDogInputToReplicated`) and the Supabase write
 * (`mapDogInputToUpdate`) are two mappers fed from the same patch, and when
 * each decided independently how to normalise, they drifted: a padded
 * `"  Tera  "` was stored trimmed locally and sent padded to the server, so a
 * later sync reverted the local value. Normalising here, above both, is what
 * makes that class of divergence impossible rather than merely fixed.
 *
 * Neither mapper trims any more — deliberately. If this function is somehow
 * bypassed the two still agree (both untrimmed); they can no longer disagree.
 */
export const normalizeDogInputForWrite = <T extends Partial<DogInput>>(updates: T): T => {
  if (updates.callName === undefined) return updates;
  return { ...updates, callName: normalizeCallName(updates.callName) };
};

/**
 * The one rule for the optional measurements, shared by every dog write.
 *
 * `0` is not a weight or a height — it is an empty field that happened to parse
 * as a number — so it clears the value instead of being stored as `"0"`. The
 * rule lives here because the two update mappers used to each decide for
 * themselves: the Supabase mapper nulled a `0` while the IndexedDB mapper wrote
 * `"0"`, so the local row and the server row disagreed until the next refetch.
 */
export const measurementForWrite = (value: number | null | undefined): string | null =>
  value ? String(value) : null;

/**
 * An empty string is an absent value, not a value. Same reasoning as
 * `measurementForWrite` — `sex: ''` used to be written through to Postgres while
 * the IndexedDB mapper turned it into `undefined`.
 *
 * Named `emptyToNull`, not `blankToNull`, to stay distinguishable from
 * `resolveDogIdentity`'s `blankToNull`, which also trims. This one does not:
 * trimming here would be a behaviour change the two mappers do not need (they
 * already agree on whitespace), and a same-named helper with different rules is
 * how these divergences started.
 */
export const emptyToNull = <T extends string>(value: T | null | undefined): T | null =>
  value || null;

/** The status a dog is created with when the caller does not choose one. */
export const DEFAULT_DOG_STATUS: DogStatus = 'active';

/**
 * `dogs.deceased` and `dogs.deceased_date` are written with `status`, never on
 * their own — `deceased` is `status === 'deceased'` restated, and a date without
 * a matching status is a row that contradicts itself.
 *
 * Shared because the direct Supabase update (`mapDogInputToUpdate`) and the
 * replicated write (`ReplicatedDogsTable.toSupabaseRow`) both derive these, and
 * a status change reaches the server through whichever one wins. Keeping the
 * rule in one function is what stops those two paths from writing different
 * things; the pair of "must stay in lockstep" comments this replaced could only
 * ask.
 */
export const deriveDeceasedColumns = (
  status: string,
  deceasedDate: string | null | undefined
): { deceased: boolean; deceased_date: string | null } => ({
  deceased: status === 'deceased',
  deceased_date: deceasedDate || null,
});
