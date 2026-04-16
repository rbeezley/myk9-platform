/**
 * Integration test: RLS cross-club isolation for secretary_tasks.
 *
 * Uses the real Supabase DB — requires SUPABASE_SERVICE_ROLE_KEY in .env.
 * Run with: pnpm test:integration
 *
 * Verifies that a secretary for club A cannot read tasks belonging to club B.
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
  throw new Error(
    'Missing env: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY'
  );
}

// Admin client bypasses RLS — used only for seeding and teardown.
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Unique suffix to avoid collisions across parallel runs.
const suffix = Date.now().toString(36);
const email1 = `rls-test-sec1-${suffix}@myk9test.invalid`;
const email2 = `rls-test-sec2-${suffix}@myk9test.invalid`;
const testPassword = 'Rls$TestPass99!';

let clubId1: string;
let clubId2: string;
let personId1: string;
let personId2: string;
let authUserId1: string;
let authUserId2: string;
let taskId1: string;
let secretaryRoleId: string;

beforeAll(async () => {
  // --- Create two clubs ---
  const { data: club1, error: e1 } = await admin
    .from('clubs')
    .insert({ name: `RLS Test Club 1 ${suffix}` })
    .select('id')
    .single();
  if (e1 || !club1) throw new Error(`Failed to create club1: ${e1?.message}`);
  clubId1 = club1.id;

  const { data: club2, error: e2 } = await admin
    .from('clubs')
    .insert({ name: `RLS Test Club 2 ${suffix}` })
    .select('id')
    .single();
  if (e2 || !club2) throw new Error(`Failed to create club2: ${e2?.message}`);
  clubId2 = club2.id;

  // --- Create two auth users ---
  const { data: u1, error: ue1 } = await admin.auth.admin.createUser({
    email: email1,
    password: testPassword,
    email_confirm: true,
  });
  if (ue1 || !u1.user) throw new Error(`Failed to create auth user1: ${ue1?.message}`);
  authUserId1 = u1.user.id;

  const { data: u2, error: ue2 } = await admin.auth.admin.createUser({
    email: email2,
    password: testPassword,
    email_confirm: true,
  });
  if (ue2 || !u2.user) throw new Error(`Failed to create auth user2: ${ue2?.message}`);
  authUserId2 = u2.user.id;

  // --- Look up the people rows auto-created by the handle_new_user trigger ---
  // The trigger fires on auth.users INSERT and creates a people row automatically.
  const { data: p1, error: pe1 } = await admin
    .from('people')
    .select('id')
    .eq('auth_user_id', authUserId1)
    .single();
  if (pe1 || !p1)
    throw new Error(`Failed to find person1 (trigger may have failed): ${pe1?.message}`);
  personId1 = p1.id;

  const { data: p2, error: pe2 } = await admin
    .from('people')
    .select('id')
    .eq('auth_user_id', authUserId2)
    .single();
  if (pe2 || !p2)
    throw new Error(`Failed to find person2 (trigger may have failed): ${pe2?.message}`);
  personId2 = p2.id;

  // --- Look up the secretary role id ---
  const { data: role, error: re } = await admin
    .from('roles')
    .select('id')
    .eq('name', 'secretary')
    .single();
  if (re || !role) throw new Error(`Failed to find secretary role: ${re?.message}`);
  secretaryRoleId = role.id;

  // --- Assign person1 as secretary of club1 ---
  const { error: ur1e } = await admin.from('user_roles').insert({
    user_id: personId1,
    role_id: secretaryRoleId,
    club_id: clubId1,
    is_active: true,
  });
  if (ur1e) throw new Error(`Failed to assign user_role for person1: ${ur1e.message}`);

  // --- Assign person2 as secretary of club2 ---
  const { error: ur2e } = await admin.from('user_roles').insert({
    user_id: personId2,
    role_id: secretaryRoleId,
    club_id: clubId2,
    is_active: true,
  });
  if (ur2e) throw new Error(`Failed to assign user_role for person2: ${ur2e.message}`);

  // --- Seed a task for club1, created by person1 ---
  const { data: task, error: te } = await admin
    .from('secretary_tasks')
    .insert({
      club_id: clubId1,
      title: `RLS Test Task ${suffix}`,
      status: 'todo',
      created_by: personId1,
    })
    .select('id')
    .single();
  if (te || !task) throw new Error(`Failed to seed task: ${te?.message}`);
  taskId1 = task.id;
});

afterAll(async () => {
  // Teardown in reverse dependency order.
  if (taskId1) await admin.from('secretary_tasks').delete().eq('id', taskId1);
  if (personId1) await admin.from('user_roles').delete().eq('user_id', personId1);
  if (personId2) await admin.from('user_roles').delete().eq('user_id', personId2);
  if (personId1) await admin.from('people').delete().eq('id', personId1);
  if (personId2) await admin.from('people').delete().eq('id', personId2);
  if (clubId1) await admin.from('clubs').delete().eq('id', clubId1);
  if (clubId2) await admin.from('clubs').delete().eq('id', clubId2);
  if (authUserId1) await admin.auth.admin.deleteUser(authUserId1);
  if (authUserId2) await admin.auth.admin.deleteUser(authUserId2);
});

describe('secretary_tasks RLS — cross-club isolation', () => {
  it('club1 secretary can read club1 tasks', async () => {
    // Sign in as secretary1 (club1).
    const client1 = createClient(SUPABASE_URL!, ANON_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error: signInErr } = await client1.auth.signInWithPassword({
      email: email1,
      password: testPassword,
    });
    expect(signInErr).toBeNull();

    const { data, error } = await client1.from('secretary_tasks').select('id').eq('id', taskId1);

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data!.length).toBe(1);
    expect(data![0].id).toBe(taskId1);
  });

  it('club2 secretary cannot read club1 tasks', async () => {
    // Sign in as secretary2 (club2).
    const client2 = createClient(SUPABASE_URL!, ANON_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error: signInErr } = await client2.auth.signInWithPassword({
      email: email2,
      password: testPassword,
    });
    expect(signInErr).toBeNull();

    const { data, error } = await client2.from('secretary_tasks').select('id').eq('id', taskId1);

    // RLS hides the row — no error, empty result.
    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data!.length).toBe(0);
  });

  it('club2 secretary can read club2 tasks (own club still visible)', async () => {
    // Seed a task for club2 so we can verify club2 secretary's own access.
    const { data: task2, error: seedErr } = await admin
      .from('secretary_tasks')
      .insert({
        club_id: clubId2,
        title: `RLS Test Task Club2 ${suffix}`,
        status: 'todo',
        created_by: personId2,
      })
      .select('id')
      .single();
    expect(seedErr).toBeNull();
    const task2Id = task2!.id;

    const client2 = createClient(SUPABASE_URL!, ANON_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    await client2.auth.signInWithPassword({ email: email2, password: testPassword });

    const { data, error } = await client2.from('secretary_tasks').select('id').eq('id', task2Id);

    expect(error).toBeNull();
    expect(data!.length).toBe(1);
    expect(data![0].id).toBe(task2Id);

    // Cleanup this extra task.
    await admin.from('secretary_tasks').delete().eq('id', task2Id);
  });
});
