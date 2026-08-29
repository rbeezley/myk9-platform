/**
 * The passcode payload here is not a convenience — it is the whole point.
 *
 * `saveShowAtomicOnline` throws `OfficialsNotAssignedError` AFTER
 * `insert_show_passcodes` has run, and that RPC returns the four plaintext
 * access codes exactly once (only HMAC hashes are stored). The first version of
 * this error carried no payload, so the caller navigated straight to the show
 * and skipped `WizardSuccessOverlay` — the only surface that ever displays them.
 * A single failed role grant silently cost the show its access codes.
 */
import { describe, it, expect } from 'vitest';
import {
  OfficialsNotAssignedError,
  isOfficialsNotAssignedError,
  officialsNotAssignedMessage,
} from '../showSaveErrors';

describe('OfficialsNotAssignedError', () => {
  it('names the show that already exists, so the caller can keep it', () => {
    const error = new OfficialsNotAssignedError('show-1', 2);

    expect(error.showId).toBe('show-1');
    expect(error.failedCount).toBe(2);
    expect(isOfficialsNotAssignedError(error)).toBe(true);
  });

  it('is distinguishable from an ordinary failure', () => {
    expect(isOfficialsNotAssignedError(new Error('network'))).toBe(false);
    expect(isOfficialsNotAssignedError(null)).toBe(false);
  });

  it('carries the one-shot passcodes when the throw happens after they were minted', () => {
    const passcodes = { admin: 'a1', judge: 'j2', steward: 's3', exhibitor: 'e4' };
    const error = new OfficialsNotAssignedError('show-1', 1, {
      showName: 'Spring Classic',
      passcodes: passcodes as never,
      passcodeError: null,
    });

    expect(error.partial?.passcodes).toBe(passcodes);
    expect(error.partial?.showName).toBe('Spring Classic');
  });

  it('leaves `partial` undefined when nothing unrecoverable was produced', () => {
    // The offline/legacy path never mints passcodes, so the caller falls back
    // to navigation rather than opening an overlay with nothing to show.
    expect(new OfficialsNotAssignedError('show-1', 1).partial).toBeUndefined();
  });

  it('tells the secretary NOT to create the show again', () => {
    // The message is the only thing standing between a partial success and a
    // duplicate show, since retrying mints a fresh UUID.
    expect(officialsNotAssignedMessage(1)).toMatch(/don.t create the show again/i);
    expect(officialsNotAssignedMessage(2)).toMatch(/2 official assignments/i);
  });
});
