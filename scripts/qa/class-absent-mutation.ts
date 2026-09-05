import { execFileSync, spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const local = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
if (process.env.MYK9_BEHAVIORAL_SQL_DATABASE_URL !== local) {
  throw new Error('Mutation proof requires the exact disposable loopback SQL URL.');
}
const file = resolve(
  import.meta.dirname,
  '../../supabase/tests/class_lifecycle_absent_parity_test.sql'
);
const args = [local, '-X', '-v', 'ON_ERROR_STOP=1'];
// Green baseline against the installed, fully migrated schema first.
execFileSync('psql', [...args, '-f', file], { stdio: 'inherit' });
for (const signature of [
  'public.refresh_class_scoring_state(uuid)',
  'public.handle_entry_scoring_state_change()',
  'public.tv_class_entry_counts(uuid,uuid[])',
  'public.tv_board_entries(uuid,uuid[])',
]) {
  // Mutation and behavioral test share one session/transaction. Failure closes
  // the connection and rolls back the changed definition; success is a failure
  // of the proof and the test's ROLLBACK still restores it. No shared DB allowed.
  const input = `BEGIN;
DO $mutation$
DECLARE original text; changed text; installed text;
BEGIN
  SELECT pg_get_functiondef('${signature}'::regprocedure) INTO original;
  changed := replace(original, '''not_accepted'', ''absent''', '''not_accepted''');
  IF changed = original THEN RAISE EXCEPTION 'mutation did not change ${signature}'; END IF;
  EXECUTE changed;
  SELECT pg_get_functiondef('${signature}'::regprocedure) INTO installed;
  IF installed <> changed THEN RAISE EXCEPTION 'mutation definition did not install'; END IF;
  RAISE NOTICE 'MUTATION_INSTALLED ${signature}';
END $mutation$;
\\i '${file.replaceAll("'", "''")}'
ROLLBACK;
`;
  const result = spawnSync('psql', args, { input, encoding: 'utf8' });
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  if (
    result.error ||
    result.status === 0 ||
    !output.includes(`MUTATION_INSTALLED ${signature}`) ||
    !/ERROR:.*MYK9-356/.test(output)
  ) {
    throw new Error(`Mutation proof inconclusive for ${signature}: ${output.slice(-4000)}`);
  }
  console.log(`Expected behavioral failure after installed mutation: ${signature}`);
  execFileSync('psql', [...args, '-f', file], { stdio: 'inherit' });
}
