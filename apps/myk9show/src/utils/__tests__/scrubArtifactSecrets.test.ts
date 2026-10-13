import { describe, expect, it } from 'vitest';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { ARTIFACT_ROOTS, collectSecrets, scrubSecrets, scrubZip } from '../scrubArtifactSecrets';

describe('scrubArtifactSecrets', () => {
  it('replaces every occurrence of a secret', () => {
    const snapshot = 'textbox "Password": hunter2superlong\n- and again hunter2superlong';
    expect(scrubSecrets(snapshot, ['hunter2superlong'])).toBe(
      'textbox "Password": ***REDACTED***\n- and again ***REDACTED***'
    );
  });

  it('also scrubs the JSON-escaped spelling of a secret with quotes or backslashes', () => {
    const secret = 'pa"ss\\word-Fake1';
    const json = JSON.stringify({ title: `Fill "${secret}"` });
    expect(json).not.toContain(secret);
    expect(scrubSecrets(json, [secret])).not.toContain('ss\\\\word');
    expect(scrubSecrets(json, [secret])).toContain('REDACTED');
  });

  it('leaves text alone when there are no secrets', () => {
    expect(scrubSecrets('nothing to see', [])).toBe('nothing to see');
  });

  it('collects only the env vars that are set', () => {
    const secrets = collectSecrets({
      E2E_SECRETARY_PASSWORD: 'a-real-password',
      E2E_JUDGE_PASSWORD: '',
    } as NodeJS.ProcessEnv);
    expect(secrets).toEqual(['a-real-password']);
  });

  it('matches by NAME PATTERN, so a new secret cannot be forgotten', () => {
    // The hand-kept list this replaced missed E2E_LOAD_SECRETARY_{1,2,3}_PASSWORD,
    // which load-rehearsal.yml passes -- the same stale-allowlist failure mode this
    // repo hits with test-runner include lists.
    const secrets = collectSecrets({
      E2E_LOAD_SECRETARY_1_PASSWORD: 'load-one-password',
      E2E_LOAD_SECRETARY_2_PASSWORD: 'load-two-password',
      SUPABASE_DB_PASSWORD: 'db-password-value',
      SOME_SERVICE_TOKEN: 'token-value-long',
      STRIPE_SECRET: 'stripe-secret-val',
    } as NodeJS.ProcessEnv);

    expect(secrets).toContain('load-one-password');
    expect(secrets).toContain('load-two-password');
    expect(secrets).toContain('db-password-value');
    expect(secrets).toContain('token-value-long');
    expect(secrets).toContain('stripe-secret-val');
  });

  it('ignores env vars that are not secrets', () => {
    const secrets = collectSecrets({
      E2E_SECRETARY_EMAIL: 'secretary@myk9t.com',
      NODE_ENV: 'production',
      PATH: '/usr/bin:/bin',
    } as NodeJS.ProcessEnv);
    expect(secrets).toEqual([]);
  });

  it('skips values too short to replace safely', () => {
    // A 3-character password would otherwise blank out unrelated substrings.
    expect(collectSecrets({ E2E_ADMIN_PASSWORD: 'abc' } as NodeJS.ProcessEnv)).toEqual([]);
  });

  it('de-duplicates a password shared by several accounts', () => {
    const secrets = collectSecrets({
      E2E_ADMIN_PASSWORD: 'shared-password',
      E2E_SECRETARY_PASSWORD: 'shared-password',
    } as NodeJS.ProcessEnv);
    expect(secrets).toEqual(['shared-password']);
  });
});

describe('ARTIFACT_ROOTS', () => {
  it('covers the report directory CI uploads, not just test-results', () => {
    // ci.yml uploads apps/myk9show/playwright-report-ci/ for BOTH the e2e job and
    // the a11y job. Scrubbing only test-results/ left those artifacts untouched.
    expect(ARTIFACT_ROOTS).toContain('test-results');
    expect(ARTIFACT_ROOTS).toContain('playwright-report-ci');
    expect(ARTIFACT_ROOTS).toContain('playwright-report');
  });
});

describe('scrub order (Codex review on PR #2945)', () => {
  it('a password ending in a backslash leaves the report JSON parseable and secret-free', () => {
    // Its verbatim spelling is a prefix of its JSON-escaped spelling, so replacing the
    // verbatim form first left a lone backslash that broke the JSON.
    const secret = 'FakePass-91\\';
    const entry = JSON.stringify({ steps: [{ title: `Fill "${secret}"` }] });
    const zip = zipSync({ 'abc.json': strToU8(entry) });

    const out = strFromU8(unzipSync(scrubZip(zip, [secret]))['abc.json']!);

    expect(() => JSON.parse(out)).not.toThrow();
    expect(out).not.toContain('FakePass-91');
    expect(out).toContain('REDACTED');
  });

  it('a secret that is a prefix of another is not left as a partial match', () => {
    const out = scrubSecrets('token FakeLongSecret-12 end', [
      'FakeLongSecret-1',
      'FakeLongSecret-12',
    ]);
    expect(out).toBe('token ***REDACTED*** end');
  });
});
