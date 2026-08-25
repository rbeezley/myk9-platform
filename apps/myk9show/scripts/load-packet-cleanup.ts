import { createClient } from '@supabase/supabase-js';
import { clearLoadTrialPacketSnapshots } from '../src/test/load/loadPacketCleanup';

const CANONICAL_SHOW_ID = 'dededede-0000-0000-0000-000000000010';
const projectRef = process.env.LOAD_TEST_PROJECT_REF;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!projectRef) throw new Error('Missing LOAD_TEST_PROJECT_REF for packet cleanup.');
if (!serviceRoleKey) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY for packet cleanup.');

const client = createClient(`https://${projectRef}.supabase.co`, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

clearLoadTrialPacketSnapshots(client, CANONICAL_SHOW_ID)
  .then(({ objectsRemoved, rowsRemoved }) => {
    console.log(
      `Removed ${objectsRemoved} canonical trial packet objects and ${rowsRemoved} audit rows.`
    );
  })
  .catch(error => {
    console.error(error instanceof Error ? error.message : 'Trial packet cleanup failed.');
    process.exitCode = 1;
  });
