// @vitest-environment node
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { LOAD_SHOWS } from './loadFixture';
import { staffEmailForShow, staffPasswordEnvForShow } from './loadStaffCredentials';

const exec = promisify(execFile);

async function runPreflight(
  mode: 'valid' | 'cross-show' | 'bad-password' | 'rpc-error',
  verify = true
) {
  const signedIn: string[] = [];
  const server = createServer(async (req, res) => {
    res.setHeader('content-type', 'application/json');
    if (req.url?.startsWith('/auth/v1/token')) {
      let body = '';
      for await (const chunk of req) body += chunk;
      const { email } = JSON.parse(body) as { email: string };
      signedIn.push(email);
      if (mode === 'bad-password') {
        res
          .writeHead(400)
          .end(JSON.stringify({ error: 'invalid_grant', message: 'Invalid login credentials' }));
        return;
      }
      const index = LOAD_SHOWS.findIndex(show => staffEmailForShow(show.index) === email);
      res.end(
        JSON.stringify({
          access_token: `token-${index}`,
          refresh_token: 'fixture-refresh',
          token_type: 'bearer',
          expires_in: 3600,
          user: { id: `user-${index}`, email },
        })
      );
      return;
    }
    if (req.url === '/rest/v1/rpc/manageable_show_ids') {
      if (mode === 'rpc-error') {
        res.writeHead(403).end(JSON.stringify({ message: 'permission denied' }));
        return;
      }
      const index = Number(req.headers.authorization?.replace('Bearer token-', ''));
      const shows = [LOAD_SHOWS[index].showId, 'unrelated-show'];
      if (mode === 'cross-show' && index === 0) shows.push(LOAD_SHOWS[1].showId);
      res.end(JSON.stringify(shows));
      return;
    }
    res.writeHead(404).end('{}');
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  try {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing server address');
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      VITE_SUPABASE_URL: `http://127.0.0.1:${address.port}`,
      VITE_SUPABASE_ANON_KEY: 'local-test-key',
    };
    for (const show of LOAD_SHOWS) env[staffPasswordEnvForShow(show.index)] = 'local-password';
    try {
      const output = await exec(
        process.execPath,
        [
          '--import',
          'tsx',
          resolve('scripts/load-staff-preflight.ts'),
          ...(verify ? ['--verify-scope'] : []),
        ],
        { env, timeout: 10000 }
      );
      return { code: 0, output: output.stdout + output.stderr, signedIn };
    } catch (error) {
      const failure = error as { code: number; stdout: string; stderr: string };
      return { code: failure.code, output: failure.stdout + failure.stderr, signedIn };
    }
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close(error => (error ? reject(error) : resolve()))
    );
  }
}

describe('staff preflight command', () => {
  it('checks presence without authenticating before reseed', async () => {
    const result = await runPreflight('valid', false);
    expect(result.code).toBe(0);
    expect(result.signedIn).toEqual([]);
  });

  it('authenticates every secretary and accepts unrelated shows after reseed', async () => {
    const result = await runPreflight('valid');
    expect(result.code).toBe(0);
    expect(result.signedIn.sort()).toEqual(
      LOAD_SHOWS.map(show => staffEmailForShow(show.index)).sort()
    );
    expect(result.output).toContain('Staff scope verified');
    expect(result.output).not.toContain('token-');
  });

  it.each(['cross-show', 'bad-password', 'rpc-error'] as const)(
    'fails closed for %s',
    async mode => {
      const result = await runPreflight(mode);
      expect(result.code).toBe(1);
      expect(result.output).not.toContain('Staff scope verified');
    }
  );
});
