import { describe, expect, it } from 'vitest';
import {
  emptyDiagnosticsLog,
  formatDiagnostics,
  redactDiagnostics,
  stripUrlQuery,
} from '../e2e/shared/browserDiagnostics';

const JWT =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';

describe('stripUrlQuery', () => {
  it('drops the query string and fragment', () => {
    expect(stripUrlQuery('https://a.test/x/y.js?v=1&token=abc#frag')).toBe('https://a.test/x/y.js');
  });
  it('survives a non-URL', () => {
    expect(stripUrlQuery('not a url?x=1')).toBe('not a url');
  });
});

describe('redactDiagnostics', () => {
  it('redacts JWTs, bearer tokens and key=value credentials', () => {
    const out = redactDiagnostics(
      `jwt ${JWT} Bearer abc.def-ghi access_token=zzz apikey: "k123" password=hunter2`,
      []
    );
    expect(out).not.toContain('eyJ');
    expect(out).not.toContain('abc.def-ghi');
    expect(out).not.toContain('zzz');
    expect(out).not.toContain('k123');
    expect(out).not.toContain('hunter2');
  });

  it('strips query strings from URLs embedded in text', () => {
    const out = redactDiagnostics(
      'GET https://x.supabase.co/rest/v1/t?select=a&apikey=SECRETKEY ok',
      []
    );
    expect(out).toContain('https://x.supabase.co/rest/v1/t ok');
    expect(out).not.toContain('SECRETKEY');
  });

  it('redacts long opaque tokens but keeps UUIDs and plain text', () => {
    const opaque = 'a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8s9T0uV';
    const uuid = 'dededede-0000-0000-0000-000000000052';
    const out = redactDiagnostics(`${opaque} entry ${uuid} Failed to load component`, []);
    expect(out).not.toContain(opaque);
    expect(out).toContain(uuid);
    expect(out).toContain('Failed to load component');
  });

  it('scrubs literal secrets passed in', () => {
    expect(redactDiagnostics('typed MySecretPw1 here', ['MySecretPw1'])).not.toContain(
      'MySecretPw1'
    );
  });

  it('keeps emails', () => {
    expect(redactDiagnostics('e2e-secretary@myk9t.com', [])).toContain('e2e-secretary@myk9t.com');
  });
});

describe('formatDiagnostics', () => {
  it('redacts the assembled report, including page text and the URL query', () => {
    const log = emptyDiagnosticsLog();
    log.console.push(`+1ms [error] boom token=${JWT}`);
    const out = formatDiagnostics(
      log,
      {
        url: 'http://localhost:4173/at-show/1?access_token=leak',
        regions: ['This record was changed elsewhere'],
        main: 'Failed to load component',
      },
      []
    );
    expect(out).toContain('## Page URL\nhttp://localhost:4173/at-show/1\n');
    expect(out).toContain('This record was changed elsewhere');
    expect(out).toContain('Failed to load component');
    expect(out).not.toContain('leak');
    expect(out).not.toContain('eyJ');
  });

  it('reports an unavailable snapshot without throwing', () => {
    expect(formatDiagnostics(emptyDiagnosticsLog(), { error: 'closed' }, [])).toContain(
      '(unavailable: closed)'
    );
  });
});
