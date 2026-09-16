import { describe, expect, it } from 'vitest';

import { redactSecretLikeString, redactSecretLikeValue } from './redaction';

describe('redactSecretLikeString', () => {
  it('redacts JWT and Bearer token strings', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.abcDEF123456';

    const out = redactSecretLikeString(`Authorization: Bearer ${jwt}`);

    expect(out).not.toContain(jwt);
    expect(out).toBe('Authorization: Bearer [redacted]');
  });

  it('redacts secret-looking query and key-value parameters', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.signature_123';

    const out = redactSecretLikeString(
      `https://app.example/auth#id_token=${jwt}&token=plain client_secret=cs_test_secret`
    );

    expect(out).not.toContain(jwt);
    expect(out).not.toContain('plain');
    expect(out).not.toContain('cs_test_secret');
    expect(out).toContain('#id_token=[redacted]');
    expect(out).toContain('&token=[redacted]');
    expect(out).toContain('client_secret=[redacted]');
  });

  it('redacts Stripe, webhook, Supabase secret keys, and checkout URLs', () => {
    const out = redactSecretLikeString(
      [
        'sk_live_abcdefgh12345678',
        'whsec_abcdefgh12345678',
        'sb_secret_abcdefgh12345678',
        'https://checkout.stripe.com/c/pay/cs_test_a1b2c3#fidSecret',
      ].join(' ')
    );

    expect(out).toBe('[redacted-secret] [redacted-secret] [redacted-secret] [redacted-url]');
  });

  it('leaves ordinary strings untouched', () => {
    expect(redactSecretLikeString('open support ticket')).toBe('open support ticket');
  });

  // MYK9-550: KEY_VALUE_SECRET_RE ran before BEARER_RE and its value class ([^&#\s]+)
  // stopped at whitespace, so `token=Bearer <token>` matched only `token=Bearer`,
  // deleting the literal "Bearer" that BEARER_RE needed as its anchor -- leaving the
  // token itself un-redacted downstream.
  it('redacts the full value when a key=value pair carries a Bearer-scheme token (MYK9-550)', () => {
    expect(redactSecretLikeString('token=Bearer opaque-token-value-1234')).toBe('token=[redacted]');
  });

  it('redacts a Bearer-scheme value on the authorization key= param (MYK9-550)', () => {
    expect(redactSecretLikeString('authorization=Bearer sb_publishable_abc123defghijklmnop')).toBe(
      'authorization=[redacted]'
    );
  });

  it('redacts a Bearer-scheme value on the apikey= param (MYK9-550)', () => {
    expect(redactSecretLikeString('apikey=Bearer rk_live_0123456789abcdef')).toBe(
      'apikey=[redacted]'
    );
  });

  it('redacts an Authorization header Bearer token with no = sign (MYK9-550, already correct)', () => {
    expect(redactSecretLikeString('Authorization: Bearer sbp_0123456789abcdef0123456789')).toBe(
      'Authorization: Bearer [redacted]'
    );
  });

  it('redacts an Authorization header Bearer JWT with no = sign (MYK9-550, already correct)', () => {
    expect(redactSecretLikeString('Authorization: Bearer eyJhbGciOi.eyJzdWIiOi.SflKxwRJSM')).toBe(
      'Authorization: Bearer [redacted]'
    );
  });

  it('redacts Stripe restricted keys rk_live_ and rk_test_ (MYK9-550)', () => {
    expect(redactSecretLikeString('rk_live_abcdefgh12345678')).toBe('[redacted-secret]');
    expect(redactSecretLikeString('rk_test_abcdefgh12345678')).toBe('[redacted-secret]');
  });

  // MYK9-550 review round 2 -> round 3 restructure: two consecutive review rounds each
  // found a leak because URL_TOKEN_PARAM_RE and KEY_VALUE_SECRET_RE's value classes had
  // drifted apart (round 1: only one consumed the "Bearer " prefix; round 2: only one
  // consumed a surrounding quote). redaction.ts now builds both regexes from one shared
  // SECRET_VALUE_SRC fragment so they cannot drift again -- this generated matrix
  // exercises that shared fragment across representative keys, every URL delimiter the
  // two regexes disagree on (`?`/`&`/`#` vs. none), and every Bearer/quote combination,
  // replacing the two hand-maintained probe lists that each only covered the one shape a
  // prior round happened to think of.
  const MATRIX_KEYS = ['token', 'authorization', 'client_secret'];
  const MATRIX_PREFIXES = ['', '?', '&', '#'];
  const MATRIX_VALUE_TEMPLATES = [
    'Bearer TOKEN',
    '"Bearer TOKEN"',
    "'Bearer TOKEN'",
    'TOKEN',
    '"TOKEN"',
  ];
  const MATRIX_TOKEN_LITERAL = 'zzMatrixSecretValue9';

  function buildMatrixInput(prefix: string, key: string, valueTemplate: string): string {
    const value = valueTemplate.replace('TOKEN', MATRIX_TOKEN_LITERAL);
    return prefix === ''
      ? `probe ${key}=${value} end`
      : `probe https://example.test/path${prefix}${key}=${value} end`;
  }

  const matrixCases = MATRIX_KEYS.flatMap(key =>
    MATRIX_PREFIXES.flatMap(prefix =>
      MATRIX_VALUE_TEMPLATES.map(valueTemplate => ({
        key,
        prefix: prefix === '' ? '(none)' : prefix,
        valueTemplate,
        input: buildMatrixInput(prefix, key, valueTemplate),
      }))
    )
  );

  it.each(matrixCases)(
    'redacts key=$key prefix=$prefix value="$valueTemplate" and stays idempotent (MYK9-550 matrix)',
    ({ input }) => {
      const once = redactSecretLikeString(input);

      expect(once).toContain('[redacted]');
      expect(once).not.toContain(MATRIX_TOKEN_LITERAL);
      expect(redactSecretLikeString(once)).toBe(once);
    }
  );

  // P3: the optional Bearer-scheme prefix must not cross a newline -- both Sentry
  // breadcrumbs and support-diagnostics blobs can carry multi-line text a human reads
  // back, and `\s` would silently eat the next line's first word. Pinned as accepted
  // behavior (the line break itself is preserved), not compared against main since this
  // shape did not exist before MYK9-550.
  it('does not swallow the next line when a Bearer-scheme value is followed by a newline (MYK9-550, accepted trade-off)', () => {
    expect(redactSecretLikeString('token=Bearer\nopaque')).toBe('token=[redacted]\nopaque');
    expect(redactSecretLikeString('token=Bearer\nNextLine matters')).toBe(
      'token=[redacted]\nNextLine matters'
    );
  });

  // P3: a quoted Bearer-scheme value (`key="Bearer <token>"`) pre-dates this change but
  // is fixed by the shared fragment without touching any existing output.
  it('redacts a quoted Bearer-scheme value (MYK9-550)', () => {
    expect(redactSecretLikeString('authorization="Bearer abc123def456"')).toBe(
      'authorization=[redacted]'
    );
  });

  // Round 2 finding: URL_TOKEN_PARAM_RE (leading ?/&/#) previously lacked the quote
  // handling KEY_VALUE_SECRET_RE had, so a quoted Bearer value in a URL still leaked.
  // Covered generically by the matrix above; pinned once here with the review's exact
  // reproduction string.
  it('redacts a quoted Bearer-scheme value in a URL query param (MYK9-550 round 2)', () => {
    expect(
      redactSecretLikeString('GET https://api.x/v1?token="Bearer opaque-token-value-1234"')
    ).toBe('GET https://api.x/v1?token=[redacted]');
  });

  // Non-regression: a key literally named "secret" whose free-text value happens to start
  // with the word "Bearer" (not a scheme prefix) keeps redacting only up to the next
  // whitespace -- this is pre-existing, accepted behavior, not the MYK9-550 leak.
  it('only redacts up to the next whitespace for a non-token free-text value starting with "Bearer" (accepted)', () => {
    expect(redactSecretLikeString('secret=Bearer of bad news')).toBe('secret=[redacted] bad news');
  });

  // Idempotency for the pinned exact-string probes above (the matrix covers idempotency
  // for the generated shapes; these named/header shapes are distinct enough to check too).
  const pinnedIdempotencyProbes = [
    'token=Bearer opaque-token-value-1234',
    'authorization=Bearer sb_publishable_abc123defghijklmnop',
    'apikey=Bearer rk_live_0123456789abcdef',
    'Authorization: Bearer sbp_0123456789abcdef0123456789',
    'Authorization: Bearer eyJhbGciOi.eyJzdWIiOi.SflKxwRJSM',
    'token=Bearer\nNextLine matters',
    'authorization="Bearer abc123def456"',
    'GET https://api.x/v1?token="Bearer opaque-token-value-1234"',
    'secret=Bearer of bad news',
  ];

  it.each(pinnedIdempotencyProbes)('is idempotent for %s (MYK9-550)', input => {
    const once = redactSecretLikeString(input);
    const twice = redactSecretLikeString(once);
    expect(twice).toBe(once);
  });
});

describe('redactSecretLikeValue', () => {
  it('scrubs strings but passes through primitive diagnostic values', () => {
    expect(redactSecretLikeValue('sk_test_abcdefgh12345678')).toBe('[redacted-secret]');
    expect(redactSecretLikeValue(42)).toBe(42);
    expect(redactSecretLikeValue(false)).toBe(false);
    expect(redactSecretLikeValue(null)).toBeNull();
  });
});
