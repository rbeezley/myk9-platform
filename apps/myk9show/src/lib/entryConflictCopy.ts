import { formatSecondsAsMSSCC } from '@/lib/format/searchTime';
import { classifyEntryCheckInStatus } from '@/features/show-map/showMapStatus';
import { ENTRY_STATUS_VALUES, getStatusDescriptor } from '@/components/status';
import {
  CONFLICT_KEEP_LOCAL_LABEL,
  CONFLICT_TAKE_REMOTE_LABEL,
  CONFLICT_TOAST_DESCRIPTION,
} from '@/lib/offlineCopy';

/** MYK9-2010: the conflict notice for a dog names the dog and shows both scores. */
type EntryConflictRow = Record<string, unknown>;

export interface EntryConflictCopy {
  title: string;
  description: string;
  takeRemoteLabel: string;
  keepLocalLabel: string;
}

const RESULT_WORDS: Record<string, string> = {
  qualified: 'Qualified',
  nq: 'NQ',
  excused: 'Excused',
  absent: 'Absent',
  withdrawn: 'Withdrawn',
};

const read = (row: EntryConflictRow, ...keys: string[]): unknown =>
  keys.map(key => row[key]).find(value => value !== undefined && value !== null && value !== '');

/** "#12 Rex", or "#12" / "this dog" when the row holds less. */
export function describeConflictDog(row: EntryConflictRow): string {
  const armband = read(row, 'armband_number', 'armbandNumber', 'armband');
  const name = read(row, 'dog_call_name', 'dogCallName');
  const parts = [armband !== undefined ? `#${String(armband)}` : '', name ? String(name) : ''];
  return parts.filter(Boolean).join(' ') || 'this dog';
}

/** The score as the judge saw it: "Qualified, 1:01.23, 2 faults", or "no score yet". */
export function describeConflictScore(row: EntryConflictRow): string {
  if (!read(row, 'is_scored', 'isScored')) return 'no score yet';
  const result = String(read(row, 'result_status', 'resultStatus') ?? '');
  const seconds = read(row, 'search_time_seconds', 'searchTimeSeconds');
  const faults = read(row, 'total_faults', 'totalFaults');
  const points = read(row, 'total_points', 'totalPoints', 'total_score', 'totalScore');
  const parts = [
    RESULT_WORDS[result] ?? result,
    typeof seconds === 'number' ? formatSecondsAsMSSCC(seconds) : '',
    typeof faults === 'number' ? `${faults} ${faults === 1 ? 'fault' : 'faults'}` : '',
    typeof points === 'number' ? `${points} ${points === 1 ? 'point' : 'points'}` : '',
  ];
  return parts.filter(Boolean).join(', ') || 'scored';
}

const UNKNOWN_STATUS_WORDS = 'another status';

/**
 * Status words come from the shared owners only: the check-in classifier for `check_in_status`,
 * the shared entry-status descriptors (what Show Desk already shows) for `entry_status`. A value
 * neither knows stays neutral; it is never reformatted into words of its own.
 */
function statusWords(status: unknown, kind: 'check-in' | 'entry'): string {
  if (typeof status !== 'string' || !status) return 'no status';
  const known =
    kind === 'entry'
      ? (ENTRY_STATUS_VALUES as readonly string[]).includes(status)
        ? getStatusDescriptor('entry', status).label
        : undefined
      : classifyEntryCheckInStatus({ check_in_status: status })?.label;
  return known ?? UNKNOWN_STATUS_WORDS;
}

const STATUS_FIELDS = new Set(['check_in_status', 'checkInStatus', 'entry_status', 'entryStatus']);
const SCORE_FIELD = /result|score|time|fault|point|placement|search|nq|qualif/i;
const SCORE_CONFLICT_IGNORED = new Set(['is_scored', 'isScored']);

const isScoreField = (field: string) => !STATUS_FIELDS.has(field) && SCORE_FIELD.test(field);

/** "dog_call_name" and "dogCallName" both read "dog call name". */
function humanField(field: string): string {
  return field
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .toLowerCase();
}

