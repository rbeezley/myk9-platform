/**
 * The "judge changed" email (MYK9-2125): built when it is SENT, from the classes' current
 * judges, so a job that waited out several edits names the judge the exhibitor first knew
 * and the judge now in place, for every class that changed.
 *
 * The job stores only ids: judge_changes = { class id: person id of the judge before the
 * first change }. Refunds are never promised here beyond the registry's own rule, and never
 * as automatic: AKC and UKC say the exhibitor may ASK the trial secretary in writing; ASCA
 * says nothing about money (owner decision, 2026-11-17).
 */
import { registryEmailLanguage } from '../send-confirmation-email/registryLanguage.ts';
import {
  JUDGE_ASSIGNMENT_NAME_SELECT,
  judgeNamesByClass,
  type JudgeAssignmentNameRow,
} from '../_shared/exhibitorEmailDetails.ts';
import {
  myShowsEntriesUrl,
  type LifecycleEmailSupabaseClient,
  type QueryResult,
} from './lifecycle-email-shared.ts';
import { formatTrialDate } from './lifecycle-email-showChanged.ts';

export interface JudgeChange {
  className: string;
  /** "Saturday Trial, Saturday, November 21, 2026", or whatever of it is known. */
  where: string;
  /** Name of the judge before the first change; null when that person cannot be named. */
  fromJudge: string | null;
  /** The class's confirmed judge now; null when none is named yet. */
  toJudge: string | null;
}

export interface RenderedJudgeChangedEmail {
  subject: string;
  body: string;
}

interface ClassRow {
  id: string;
  name: string | null;
  element: string | null;
  level: string | null;
  section: string | null;
  deleted_at: string | null;
  trials: TrialRow | TrialRow[] | null;
}

interface TrialRow {
  name: string | null;
  date: string | null;
  registry_id: string | null;
  timezone: string | null;
  deleted_at: string | null;
}

interface AssignmentRow extends JudgeAssignmentNameRow {
  person_id: string | null;
}

interface PersonNameRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
}

function clean(value: string | null | undefined): string {
  return (value ?? '').trim();
}

function personName(person: PersonNameRow | undefined): string | null {
  if (!person) return null;
  const name = [clean(person.first_name), clean(person.last_name)].filter(Boolean).join(' ');
  return name || null;
}

function className(row: ClassRow): string {
  return (
    clean(row.name) ||
    [clean(row.element), clean(row.level), clean(row.section)].filter(Boolean).join(' ') ||
    'your class'
  );
}

function firstTrial(row: ClassRow): TrialRow | null {
  const trial = Array.isArray(row.trials) ? row.trials[0] : row.trials;
  return trial ?? null;
}

function parseJudgeChanges(value: unknown): Array<[string, string]> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  return Object.entries(value as Record<string, unknown>).filter(
    (pair): pair is [string, string] => typeof pair[1] === 'string' && pair[1] !== ''
  );
}

/** Today's YYYY-MM-DD in the trial's zone; an unknown zone reads as America/New_York. */
function todayInZone(now: Date, timeZone: string | null): string {
  for (const zone of [clean(timeZone), 'America/New_York']) {
    if (!zone) continue;
    try {
      return new Intl.DateTimeFormat('en-CA', { timeZone: zone }).format(now);
    } catch {
      // An invalid zone: try the default.
    }
  }
  return now.toISOString().slice(0, 10);
}

export type JudgeChangedPlan =
  { kind: 'skip' } | { kind: 'send'; registryId: string | null; changes: JudgeChange[] };

/**
 * Reads what the email needs and decides whether it still has anything to say: the person
 * must still have a live entry in an affected class, and the class must have a different
 * judge now than before the first change (a change that was undone is not news; a class
 * left with no judge is not told as a change either).
 */
