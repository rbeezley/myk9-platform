import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect } from '@playwright/test';

/**
 * Service-role setup, teardown and cron access for `waitlistJourney.spec.ts` (MYK9-971).
 *
 * Every write here goes to the isolated Playwright Regression database only: `waitlistAdmin()`
 * refuses any Supabase URL that is not on this machine, so a mis-set environment fails the spec
 * instead of touching shared staging.
 */

export const SHOW_ID = 'dededede-0000-0000-0000-000000000010';
/** The seed's full-class fixture: Handler Discrimination Advanced, max_entries 1, Cooper entered. */
export const FULL_CLASS_ID = 'dec1a55e-0000-0000-0000-000000000045';
/** Juniper's seeded waiting row lives on Interior Advanced; parked so the cron offers only ours. */
const JUNIPER_CLASS_ID = 'dec1a55e-0000-0000-0000-000000000032';
export const DOGS = {
  willow: 'dededede-0000-0000-0000-000000000041',
  ranger: 'dededede-0000-0000-0000-000000000042',
  juniper: 'dededede-0000-0000-0000-000000000043',
  scout: 'dededede-0000-0000-0000-000000000044',
  maple: 'dededede-0000-0000-0000-000000000045',
} as const;

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const CRON_SECRET = process.env.MYK9_E2E_CRON_SECRET ?? '';

export interface WaitlistRow {
  id: string;
  dog_id: string;
  position: number | null;
  status: string;
  joined_via: string;
  offer_expires_at: string | null;
  promoted_entry_id: string | null;
}

interface Snapshot {
  maxEntries: number | null;
  allowWaitlist: boolean | null;
  juniperRowId: string | null;
}

export function waitlistAdmin(): SupabaseClient {
  if (!SUPABASE_URL || !SERVICE_KEY || !CRON_SECRET) {
    throw new Error(
      'The waitlist journey needs VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and ' +
        'MYK9_E2E_CRON_SECRET from the isolated target (scripts/qa/isolated-e2e-lifecycle.ts).'
    );
  }
  const host = new URL(SUPABASE_URL).hostname;
  if (!['127.0.0.1', 'localhost', '::1', '[::1]'].includes(host)) {
    throw new Error(`Refusing service-role writes to ${host}: the waitlist journey is local-only.`);
  }
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
}

export async function must<T>(
  label: string,
  query: PromiseLike<{ data: T; error: { message: string } | null }>
): Promise<NonNullable<T>> {
  const { data, error } = await query;
  if (error) throw new Error(`${label}: ${error.message}`);
  if (data === null || data === undefined) throw new Error(`${label}: no data`);
  return data;
}

/** A write: only the error matters (no `.select()`, so `data` is null). */
export async function ok(label: string, query: PromiseLike<{ error: { message: string } | null }>) {
  const { error } = await query;
  if (error) throw new Error(`${label}: ${error.message}`);
}

export async function authUserId(admin: SupabaseClient, email: string): Promise<string> {
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw new Error(`listUsers: ${error.message}`);
  const user = data.users.find(u => u.email?.toLowerCase() === email.toLowerCase());
  if (!user) throw new Error(`Seed drift: no auth user ${email}`);
  return user.id;
}

/**
 * Opens the full class to a wait list (still full), and parks Juniper's seeded waiting row so the
 * cron's global candidate scan offers nothing outside this journey. Returns what to restore.
 */
export async function prepareFullClass(admin: SupabaseClient): Promise<Snapshot> {
  const cls = await must(
    'read full class',
    admin.from('classes').select('max_entries, allow_waitlist').eq('id', FULL_CLASS_ID).single()
  );
  const existing = await must(
    'read full class wait list',
    admin.from('waitlist_entries').select('id').eq('class_id', FULL_CLASS_ID)
  );
  expect(existing, 'the seed puts no wait list on the full-class fixture').toEqual([]);
  const { data: juniper, error: juniperError } = await admin
    .from('waitlist_entries')
    .select('id')
    .eq('class_id', JUNIPER_CLASS_ID)
    .eq('dog_id', DOGS.juniper)
    .eq('status', 'waiting')
    .maybeSingle();
  if (juniperError) throw new Error(`read Juniper wait-list row: ${juniperError.message}`);
  await ok(
    'open full class to a wait list',
    admin.from('classes').update({ allow_waitlist: true }).eq('id', FULL_CLASS_ID)
  );
  if (juniper) {
    await ok(
      'park Juniper',
      admin.from('waitlist_entries').update({ status: 'withdrawn' }).eq('id', juniper.id)
    );
  }
  return {
    maxEntries: cls.max_entries,
    allowWaitlist: cls.allow_waitlist,
    juniperRowId: juniper?.id ?? null,
  };
}

/** Adds the dogs behind the exhibitor's own join, in queue order. */
export async function queueBehind(
  admin: SupabaseClient,
  exhibitorProfileId: string,
  dogs: Array<{ dogId: string; joinedVia: 'online' | 'mail_in' }>
): Promise<void> {
  const rows = await waitlistRows(admin);
  let position = Math.max(0, ...rows.map(r => r.position ?? 0));
  for (const dog of dogs) {
    position += 1;
    await ok(
      `queue ${dog.dogId}`,
      admin.from('waitlist_entries').insert({
        class_id: FULL_CLASS_ID,
        exhibitor_id: exhibitorProfileId,
        dog_id: dog.dogId,
        position,
        status: 'waiting',
        joined_via: dog.joinedVia,
      })
    );
  }
}

