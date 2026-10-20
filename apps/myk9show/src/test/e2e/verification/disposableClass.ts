import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { fixture, isolatedClient, waiting } from './showDayProof.helpers';

export function registerDisposableProofHooks() {
  test.beforeAll(async () => {
    const expected = process.env.MYK9_SHOW_DAY_SOURCE_SHA;
    if (!expected || !/^[a-f0-9]{40}$/.test(expected)) throw new Error('Missing exact source SHA');
    const response = await fetch('http://127.0.0.1:4173/build-sha.txt');
    expect(response.ok).toBe(true);
    expect((await response.text()).trim()).toBe(expected);
  });

  // This worker owns the browser. Close contexts even when sign-in fails;
  // the disposable runner destroys the whole database stack separately.
  test.afterEach(async ({ browser }) => {
    await Promise.all(browser.contexts().map(context => context.close()));
  });
}

const DOGS = [
  'dededede-0000-0000-0000-000000000041',
  'dededede-0000-0000-0000-000000000046',
  'dededede-0000-0000-0000-000000000042',
  'dededede-0000-0000-0000-000000000043',
] as const;

export async function disposableClass(
  client: ReturnType<typeof isolatedClient>,
  count: 1 | 2 | 4,
  element = 'Container'
) {
  const seed = await fixture(client);
  const [classRead, entriesRead, judgeRead, armbandRead] = await Promise.all([
    client.from('classes').select('*').eq('id', seed.classId).single(),
    client.from('entries').select('*').eq('class_id', seed.classId).is('deleted_at', null),
    client
      .from('judge_assignments')
      .select('person_id')
      .eq('class_id', seed.classId)
      .eq('status', 'confirmed')
      .single(),
    client
      .from('armbands')
      .select('dog_id,armband_number')
      .eq('show_id', seed.showId)
      .in('dog_id', [...DOGS]),
  ]);
  if (classRead.error) throw classRead.error;
  if (entriesRead.error) throw entriesRead.error;
  if (judgeRead.error) throw judgeRead.error;
  if (armbandRead.error) throw armbandRead.error;
  const template = entriesRead.data.find(entry => entry.id === seed.willowId);
  if (!template) throw new Error('Missing canonical entry template');
  const dogs = DOGS.slice(0, count);
  const missing = dogs.flatMap((dogId, index) => {
    const existing = armbandRead.data.find(armband => armband.dog_id === dogId);
    if (existing) {
      expect(existing.armband_number).toBe(String(200 + index));
      return [];
    }
    return [
      {
        id: randomUUID(),
        show_id: seed.showId,
        dog_id: dogId,
        armband_number: String(200 + index),
        is_available: false,
        assigned_at: new Date().toISOString(),
        version: 1,
      },
    ];
  });
  if (missing.length) {
    const { error } = await client.from('armbands').insert(missing);
    if (error) throw error;
  }
  const classId = randomUUID();
  const ids = dogs.map(() => randomUUID());
  const { error: classError } = await client.from('classes').insert({
    ...classRead.data,
    id: classId,
    name: `${element} Novice A`,
    element,
    status: 'upcoming',
    status_source: 'derived',
    is_scoring_finalized: false,
    actual_start_time: null,
    actual_end_time: null,
    scored_count: 0,
    version: 1,
  });
  if (classError) throw classError;
  const { error: judgeError } = await client.from('judge_assignments').insert({
    id: randomUUID(),
    person_id: judgeRead.data.person_id,
    show_id: seed.showId,
    trial_id: seed.trialId,
    class_id: classId,
    status: 'confirmed',
    confirmed_at: new Date().toISOString(),
    version: 1,
  });
  if (judgeError) throw judgeError;
  const { data, error } = await client
    .from('entries')
    .insert(
      dogs.map((dogId, index) => ({
        ...(entriesRead.data.find(entry => entry.dog_id === dogId) ?? template),
        ...waiting,
        id: ids[index]!,
        class_id: classId,
        dog_id: dogId,
        armband: String(200 + index),
        run_order: index + 1,
        final_placement: null,
        scoring_completed_at: null,
        deleted_at: null,
        registration_id: null,
        entry_fee: 0,
        payment_status: 'pending',
        version: 1,
      }))
    )
    .select('id,armband,is_scored,result_status,final_placement')
    .order('armband');
  if (error) throw error;
  expect(data).toEqual(
    ids.map((id, index) => ({
      id,
      armband: String(200 + index),
      is_scored: false,
      result_status: 'pending',
      final_placement: null,
    }))
  );
  const state = await client
    .from('classes')
    .select('status,status_source,is_scoring_finalized')
    .eq('id', classId)
    .single();
  if (state.error) throw state.error;
  expect(state.data).toMatchObject({
    status: 'upcoming',
    status_source: 'derived',
    is_scoring_finalized: false,
  });
  return { showId: seed.showId, trialId: seed.trialId, classId, ids, willowId: ids[0]! };
}
