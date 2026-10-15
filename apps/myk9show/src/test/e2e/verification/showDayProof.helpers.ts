import {
  expect,
  type Browser,
  type BrowserContext,
  type Page,
  type TestInfo,
} from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@myk9/supabase';
import { resolveIsolatedE2eTarget } from '../../../../../../scripts/qa/isolated-e2e-target';
import { signIn, TEST_USERS } from '../helpers/testUsers';

export function isolatedClient() {
  const target = resolveIsolatedE2eTarget(process.env);
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('Missing runner-local service role key');
  return createClient<Database>(target.supabaseUrl, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
export type Client = ReturnType<typeof isolatedClient>;
export interface Fixture {
  showId: string;
  trialId: string;
  classId: string;
  willowId: string;
  cooperId: string;
}
export async function fixture(client: Client): Promise<Fixture> {
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date());
  const { data: cls, error } = await client
    .from('classes')
    .select('id,trial_id,trials!inner(date,show_id)')
    .gte('id', 'dededede-0000-0000-0731-000000000000')
    .lte('id', 'dededede-0000-0000-0731-ffffffffffff')
    .eq('trials.date', date)
    .is('deleted_at', null)
    .limit(1)
    .single();
  if (error || !cls) throw new Error('No canonical isolated show-day class: ' + error?.message);
  const { data: rows, error: entriesError } = await client
    .from('entries')
    .select('id,dog_id')
    .eq('class_id', cls.id)
    .is('deleted_at', null);
  if (entriesError) throw entriesError;
  expect(rows).toHaveLength(2);
  const willow = rows?.find(r => r.dog_id === 'dededede-0000-0000-0000-000000000041');
  const cooper = rows?.find(r => r.dog_id === 'dededede-0000-0000-0000-000000000046');
  if (!willow || !cooper) throw new Error('Canonical Willow/Cooper fixture absent');
  return {
    showId: cls.trials.show_id,
    trialId: cls.trial_id,
    classId: cls.id,
    willowId: willow.id,
    cooperId: cooper.id,
  };
}
export async function row(client: Client, id: string) {
  const { data, error } = await client
    .from('entries')
    .select(
      'id,class_id,run_order,entry_status,check_in_status,is_in_ring,is_scored,result_status,search_time_seconds,total_faults,version'
    )
    .eq('id', id)
    .single();
  if (error || !data) throw new Error('Local row read failed: ' + error?.message);
  return data;
}
export async function setState(
  client: Client,
  id: string,
  fields: Database['public']['Tables']['entries']['Update']
) {
  const before = await row(client, id);
  const { error } = await client
    .from('entries')
    .update({ ...fields, version: before.version + 1 })
    .eq('id', id)
    .eq('version', before.version);
  if (error) throw error;
  const after = await row(client, id);
  for (const [key, value] of Object.entries(fields)) expect(after).toHaveProperty(key, value);
  return after;
}
export const waiting = {
  entry_status: 'confirmed',
  check_in_status: 'checked-in',
  is_in_ring: false,
  is_scored: false,
  result_status: 'pending',
  search_time_seconds: 0,
  total_faults: 0,
} as const;
export async function reset(client: Client, f: Fixture) {
  await setState(client, f.willowId, { ...waiting, run_order: 101 });
  await setState(client, f.cooperId, { ...waiting, run_order: 31 });
}
function loopback(url: string) {
  const parsed = new URL(url);
  return ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
}
export async function guardedContext(browser: Browser): Promise<BrowserContext> {
  resolveIsolatedE2eTarget(process.env);
  const context = await browser.newContext({
    baseURL: 'http://127.0.0.1:4173',
    serviceWorkers: 'block',
  });
  await context.route('**/*', route =>
    loopback(route.request().url()) ? route.continue() : route.abort('blockedbyclient')
  );
  await context.routeWebSocket('**/*', socket => {
    if (loopback(socket.url())) socket.connectToServer();
    else socket.close();
  });
  return context;
}
export async function rolePage(
  browser: Browser,
  role: 'SECRETARY' | 'JUDGE' | 'DEMO_EXHIBITOR',
  path: string
) {
  const context = await guardedContext(browser);
  const page = await context.newPage();
  const account = TEST_USERS[role];
  if (!account) throw new Error('Missing role');
  await signIn(page, account.email, account.password, path, { reuseSession: false });
  return { context, page };
}
export function classPath(f: Fixture) {
  return `/at-show/${f.showId}/class/${f.classId}`;
}
export function secretaryPath(f: Fixture) {
  return `/shows/${f.showId}/trials/${f.trialId}/classes/${f.classId}`;
}
export async function replica(page: Page, entryId: string) {
  return page.evaluate(async id => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('myK9_Replication');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const read = (name: string) =>
      new Promise<unknown[]>((resolve, reject) => {
        const request = db.transaction(name).objectStore(name).getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    type Stored = {
      id: string;
      tableName?: string;
      serverVersion?: number;
      isDirty?: boolean;
      data?: Record<string, unknown>;
    };
    type Queued = {
      rowId: string;
      authUserId: string;
      data: Record<string, unknown>;
      rpc?: { name: string; args?: Record<string, unknown> };
    };
    const records = (await read('replicated_tables')) as Stored[];
    const pending = (await read('pending_mutations')) as Queued[];
    db.close();
    return {
      row: records.find(r => r.tableName === 'entries' && r.id === id) ?? null,
      pending: pending.filter(r => r.rowId === id),
    };
  }, entryId);
}
export async function sessionIdentity(page: Page) {
  return page.evaluate(() => {
    const key = Object.keys(localStorage).find(
      k => k.startsWith('sb-') && k.endsWith('-auth-token')
    );
    if (!key) throw new Error('Persisted auth session missing');
    const session = JSON.parse(localStorage.getItem(key) ?? 'null') as {
      user: { id: string };
      expires_at: number;
    };
    return { userId: session.user.id, expiresAt: session.expires_at };
  });
}
export async function evidence(info: TestInfo, name: string, value: unknown) {
  await info.attach(name, {
    body: JSON.stringify(value, null, 2),
    contentType: 'application/json',
  });
  console.log(name + ': ' + JSON.stringify(value));
}
export async function screenshot(page: Page, info: TestInfo, name: string) {
  await info.attach(name, {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
}
