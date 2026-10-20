import { createClient } from '@supabase/supabase-js';
import { clearLoadTrialPacketSnapshots } from '../src/test/load/loadPacketCleanup';
import { PACKET_REQUEST_TIMEOUT_MS } from '../src/test/load/loadPacketCleanupRetry';

const CANONICAL_SHOW_ID = 'dededede-0000-0000-0000-000000000010';
const projectRef = process.env.LOAD_TEST_PROJECT_REF;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!projectRef) throw new Error('Missing LOAD_TEST_PROJECT_REF for packet cleanup.');
if (!serviceRoleKey) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY for packet cleanup.');

// Run 39390552156 lost two minutes to one read the gateway held open. The
// per-request ceiling turns that into a retryable failure and bounds the whole
// cleanup (worstCaseCleanupMs), which the workflow step's timeout is sized from.
const client = createClient(`https://${projectRef}.supabase.co`, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
  // PostgREST retries transient failures itself by default; nested under our
  // policy that multiplied four attempts into sixteen fetches.
  db: { retry: false },
  global: {
    fetch: (input, init) =>
      fetch(input, {
        ...init,
        signal: init?.signal
          ? AbortSignal.any([init.signal, AbortSignal.timeout(PACKET_REQUEST_TIMEOUT_MS)])
          : AbortSignal.timeout(PACKET_REQUEST_TIMEOUT_MS),
      }),
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
