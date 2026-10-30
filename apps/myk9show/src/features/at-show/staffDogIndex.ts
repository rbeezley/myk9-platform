/**
 * Pure derivation for the ringside staff dog finder (MYK9-1509): one row per
 * dog across the show's classes, built from already-replicated entry rows so it
 * works offline. Staff only; the exhibitor's own-dogs view is a separate surface.
 *
 * @module at-show/staffDogIndex
 */
import type { ReplicatedEntry } from '@/services/replication';
import { isExpectedEntry, isPulledEntry } from '@/features/_shared/entryAccounting';
import { resolveEntryArmband, type ShowArmbandMaps } from '@/features/_shared/entryArmband';
import { isUncheckedCheckInStatus } from '@/components/checkin/uncheckedEntries';
import { transformEntry } from './atShowDataAdapter';

/** What the page needs to know about a class an entry sits in. */
export interface StaffDogClassInfo {
  className: string;
  /** Route target the class picker uses: this class's id, or the A/B pair's ids when run together. */
  classIds: readonly string[];
  resultsReleasedAt: string | null;
  trialLabel: string | null;
}

/** One dog-in-one-class row. */
export interface StaffDogClassEntry {
  entryId: string;
  classId: string | null;
  /** Class ids for the entry-list link: the pair when the class runs combined. */
  routeClassIds: readonly string[];
  className: string;
  trialLabel: string | null;
  checkInStatus: string;
  isPulled: boolean;
  isScored: boolean;
  resultText: string | null;
  searchTime: string | null;
  faultCount: number | null;
  placement: number | null;
  resultsReleased: boolean;
}

export interface StaffDog {
  /** Dog id, else `armband:<n>`, else `entry:<id>`; the dog page's route key. */
  key: string;
  dogName: string;
  breed: string;
  handler: string;
  armband: number | null;
  entries: StaffDogClassEntry[];
  /** Entries a check-in-all would write: not yet checked in and not pulled. */
  uncheckedEntryIds: string[];
}

export type StaffDogSort = 'armband' | 'dog' | 'handler';
export type StaffDogTab = 'all' | 'favorites';

function dogKeyOf(entry: ReplicatedEntry): string {
  if (entry.dogId) return entry.dogId;
  if (entry.armband) return `armband:${entry.armband}`;
  return `entry:${entry.id}`;
}

/**
 * A move-up leaves the SOURCE row live as `moved`, and `not_accepted` rows stay live too.
 * Neither is a class the dog is entered in, so the dog page leaves them out rather than
 * show them with a stale check-in state (withdrawn/scratched stay, read as Pulled).
 */
const SETTLED_ELSEWHERE = new Set(['moved', 'not_accepted']);

function liveEntry(entry: ReplicatedEntry): boolean {
  if ((entry.deletedAt ?? (entry as { deleted_at?: string | null }).deleted_at) != null) {
    return false;
  }
  const lifecycle = (entry.entryStatus ?? entry.status ?? '').trim().toLowerCase();
  return !SETTLED_ELSEWHERE.has(lifecycle);
}

/** Group the show's live entries by dog. Class info comes from the class list. */
export function buildStaffDogs(
  entries: readonly ReplicatedEntry[],
  classesById: ReadonlyMap<string, StaffDogClassInfo>,
  armbandMaps: ShowArmbandMaps
): StaffDog[] {
  const byDog = new Map<string, StaffDog>();
  for (const stored of entries) {
    if (!liveEntry(stored)) continue;
    // The entry column can be empty while the show's armbands table still holds
    // the number (MYK9-976); resolve it the way the class entry list does.
    const armband = resolveEntryArmband(stored, armbandMaps);
    const re = armband ? { ...stored, armband } : stored;
    const classInfo = re.classId ? (classesById.get(re.classId) ?? null) : null;
    const view = transformEntry(re, null);
    const key = dogKeyOf(re);
    let dog = byDog.get(key);
    if (!dog) {
      dog = {
        key,
        dogName: view.callName,
        breed: view.breed,
        handler: view.handler,
        armband: view.armband,
        entries: [],
        uncheckedEntryIds: [],
      };
      byDog.set(key, dog);
    } else if (dog.armband == null && view.armband != null) {
      // The first row may have no number while a later entry of the same dog has one.
      dog.armband = view.armband;
    }
    const pulled = isPulledEntry(re);
    // Derived display status: a withdrawn dog reads Pulled even if it was checked in earlier.
    const checkInStatus = view.status;
    dog.entries.push({
      entryId: re.id,
      classId: re.classId ?? null,
      routeClassIds: classInfo?.classIds ?? (re.classId ? [re.classId] : []),
      className: classInfo?.className ?? 'Class not on this device yet',
      trialLabel: classInfo?.trialLabel ?? null,
      checkInStatus,
      isPulled: pulled,
      isScored: view.isScored,
      resultText: view.resultText ?? null,
      searchTime: view.searchTime ?? null,
      faultCount: view.faultCount ?? null,
      placement: view.placement ?? null,
      resultsReleased: Boolean(classInfo?.resultsReleasedAt),
    });
    if (isExpectedEntry(re) && isUncheckedCheckInStatus(checkInStatus))
      dog.uncheckedEntryIds.push(re.id);
  }
  return [...byDog.values()];
}

function matches(dog: StaffDog, needle: string): boolean {
  if (!needle) return true;
  return [dog.dogName, dog.breed, dog.handler, dog.armband == null ? '' : String(dog.armband)].some(
    field => field.toLowerCase().includes(needle)
  );
}

/** Tab, then search (dog, breed, handler, armband). */
export function filterStaffDogs(
  dogs: readonly StaffDog[],
  options: { tab: StaffDogTab; query: string; favoriteArmbands: ReadonlySet<number> }
): StaffDog[] {
  const needle = options.query.trim().toLowerCase();
  return dogs.filter(
    dog =>
      (options.tab === 'all' ||
        (dog.armband != null && options.favoriteArmbands.has(dog.armband))) &&
      matches(dog, needle)
  );
}

const byText = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base' });

/** A dog with no armband sorts last by armband; ties fall back to the dog's name. */
export function sortStaffDogs(dogs: readonly StaffDog[], sort: StaffDogSort): StaffDog[] {
  const rank = (dog: StaffDog) => dog.armband ?? Number.POSITIVE_INFINITY;
  return [...dogs].sort((a, b) => {
    const primary =
      sort === 'armband'
        ? rank(a) === rank(b)
          ? 0
          : rank(a) - rank(b)
        : sort === 'dog'
          ? byText(a.dogName, b.dogName)
          : byText(a.handler, b.handler);
    return primary || byText(a.dogName, b.dogName);
  });
}

export function formatDogCount(shown: number, total: number): string {
  return `${shown} of ${total} ${total === 1 ? 'dog' : 'dogs'}`;
}
