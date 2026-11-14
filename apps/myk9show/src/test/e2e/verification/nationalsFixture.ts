import { randomUUID } from 'node:crypto';
import { fixture, isolatedClient } from './showDayProof.helpers';

const WILLOW = 'dededede-0000-0000-0000-000000000041';
export const NATIONALS_ARMBAND = '700';

/**
 * MYK9-1879: an isolated AKC Nationals trial of our own, so the walk never touches the shared
 * show-day fixture. Every row is cloned from the canonical show-day fixture (same club, same
 * assigned judge, same trial date) with fresh ids and the Nationals flag on, then one synthetic
 * entry is added for the seeded dog Willow under a new armband. Only the disposable stack's
 * service-role client ever writes here.
 */
export async function nationalsTrial(client: ReturnType<typeof isolatedClient>) {
  const seed = await fixture(client);
  const [showRead, trialRead, classRead, judgeRead, entryRead, visibilityRead] = await Promise.all([
    client.from('shows').select('*').eq('id', seed.showId).single(),
    client.from('trials').select('*').eq('id', seed.trialId).single(),
    client.from('classes').select('*').eq('id', seed.classId).single(),
    client
      .from('judge_assignments')
      .select('*')
      .eq('class_id', seed.classId)
      .eq('status', 'confirmed')
      .single(),
    client.from('entries').select('*').eq('id', seed.willowId).single(),
    client.from('show_visibility_settings').select('*').eq('show_id', seed.showId).maybeSingle(),
  ]);
  for (const read of [showRead, trialRead, classRead, judgeRead, entryRead, visibilityRead])
    if (read.error) throw read.error;
  if (!showRead.data || !trialRead.data || !classRead.data || !judgeRead.data || !entryRead.data)
    throw new Error('Canonical show-day rows are missing');

  const showId = randomUUID();
  const trialId = randomUUID();
  const classId = randomUUID();
  const entryId = randomUUID();

  const insert = async (table: string, row: Record<string, unknown>) => {
    const { error } = await client.from(table as 'shows').insert(row as never);
    if (error) throw new Error(`Inserting ${table} failed: ${error.message}`);
  };

  await insert('shows', {
    ...showRead.data,
    id: showId,
    name: `Isolated Nationals Walk ${showId.slice(0, 8)}`,
    organization: 'AKC',
    is_nationals: true,
    results_released_at: null,
    published_premium_at: null,
    published_premium_path: null,
    published_premium_url: null,
    published_premium_version: null,
    premium_publish_version: 0,
    version: 1,
  });
  if (visibilityRead.data)
    await insert('show_visibility_settings', { ...visibilityRead.data, show_id: showId });
  await insert('trials', { ...trialRead.data, id: trialId, show_id: showId, version: 1 });
  await insert('classes', {
    ...classRead.data,
    id: classId,
    trial_id: trialId,
    status: 'upcoming',
    status_source: 'derived',
    is_scoring_finalized: false,
    scored_count: 0,
    results_released_at: null,
    results_released_by: null,
    is_results_reviewed: false,
    results_verified_at: null,
    results_verified_by: null,
    results_verified_fingerprint: null,
    judge_signed_off_at: null,
    judge_signed_off_by: null,
    ring_phase: null,
    ring_phase_time: null,
    actual_start_time: null,
    actual_end_time: null,
    version: 1,
  });
  await insert('armbands', {
    id: randomUUID(),
    show_id: showId,
    dog_id: WILLOW,
    armband_number: NATIONALS_ARMBAND,
    is_available: false,
    assigned_at: new Date().toISOString(),
    version: 1,
  });
  await insert('judge_assignments', {
    ...judgeRead.data,
    id: randomUUID(),
    show_id: showId,
    trial_id: trialId,
    class_id: classId,
    version: 1,
  });
  await insert('entries', {
    ...entryRead.data,
    id: entryId,
    show_id: showId,
    trial_id: trialId,
    class_id: classId,
    armband: NATIONALS_ARMBAND,
    run_order: 1,
    entry_status: 'confirmed',
    check_in_status: 'checked-in',
    is_in_ring: false,
    is_scored: false,
    result_status: 'pending',
    search_time_seconds: 0,
    total_faults: 0,
    points_earned: null,
    final_placement: null,
    scoring_completed_at: null,
    scoring_started_at: null,
    ring_entry_time: null,
    total_correct_finds: 0,
    total_incorrect_finds: 0,
    area1_correct: null,
    area1_incorrect: null,
    penalty_points: null,
    total_score: null,
    judge_notes: null,
    disqualification_reason: null,
    withdrawn_at: null,
    check_in_pulled_by: null,
    deleted_at: null,
    registration_id: null,
    version: 1,
  });
  return { showId, trialId, classId, entryId };
}

export async function nationalsEntry(client: ReturnType<typeof isolatedClient>, entryId: string) {
  const { data, error } = await client
    .from('entries')
    .select(
      'id,is_scored,result_status,points_earned,search_time_seconds,final_placement,total_correct_finds,total_incorrect_finds'
    )
    .eq('id', entryId)
    .single();
  if (error || !data) throw new Error('Nationals entry read failed: ' + error?.message);
  return data;
}