function shown(value: unknown): string {
  if (value === undefined || value === null || value === '') return 'empty';
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

/** The fields that actually collided, each with both values; the rest are left out. */
function describeFieldConflicts(
  fields: readonly string[],
  local: EntryConflictRow,
  remote: EntryConflictRow
): string {
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const field of fields) {
    const name = humanField(field);
    if (seen.has(name)) continue;
    seen.add(name);
    parts.push(`${name}: this device ${shown(local[field])}, other device ${shown(remote[field])}`);
  }
  const shownParts = parts.slice(0, 4).join('; ');
  return parts.length > 4 ? `${shownParts}; and ${parts.length - 4} more` : shownParts;
}

export function entryConflictCopy(
  local: EntryConflictRow,
  remote: EntryConflictRow,
  fields: readonly string[] = []
): EntryConflictCopy {
  const named = describeConflictDog(remote);
  const dog = named !== 'this dog' ? named : describeConflictDog(local);
  const subject = dog === 'this dog' ? 'A dog' : dog;
  const dropsOthers =
    'Keeping the other one also drops anything else this device changed on this dog and had not sent yet.';
  const collided = fields.filter(field => !SCORE_CONFLICT_IGNORED.has(field));
  // Callers always pass the collided fields; without them, fall back to whether either side is scored.
  const scoreCollision =
    fields.length > 0
      ? collided.some(isScoreField)
      : Boolean(read(local, 'is_scored', 'isScored') || read(remote, 'is_scored', 'isScored'));
  const statusCollision = collided.some(field => STATUS_FIELDS.has(field));

  if (!scoreCollision) {
    // Two changes inside the check-in group: say what each chose, so a pull is never dropped by guesswork.
    const entryStatusConflict = collided.some(field => field.toLowerCase().includes('entry'));
    const statusKeys = entryStatusConflict
      ? (['entry_status', 'entryStatus'] as const)
      : (['check_in_status', 'checkInStatus'] as const);
    const localStatus = read(local, ...statusKeys);
    const remoteStatus = read(remote, ...statusKeys);
    const onlyStatus = collided.length > 0 && collided.every(field => STATUS_FIELDS.has(field));
    if (
      (statusCollision || fields.length === 0) &&
      (onlyStatus || fields.length === 0) &&
      localStatus !== remoteStatus &&
      (localStatus || remoteStatus)
    ) {
      const kind = entryStatusConflict ? 'entry' : 'check-in';
      const mine = statusWords(localStatus, kind);
      const theirs = statusWords(remoteStatus, kind);
      return {
        title: `${subject} was checked in two ways`,
        description: `This device: ${mine}. Saved in myK9Show: ${theirs}. Choose the status to keep. ${dropsOthers}`,
        takeRemoteLabel: `Keep the saved status: ${theirs}`,
        keepLocalLabel: `Keep my status: ${mine}`,
      };
    }
    if (collided.length > 0) {
      return {
        title: `${subject} was changed on two devices`,
        description: `Changed on both: ${describeFieldConflicts(collided, local, remote)}. Choose which to keep. ${dropsOthers}`,
        takeRemoteLabel: CONFLICT_TAKE_REMOTE_LABEL,
        keepLocalLabel: CONFLICT_KEEP_LOCAL_LABEL,
      };
    }
    return {
      title: `${subject} was changed somewhere else at the same time`,
      description: CONFLICT_TOAST_DESCRIPTION,
      takeRemoteLabel: CONFLICT_TAKE_REMOTE_LABEL,
      keepLocalLabel: CONFLICT_KEEP_LOCAL_LABEL,
    };
  }

  const others = collided.filter(field => !isScoreField(field));
  const alsoChanged =
    others.length > 0
      ? ` Also changed on both: ${describeFieldConflicts(others, local, remote)}.`
      : '';
  return {
    title: `${subject} was scored two ways`,
    description: `This device: ${describeConflictScore(local)}. Saved in myK9Show: ${describeConflictScore(remote)}. Choose the score to keep.${alsoChanged} ${dropsOthers}`,
    takeRemoteLabel: `Keep the saved score: ${describeConflictScore(remote)}`,
    keepLocalLabel: `Keep my score: ${describeConflictScore(local)}`,
  };
}
