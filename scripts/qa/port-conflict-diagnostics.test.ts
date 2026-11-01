import { describe, expect, it } from 'vitest';

import {
  describePortHolder,
  detectBindFailurePort,
  keepSocketLinesForPort,
} from './port-conflict-diagnostics';

const REAL_FAILURE =
  'failed to start docker container "supabase_db_myk9-platform": Error response from daemon: ' +
  'failed to set up container networking: driver failed programming external connectivity on ' +
  'endpoint supabase_db_myk9-platform: failed to bind host port 0.0.0.0:54322/tcp: address already in use';

const SS = [
  'State  Recv-Q Send-Q Local Address:Port Peer Address:Port Process',
  'ESTAB  0      0      10.1.0.4:54322     52.1.2.3:443      users:(("skopeo",pid=88,fd=7))',
  'ESTAB  0      0      10.1.0.4:43222     52.1.2.3:443      users:(("curl",pid=89,fd=7))',
].join('\n');

describe('detectBindFailurePort', () => {
  it('reads the port from the runner failure text', () => {
    expect(detectBindFailurePort(REAL_FAILURE)).toBe(54322);
  });

  it('reads an IPv6 bind address', () => {
    expect(
      detectBindFailurePort('failed to bind host port [::]:54321/tcp: address already in use')
    ).toBe(54321);
  });

  it('ignores unrelated failures', () => {
    expect(detectBindFailurePort('Supabase start failed: image pull timed out')).toBeNull();
    expect(detectBindFailurePort('')).toBeNull();
  });
});

describe('describePortHolder', () => {
  it('keeps the header and only sockets whose local port matches', () => {
    const kept = keepSocketLinesForPort(SS, 54322);
    expect(kept).toContain('skopeo');
    expect(kept).not.toContain('curl');
    expect(kept.split('\n')).toHaveLength(2);
  });

  it('names the holder', () => {
    const calls: string[][] = [];
    const message = describePortHolder(54322, args => {
      calls.push(args);
      return SS;
    });
    expect(calls).toEqual([['-tanp']]);
    expect(message).toContain('Sockets on port 54322');
    expect(message).toContain('skopeo');
  });

  it('says so when nothing holds the port now', () => {
    expect(describePortHolder(54329, () => SS)).toContain('No socket on port 54329');
  });

  it('never throws when ss is unavailable', () => {
    expect(
      describePortHolder(54322, () => {
        throw new Error('ENOENT');
      })
    ).toContain('Could not inspect');
  });
});
