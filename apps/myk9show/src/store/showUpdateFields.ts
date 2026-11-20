import type { StoreShow as Show } from '@/types/show-types';
import type { ReplicatedShow } from '@/services/replication';
import type { ShowInput } from './showStore';

/**
 * MYK9-2222: the ONE list of what `showStore.updateShow` does with each key an edit can carry.
 * Both the replicated row (the `shows` write) and the optimistic local copy are built from it, so
 * a field cannot reach one and miss the other. Three fixes in a week (MYK9-2220, 2221, 2222) each
 * added a missing key to a hand-kept list; now a key with no entry here fails to compile, and the
 * form-key test fails when an Edit show key is neither mapped nor excluded.
 *
 * Every key shares one name across ShowInput, Show and ReplicatedShow, so an entry only says HOW
 * the value travels.
 */

/** Keys the Edit show save carries beyond ShowInput (the store reads them by presence). */
type ExtraUpdateKey = 'logoUrl' | 'coverImageUrl' | 'accentColor';
export type ShowUpdateKey = keyof ShowInput | ExtraUpdateKey;
export type ShowUpdates = Partial<ShowInput> & Partial<Record<ExtraUpdateKey, string | undefined>>;

interface MappedField {
  /** 'defined': undefined means "leave it". 'present': a key sent as undefined CLEARS the column. */
  when: 'defined' | 'present';
  /** Shape of the value on the replicated row; default is the value as sent. */
  toReplicated?: (value: never) => unknown;
  /** Shape of the value on the optimistic local show; default is the value as sent. */
  toLocal?: (value: never) => unknown;
  /** Skip the replicated write (a field only the local copy holds). */
  localOnly?: true;
  /** Throws for a value that must never be written. */
  validate?: (value: never) => void;
}

interface ExcludedField {
  excluded: string;
}

export type ShowUpdateField = MappedField | ExcludedField;

const copy: MappedField = { when: 'defined' };
const clearable: MappedField = { when: 'present' };
const localOnly: MappedField = { when: 'defined', localOnly: true };

/** shows.starting_armband_number is the first armband the server hands out: 1, 2, 3, ... */
export function assertStartingArmband(value: number): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error('Starting armband number must be a positive whole number');
  }
}

const feeToNumber = (value: string): number => parseFloat(value);

export const SHOW_UPDATE_FIELDS: Record<ShowUpdateKey, ShowUpdateField> = {
  name: copy,
  organization: copy,
  startDate: copy,
  endDate: copy,
  location: copy,
  latitude: copy,
  longitude: copy,
  status: copy,
  entryOpenDate: copy,
  entryCloseDate: copy,
  preEntryFee: { when: 'defined', toReplicated: feeToNumber },
  dayOfShowFee: { when: 'defined', toReplicated: feeToNumber },
  // MYK9-2220/2221: present means the form decides; a cleared box clears the cap.
  maxEntriesPerDog: clearable,
  maxTotalEntries: clearable,
  juniorHandlerFee: {
    when: 'defined',
    toReplicated: (value: string) => (value.trim() === '' ? null : Number(value)),
  },
  clubId: copy,
  // The club's name, address and email live on the club, not the show row.
  clubName: localOnly,
  clubAddress: localOnly,
  clubEmail: localOnly,
  // MYK9-2222: server armband assignment reads shows.starting_armband_number.
  startingArmbandNumber: { when: 'defined', validate: assertStartingArmband },
  confirmationMessage: {
    when: 'defined',
    toReplicated: (value: string) => value.trim() || null,
    toLocal: (value: string) => value.trim(),
  },
  acceptCheckPayments: copy,
  acceptCashPayments: copy,
  isNationals: copy,
  // MYK9-1685 "This show uses..." switches.
  usesDeviceScoring: copy,
  usesPaperPacket: copy,
  usesVolunteers: copy,
  publishesOwnPremium: copy,
  // MYK9-2290: null clears an ASCA premium fact; undefined leaves it.
  ascaSanctionStatus: copy,
  scentsByLevel: copy,
  spectatorsPolicy: copy,
  photographerContact: copy,
  logoUrl: clearable,
  coverImageUrl: clearable,
  accentColor: clearable,
  // The judge list and the show's own trials are written by their own tables.
  assignedJudges: localOnly,
  events: localOnly,
  source: localOnly,
  onlineEntriesEnabled: {
    excluded: 'RPC-owned (MYK9-979): changes only through set_show_online_entries',
  },
  style: {
    excluded: 'RPC-owned: changes only through Preview update_show_style, never a generic edit',
  },
  trials: {
    excluded: 'read only by the junior fee limit; trials are written through their own table',
  },
};

export function isMappedField(field: ShowUpdateField): field is MappedField {
  return !('excluded' in field);
}

function carries(field: MappedField, updates: object, key: string): boolean {
  if (field.when === 'present') return key in updates;
  return (updates as Record<string, unknown>)[key] !== undefined;
}

type Apply<V> = ((value: never) => V) | undefined;

function convert<V>(fn: Apply<V>, value: unknown): unknown {
  return fn ? (fn as (value: unknown) => V)(value) : value;
}

/** Runs every validator first so a bad value writes nothing, to the replica or the screen. */
export function assertShowUpdatesValid(updates: ShowUpdates): void {
  for (const [key, field] of Object.entries(SHOW_UPDATE_FIELDS)) {
    if (!isMappedField(field) || !field.validate || !carries(field, updates, key)) continue;
    (field.validate as (value: unknown) => void)((updates as Record<string, unknown>)[key]);
  }
}

/** The columns an update writes, as the replicated show row names them. */
export function toReplicatedUpdates(updates: ShowUpdates): Partial<ReplicatedShow> {
  const out: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(SHOW_UPDATE_FIELDS)) {
    if (!isMappedField(field) || field.localOnly || !carries(field, updates, key)) continue;
    out[key] = convert(field.toReplicated, (updates as Record<string, unknown>)[key]);
  }
  return out as Partial<ReplicatedShow>;
}

/** What the optimistic local show takes from an update. */
export function toLocalUpdates(updates: ShowUpdates): Partial<Show> {
  const out: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(SHOW_UPDATE_FIELDS)) {
    if (!isMappedField(field) || !carries(field, updates, key)) continue;
    out[key] = convert(field.toLocal, (updates as Record<string, unknown>)[key]);
  }
  return out as Partial<Show>;
}
