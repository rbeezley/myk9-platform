import { spawnSync } from 'node:child_process';
import { expect, it } from 'vitest';
import { buildGlobalsDumpArgs } from './export';

const clientProbe = spawnSync('pg_dumpall', ['--version'], { encoding: 'utf8', timeout: 5000 });
const clientMissing = (clientProbe.error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT';
// Pure tests remain portable; CI requires this native integration probe to execute.
it.skipIf(clientMissing && !process.env.CI)(
  'passes the URI as a libpq connection string to the real pg_dumpall client',
  () => {
    // Port 1 is intentionally closed: verify URI interpretation without requiring a DB or credentials.
    const result = spawnSync(
      'pg_dumpall',
      buildGlobalsDumpArgs('/dev/null', 'postgresql://postgres@127.0.0.1:1/postgres'),
      {
        encoding: 'utf8',
        timeout: 5000,
        env: {
          ...process.env,
          PGCONNECT_TIMEOUT: '1',
          PGPASSWORD: '',
          LC_ALL: 'C',
          LC_MESSAGES: 'C',
        },
      }
    );
    expect(result.error).toBeUndefined();
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('connection to server at "127.0.0.1"');
    expect(result.stderr).toContain('port 1');
  }
);
