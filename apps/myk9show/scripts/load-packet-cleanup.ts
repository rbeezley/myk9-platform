import { createClient } from '@supabase/supabase-js';
import { clearLoadTrialPacketSnapshots } from '../src/test/load/loadPacketCleanup';

const CANONICAL_SHOW_ID = 'dededede-0000-0000-0000-000000000010';
const projectRef = process.env.LOAD_TEST_PROJECT_REF;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!projectRef) throw new Error('Missing LOAD_TEST_PROJECT_REF for packet cleanup.');
if (!serviceRoleKey) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY for packet cleanup.');

// Run 39390552156 lost two minutes to one read the gateway held open. A per-request
// ceiling turns a hung request into a retryable failure, so the bounded retries in
// clearLoadTrialPacketSnapshots fit inside the step's own timeout.
const REQUEST_TIMEOUT_MS = 30_000;

const client = createClient(`https://${projectRef}.supabase.co`, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: {
    fetch: (input, init) =>
      fetch(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS) }),
  },
});

clearLoadTrialPacketSnapshots(client, CANONICAL_SHOW_ID)
  .then(({ objectsRemoved, rowsRemoved }) => {
    console.log(
      `Removed ${objectsRemoved} canonical trial packet objects and ${rowsRemoved} audit rows.`
    );
  })
  .catch(error => {
    console.error(
      error instanceof Error ? error.message : `Trial packet cleanup failed: ${String(error)}`
    );
    process.exitCode = 1;
  });
