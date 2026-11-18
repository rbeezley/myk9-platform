import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.49.1';

import {
  anyDeadlineInWindow,
  type ReminderScoreChange,
  type ReminderSubmission,
  type ReminderTrial,
} from '../_shared/showCloseout/registryDeadlineReminder.ts';
import {
  AKC_FILE_SCORE_FIELDS,
  APP_SENT_REGISTRIES,
  newestSubmissionAt,
} from '../_shared/showCloseout/submissionCoverage.ts';
import { chunk, fetchAllPages } from './paging.ts';

/** A trial's last day sits at most this far behind today when a reminder can still be due (15 + margin). */
const LOOKBACK_DAYS = 21;

export interface ReminderCandidate {
  showId: string;
  showName: string;
  trials: ReminderTrial[];
  submissions: ReminderSubmission[];
  /** `undefined` = the score history was not read (no app-sent file, or the read failed). */
  scoreChanges?: ReminderScoreChange[] | undefined;
}

function dayOffset(now: Date, days: number): string {
  return new Date(now.getTime() + days * 86_400_000).toISOString().slice(0, 10);
}

/**
 * The newest change to a score the AKC file carries, per class, after the file went (the Finish
 * list's `getFileScoreChangesSince`), with each class's trial so it can be tied to a registry.
 */
async function loadScoreChanges(
  supabase: SupabaseClient,
  showId: string,
  sinceIso: string
): Promise<ReminderScoreChange[]> {
  const audit = await fetchAllPages<{
    id: string;
    class_id: string;
    changed_at: string;
    changes: unknown;
  }>('Failed to read the score history.', (from, to) =>
    supabase
      .from('entry_score_audit')
      .select('id, class_id, changed_at, changes')
      .eq('show_id', showId)
      .gt('changed_at', sinceIso)
      .order('changed_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, to)
  );
  const latest = new Map<string, string>();
  for (const row of audit) {
    if (latest.has(row.class_id)) continue;
    const changes = row.changes;
    const fields =
      changes && typeof changes === 'object' && !Array.isArray(changes) ? Object.keys(changes) : [];
    if (fields.some(field => AKC_FILE_SCORE_FIELDS.has(field)))
      latest.set(row.class_id, row.changed_at);
  }
  if (latest.size === 0) return [];

  const trialByClass = new Map<string, string | null>();
  for (const ids of chunk([...latest.keys()])) {
    const classes = await fetchAllPages<{ id: string; trial_id: string | null }>(
      'Failed to read the changed classes.',
      (from, to) =>
        supabase
          .from('classes')
          .select('id, trial_id')
          .in('id', ids)
          .is('deleted_at', null)
          .order('id')
          .range(from, to)
    );
    for (const cls of classes) trialByClass.set(cls.id, cls.trial_id);
  }
  // A class that is gone (soft-deleted) is not on the Finish list, so its changes do not count.
  return [...latest]
    .filter(([classId]) => trialByClass.has(classId))
    .map(([classId, changedAt]) => ({ trialId: trialByClass.get(classId) ?? null, changedAt }));
}

/**
 * Every live show with a trial inside the window where a deadline could be near, with ALL of its
 * trials (the last trial day, not the first, sets the deadline) and its result submissions. Each
 * scan pages past the 1,000-row cap in a stable order and each `.in(...)` goes out in chunks.
 */
export async function loadReminderCandidates(
  supabase: SupabaseClient,
  now: Date
): Promise<ReminderCandidate[]> {
  const recent = await fetchAllPages<{ id: string; show_id: string }>(
    'Failed to look up recent trials.',
    (from, to) =>
      supabase
        .from('trials')
        .select('id, show_id')
        .gte('date', dayOffset(now, -LOOKBACK_DAYS))
        .lte('date', dayOffset(now, 1))
        .is('deleted_at', null)
        .order('id')
        .range(from, to)
  );
  const showIds = [...new Set(recent.map(row => row.show_id))];
  if (showIds.length === 0) return [];

  const live: { id: string; name: string | null; status: string | null }[] = [];
  for (const ids of chunk(showIds)) {
    const shows = await fetchAllPages<(typeof live)[number]>('Failed to load shows.', (from, to) =>
      supabase
        .from('shows')
        .select('id, name, status')
        .in('id', ids)
        .is('deleted_at', null)
        .order('id')
        .range(from, to)
    );
    live.push(
      ...shows.filter(
        show =>
          !['draft', 'cancelled', 'canceled'].includes(String(show.status ?? '').toLowerCase())
      )
    );
  }
  if (live.length === 0) return [];
  const liveIds = live.map(show => show.id);

  type TrialRow = {
    id: string;
    show_id: string;
    date: string | null;
    timezone: string | null;
    registry_id: string | null;
    trial_type: string | null;
    status: string | null;
  };
  type SubmissionRow = {
    id: string;
    show_id: string;
    organization: string | null;
    status: string | null;
    submitted_at: string | null;
  };
  const trials: TrialRow[] = [];
  const submissions: SubmissionRow[] = [];
  for (const ids of chunk(liveIds)) {
    trials.push(
      ...(await fetchAllPages<TrialRow>('Failed to load trials.', (from, to) =>
        supabase
          .from('trials')
          .select('id, show_id, date, timezone, registry_id, trial_type, status')
          .in('show_id', ids)
          .is('deleted_at', null)
          .order('id')
          .range(from, to)
      ))
    );
    submissions.push(
      ...(await fetchAllPages<SubmissionRow>('Failed to load result submissions.', (from, to) =>
        supabase
          .from('result_submissions')
          .select('id, show_id, organization, status, submitted_at')
          .in('show_id', ids)
          .order('id')
          .range(from, to)
      ))
    );
  }

  const candidates: ReminderCandidate[] = [];
  for (const show of live) {
    const showSubmissions: ReminderSubmission[] = submissions
      .filter(row => row.show_id === show.id)
      .map(row => ({
        organization: row.organization ?? null,
        status: row.status ?? null,
        submittedAt: row.submitted_at ?? null,
      }));
    const candidate: ReminderCandidate = {
      showId: show.id,
      showName: String(show.name ?? 'Your show'),
      trials: trials
        .filter(row => row.show_id === show.id)
        .map(row => ({
          id: row.id,
          date: row.date ?? null,
          timeZone: row.timezone ?? null,
          registryId: row.registry_id ?? null,
          trialType: row.trial_type ?? null,
          status: row.status ?? null,
        })),
      submissions: showSubmissions,
    };
    const coverage = showSubmissions.map(row => ({
      status: row.status,
      organization: row.organization,
      submitted_at: row.submittedAt,
    }));
    const sentTimes = APP_SENT_REGISTRIES.map(registry =>
      newestSubmissionAt(coverage, registry, 'sent')
    ).filter((at): at is number => at !== null);
    if (sentTimes.length > 0 && anyDeadlineInWindow(candidate.trials, now)) {
      // Only a show with an app-sent file AND a deadline inside the window can owe a reminder for
      // a corrected file; anything else skips the history read.
      try {
        candidate.scoreChanges = await loadScoreChanges(
          supabase,
          show.id,
          new Date(Math.min(...sentTimes)).toISOString()
        );
      } catch (error) {
        // The list keeps its tick and says it could not check; so does the reminder.
        console.error('remind-registry-deadline: score history not read', {
          showId: show.id,
          error,
        });
      }
    }
    candidates.push(candidate);
  }
  return candidates;
}
