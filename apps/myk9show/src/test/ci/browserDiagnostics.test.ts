import { describe, expect, it } from 'vitest';
import {
  emptyDiagnosticsLog,
  formatDiagnostics,
  redactDiagnostics,
  redactThenClip,
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

describe('a secret at a clipping boundary (Codex review, PR #2938)', () => {
  const SECRET = 'SyntheticPasswordForReview1';

  it('redactThenClip removes the whole secret before cutting, so no prefix survives', () => {
    const out = redactThenClip(`${'x'.repeat(1_990)}${SECRET}`, 2_000, [SECRET]);
    expect(out).not.toContain('Synthe');
  });

  it('page text that straddles the main-region limit leaks no prefix of a secret', () => {
    const out = formatDiagnostics(
      emptyDiagnosticsLog(),
      {
        url: 'https://a.test/x',
        regions: [`${'y'.repeat(1_990)}${SECRET}`],
        main: `${'x'.repeat(3_990)}${SECRET}`,
      },
      [SECRET]
    );
    expect(out).not.toContain('Synthe');
  });
});

describe('error boundary section (MYK9-1114)', () => {
  it('reports the boundary error text, redacted', () => {
    const out = formatDiagnostics(
      emptyDiagnosticsLog(),
      {
        url: 'https://a.test/x',
        regions: [],
        main: 'Failed to load component',
        boundaryErrors: ['ResultsTab: TypeError: Failed to fetch dynamically imported module'],
      },
      []
    );
    expect(out).toContain('## Error boundary (1)');
    expect(out).toContain('Failed to fetch dynamically imported module');
  });
});

describe('service worker section (MYK9-1114)', () => {
  it('reports the worker’s own failed fetches, redacted', () => {
    const log = emptyDiagnosticsLog();
    log.serviceWorkerFailures.push(
      '+10ms GET http://localhost:4173/assets/scripts/useBulkSelection-8LPukdrJ.js -> net::ERR_FAILED secret-value-123'
    );
    const out = formatDiagnostics(log, { error: 'closed' }, ['secret-value-123']);
    expect(out).toContain('## Service worker fetches failed or >= 400 (1)');
    expect(out).toContain('useBulkSelection-8LPukdrJ.js -> net::ERR_FAILED');
    expect(out).not.toContain('secret-value-123');
  });
});