export async function planJudgeChangedEmail(args: {
  supabase: LifecycleEmailSupabaseClient;
  jobId: string;
  showId: string;
  personId: string;
  now: Date;
}): Promise<JudgeChangedPlan> {
  const { supabase } = args;
  const skip: JudgeChangedPlan = { kind: 'skip' };

  const jobRead = (await supabase
    .from('show_lifecycle_email_jobs')
    .select('judge_changes')
    .eq('id', args.jobId)
    .single()) as QueryResult<{ judge_changes: unknown }>;
  // A failed read must not read as "nothing changed": leave the job for the next drain.
  if (jobRead.error || !jobRead.data) throw new Error('Failed to load the judge changes');
  const recorded = parseJudgeChanges(jobRead.data.judge_changes);
  if (recorded.length === 0) return skip;

  const live = await supabase.rpc('person_live_entry_class_ids', {
    p_show_id: args.showId,
    p_person_id: args.personId,
  });
  if (live.error) throw new Error('Failed to check the recipient');
  const liveClassIds = new Set(
    (Array.isArray(live.data) ? live.data : []).map(value => String(value))
  );
  const affected = recorded.filter(([classId]) => liveClassIds.has(classId));
  if (affected.length === 0) return skip;
  const classIds = affected.map(([classId]) => classId);

  const classRead = (await supabase
    .from('classes')
    .select(
      'id, name, element, level, section, deleted_at, trials(name, date, registry_id, timezone, deleted_at)'
    )
    .in('id', classIds)) as QueryResult<ClassRow[]>;
  if (classRead.error) throw new Error('Failed to load classes');
  const classes = new Map((classRead.data ?? []).map(row => [row.id, row]));

  const assignmentRead = (await supabase
    .from('judge_assignments')
    .select(`${JUDGE_ASSIGNMENT_NAME_SELECT}, person_id`)
    .in('class_id', classIds)
    .eq('status', 'confirmed')) as QueryResult<AssignmentRow[]>;
  if (assignmentRead.error) throw new Error('Failed to load judges');
  const assignments = (assignmentRead.data ?? []).filter(row => row.class_id);
  const currentNames = judgeNamesByClass(assignments);
  const currentPerson = new Map<string, string | null>();
  for (const row of assignments) {
    if (row.class_id && !currentPerson.has(row.class_id))
      currentPerson.set(row.class_id, row.person_id);
  }

  const previousIds = [...new Set(affected.map(([, fromId]) => fromId))];
  const peopleRead = (await supabase
    .from('people')
    .select('id, first_name, last_name')
    .in('id', previousIds)) as QueryResult<PersonNameRow[]>;
  if (peopleRead.error) throw new Error('Failed to load the previous judges');
  const previous = new Map((peopleRead.data ?? []).map(row => [row.id, row]));

  const changes: JudgeChange[] = [];
  let registryId: string | null = null;
  for (const [classId, fromId] of affected) {
    const row = classes.get(classId);
    if (!row || row.deleted_at) continue;
    const trial = firstTrial(row);
    if (!trial || trial.deleted_at) continue;
    const toJudge = currentNames.get(classId) ?? null;
    if (!toJudge) {
      // No judge named yet: still told (a new one is coming), unless the trial day is past.
      const date = clean(trial.date).slice(0, 10);
      if (date && date < todayInZone(args.now, trial.timezone)) continue;
    } else if (currentPerson.get(classId) === fromId) {
      continue;
    }
    registryId ??= trial.registry_id;
    changes.push({
      className: className(row),
      where: [clean(trial.name), clean(trial.date) ? formatTrialDate(clean(trial.date)) : '']
        .filter(Boolean)
        .join(', '),
      fromJudge: personName(previous.get(fromId)),
      toJudge,
    });
  }
  if (changes.length === 0) return skip;
  changes.sort((a, b) => a.where.localeCompare(b.where) || a.className.localeCompare(b.className));
  return { kind: 'send', registryId, changes };
}

/** "Container Novice A (Saturday Trial, Saturday, November 21, 2026)". */
function classLabel(change: JudgeChange): string {
  return change.where ? `${change.className} (${change.where})` : change.className;
}

/**
 * Each registry's own rule, stated as the rule and never as a verdict on this exhibitor: it
 * stays true whenever the email arrives, and a refund is always a person's action, never
 * automatic. ASCA says nothing about money (owner decision, 2026-11-17).
 */
export function judgeChangeRefundLine(
  registryId: string | null | undefined,
  changes: readonly JudgeChange[]
): string {
  switch (registryEmailLanguage(registryId).id) {
    case 'UKC':
      return 'Under UKC rules, you may ask the trial secretary in writing for a full refund.';
    case 'ASCA':
      return 'Contact the trial secretary with questions.';
    default: {
      // AKC Scent Work Regulations, Ch. 3 sec. 24 and 25: the deadline depends on whether the
      // change came before or after the judging schedule went out, which we cannot tell. Sec. 24
      // applies only to changes after the premium list went out, so the line names that boundary.
      const classes =
        changes.length === 1
          ? `the affected class (${classLabel(changes[0])})`
          : `each affected class (${changes.map(classLabel).join('; ')})`;
      return `Under AKC rules, when a judge changes after the premium list went out, you may withdraw from ${classes} and ask for a full refund of its entry fee. Tell the trial secretary in writing. If the change was made before the judging schedule was sent out, your request must reach the trial secretary at least 30 minutes before the event starts on your first day entered. If it was made after, your request must reach the trial secretary before judging of that class starts.`;
    }
  }
}

export function renderJudgeChangedEmail(args: {
  showId: string;
  showName: string | null;
  recipientName: string | null;
  registryId: string | null;
  changes: readonly JudgeChange[];
}): RenderedJudgeChangedEmail {
  const showName = clean(args.showName) || 'your show';
  const firstName = clean(args.recipientName).split(/\s+/)[0] || 'there';
  const lines = args.changes.map(change => {
    const label = classLabel(change);
    const was = change.fromJudge ? `Judge ${change.fromJudge}` : 'the previous judge';
    return change.toJudge
      ? `${label}: was ${was}, now Judge ${change.toJudge}`
      : `${label}: was ${was}`;
  });
  const unnamed = args.changes
    .filter(change => !change.toJudge)
    .map(
      change =>
        `A new judge for ${classLabel(change)} has not been named yet. The trial secretary will tell you who it is.`
    );
  const intro =
    args.changes.length === 1
      ? `The judge for a class you are entered in at ${showName} has changed.`
      : `The judge for ${args.changes.length} classes you are entered in at ${showName} has changed.`;

  return {
    subject: `Judge change for ${showName}`,
    body: [
      `Hi ${firstName},`,
      intro,
      lines.join('\n'),
      ...unnamed,
      judgeChangeRefundLine(args.registryId, args.changes),
      `Your entries: ${myShowsEntriesUrl(args.showId)}`,
    ].join('\n\n'),
  };
}
