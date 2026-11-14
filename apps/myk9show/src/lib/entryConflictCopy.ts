import { formatSecondsAsMSSCC } from '@/lib/format/searchTime';
import { classifyEntryCheckInStatus } from '@/features/show-map/showMapStatus';
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

function checkInWords(status: unknown): string {
  if (typeof status !== 'string' || !status) return 'no status';
  return classifyEntryCheckInStatus({ check_in_status: status })?.label ?? status;
}

export function entryConflictCopy(
  local: EntryConflictRow,
  remote: EntryConflictRow
): EntryConflictCopy {
  const named = describeConflictDog(remote);
  const dog = named !== 'this dog' ? named : describeConflictDog(local);
  const subject = dog === 'this dog' ? 'A dog' : dog;
  const scored = Boolean(
    read(local, 'is_scored', 'isScored') || read(remote, 'is_scored', 'isScored')
  );
  const localStatus = read(local, 'check_in_status', 'checkInStatus');
  const remoteStatus = read(remote, 'check_in_status', 'checkInStatus');
  // Two staff changed the status: say what each chose, so the pull is never dropped by guesswork.
  if (!scored && localStatus !== remoteStatus && (localStatus || remoteStatus)) {
    const mine = checkInWords(localStatus);
    const theirs = checkInWords(remoteStatus);
    return {
      title: `${subject} was checked in two ways`,
      description: `This device: ${mine}. Other device: ${theirs}. Choose the status to keep. Keeping the other one also drops anything else this device changed on this dog and had not sent yet.`,
      takeRemoteLabel: `Keep the other status: ${theirs}`,
      keepLocalLabel: `Keep my status: ${mine}`,
    };
  }
  // Never a button that could throw a score away without saying whose and which.
  if (!scored) {
    return {
      title: `${subject} was changed somewhere else at the same time`,
      description: CONFLICT_TOAST_DESCRIPTION,
      takeRemoteLabel: CONFLICT_TAKE_REMOTE_LABEL,
      keepLocalLabel: CONFLICT_KEEP_LOCAL_LABEL,
    };
  }
  return {
    title: `${subject} was scored two ways`,
    description: `This device: ${describeConflictScore(local)}. Other device: ${describeConflictScore(remote)}. Choose the score to keep. Keeping the other score also drops anything else this device changed on this dog and had not sent yet.`,
    takeRemoteLabel: `Keep the other score: ${describeConflictScore(remote)}`,
    keepLocalLabel: `Keep my score: ${describeConflictScore(local)}`,
  };
}