export async function exhibitorProfileId(admin: SupabaseClient, authId: string): Promise<string> {
  const row = await must(
    'read exhibitor profile',
    admin.from('exhibitor_profiles').select('id').eq('auth_user_id', authId).single()
  );
  return row.id as string;
}

export async function setMaxEntries(admin: SupabaseClient, maxEntries: number): Promise<void> {
  await ok(
    'set max_entries',
    admin.from('classes').update({ max_entries: maxEntries }).eq('id', FULL_CLASS_ID)
  );
}

export async function waitlistRows(admin: SupabaseClient): Promise<WaitlistRow[]> {
  return must(
    'read wait list',
    admin
      .from('waitlist_entries')
      .select('id, dog_id, position, status, joined_via, offer_expires_at, promoted_entry_id')
      .eq('class_id', FULL_CLASS_ID)
  ) as Promise<WaitlistRow[]>;
}

export async function rowFor(admin: SupabaseClient, dogId: string): Promise<WaitlistRow> {
  const row = (await waitlistRows(admin)).find(r => r.dog_id === dogId);
  if (!row) throw new Error(`no wait-list row for ${dogId}`);
  return row;
}

export async function entryStatus(admin: SupabaseClient, entryId: string): Promise<string> {
  const row = await must(
    'read promoted entry',
    admin.from('entries').select('entry_status').eq('id', entryId).single()
  );
  return row.entry_status as string;
}

/** The paid leg's "active": the entry's lifecycle and money columns together. */
export async function entryPayment(
  admin: SupabaseClient,
  entryId: string
): Promise<{ entry_status: string; payment_status: string; payment_method: string | null }> {
  return must(
    'read promoted entry payment',
    admin
      .from('entries')
      .select('entry_status, payment_status, payment_method')
      .eq('id', entryId)
      .single()
  );
}

/** The newest payment link the exhibitor's "Complete payment" made for one promoted entry. */
export async function paymentLinkFor(
  admin: SupabaseClient,
  entryId: string
): Promise<{ stripe_checkout_session_id: string; status: string }> {
  return must(
    'read payment link',
    admin
      .from('entry_payment_links')
      .select('stripe_checkout_session_id, status')
      .contains('entry_ids', [entryId])
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
  );
}

/** Moves an open offer's deadline into the past, as if the 48 hours had run out. */
export async function backdateOffer(admin: SupabaseClient, rowId: string): Promise<void> {
  await ok(
    'backdate offer',
    admin
      .from('waitlist_entries')
      .update({ offer_expires_at: new Date(Date.now() - 60_000).toISOString() })
      .eq('id', rowId)
  );
}

/** One run of the production cron, authenticated exactly as pg_cron calls it. */
export async function runWaitlistCron(): Promise<Record<string, unknown>> {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/cron-waitlist-expiration`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${CRON_SECRET}`, 'Content-Type': 'application/json' },
    body: '{}',
  });
  const body = await response.text();
  expect(response.status, `cron-waitlist-expiration: ${body}`).toBe(200);
  return JSON.parse(body) as Record<string, unknown>;
}

export async function mailInHeadNoticeCount(
  admin: SupabaseClient,
  userId: string,
  since: string
): Promise<number> {
  const rows = await must(
    'read mail-in notices',
    admin
      .from('notifications')
      .select('id')
      .eq('user_id', userId)
      .eq('type', 'waitlist_mail_in_head')
      .gte('created_at', since)
  );
  return rows.length;
}

/**
 * Puts the seed back: the journey's entries and wait-list rows go, the class closes again, and
 * Juniper returns to the queue. Later Nightly specs in the same pass read this show.
 */
export async function restoreFullClass(
  admin: SupabaseClient,
  snapshot: Snapshot,
  since: string
): Promise<void> {
  const rows = await waitlistRows(admin);
  const promoted = rows.map(r => r.promoted_entry_id).filter((id): id is string => !!id);
  if (promoted.length > 0) {
    await ok(
      'delete payment links',
      admin.from('entry_payment_links').delete().overlaps('entry_ids', promoted)
    );
    // A history or message row may still reference an offered entry; then retire it instead.
    const { error } = await admin.from('entries').delete().in('id', promoted);
    if (error) {
      await ok(
        'retire promoted entries',
        admin.from('entries').update({ deleted_at: new Date().toISOString() }).in('id', promoted)
      );
    }
  }
  await ok(
    'delete wait list',
    admin.from('waitlist_entries').delete().eq('class_id', FULL_CLASS_ID)
  );
  await ok(
    'delete journey notices',
    admin
      .from('notifications')
      .delete()
      .gte('created_at', since)
      .like('deep_link_url', `/shows/${SHOW_ID}/entries%`)
  );
  await ok(
    'close full class',
    admin
      .from('classes')
      .update({ max_entries: snapshot.maxEntries, allow_waitlist: snapshot.allowWaitlist })
      .eq('id', FULL_CLASS_ID)
  );
  if (snapshot.juniperRowId) {
    await ok(
      'restore Juniper',
      admin.from('waitlist_entries').update({ status: 'waiting' }).eq('id', snapshot.juniperRowId)
    );
  }
}
