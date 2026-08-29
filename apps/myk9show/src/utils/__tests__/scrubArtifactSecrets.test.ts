import { describe, expect, it } from 'vitest';
import { collectSecrets, scrubSecrets } from '../scrubArtifactSecrets';

describe('scrubArtifactSecrets', () => {
  it('replaces every occurrence of a secret', () => {
    const snapshot = 'textbox "Password": hunter2superlong\n- and again hunter2superlong';
    expect(scrubSecrets(snapshot, ['hunter2superlong'])).toBe(
      'textbox "Password": ***REDACTED***\n- and again ***REDACTED***'
    );
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
