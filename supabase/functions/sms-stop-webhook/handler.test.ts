// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import {
  buildStartUpdate,
  buildStopUpdate,
  classifyKeyword,
  handleInboundSms,
  hasIntactConsent,
  type SmsConsentStateRow,
  type StartUpdate,
  type StopUpdate,
} from './handler.ts';

const NOW = new Date('2026-08-22T18:00:00.000Z');
const AT = NOW.toISOString();

function consentRow(overrides: Partial<SmsConsentStateRow> = {}): SmsConsentStateRow {
  return {
    id: 'row-1',
    upcoming_runs: true,
    sms_opt_out_at: null,
    sms_opt_in_at: '2026-08-01T00:00:00.000Z',
    sms_consent_text_version: 'v1',
    sms_opt_in_source: 'account-settings',
    sms_consent_write_token: '11111111-1111-1111-1111-111111111111',
    sms_stop_muted_push_at: null,
    ...overrides,
  };
}

function ports(rows: SmsConsentStateRow[]) {
  const applyUpdate = vi.fn<(ids: string[], update: StopUpdate | StartUpdate) => Promise<void>>(
    () => Promise.resolve()
  );
  return {
    applyUpdate,
    findByPhone: vi.fn(() => Promise.resolve(rows)),
    now: () => NOW,
  };
}

describe('classifyKeyword', () => {
  it.each(['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT'])(
    'treats %s as a stop keyword',
    keyword => {
      expect(classifyKeyword(keyword)).toBe('stop');
    }
  );

  it.each(['START', 'YES', 'UNSTOP'])('treats %s as a start keyword', keyword => {
    expect(classifyKeyword(keyword)).toBe('start');
  });

  it('is case-insensitive and tolerant of surrounding whitespace and punctuation', () => {
    for (const body of ['stop', '  Stop  ', '\nSTOP.\t', 'stop!', 'Stop, please']) {
      expect(classifyKeyword(body)).toBe('stop');
    }
  });

  it('does not treat a word merely containing a keyword as that keyword', () => {
    // "stopping by the ring" must not silence someone.
    expect(classifyKeyword('stopping by the ring')).toBe('unknown');
    expect(classifyKeyword('restart')).toBe('unknown');
  });

  it('classifies an empty or missing body as unknown rather than a keyword', () => {
    expect(classifyKeyword('')).toBe('unknown');
    expect(classifyKeyword('   ')).toBe('unknown');
    expect(classifyKeyword(undefined)).toBe('unknown');
  });

  it('treats HELP as its own keyword so nothing changes consent state', () => {
    expect(classifyKeyword('HELP')).toBe('help');
  });
});

describe('hasIntactConsent', () => {
  it('requires every consent field, because a partial record is not consent', () => {
    expect(hasIntactConsent(consentRow())).toBe(true);
    for (const missing of [
      'sms_opt_in_at',
      'sms_consent_text_version',
      'sms_opt_in_source',
      'sms_consent_write_token',
    ] as const) {
      expect(hasIntactConsent(consentRow({ [missing]: null }))).toBe(false);
    }
  });
});

describe('buildStopUpdate', () => {
  it('disables sms alongside the timestamp, which the CHECK constraint requires', () => {
    // notification_preferences_sms_sendable_complete forbids sms_enabled = true
    // with a non-null sms_opt_out_at, so a timestamp-only write would fail the
    // whole update rather than record the opt-out.
    expect(buildStopUpdate(false, NOW)).toEqual({ sms_opt_out_at: AT, sms_enabled: false });
  });

  it('mutes push too and records itself as the actor (decision B)', () => {
    expect(buildStopUpdate(true, NOW)).toEqual({
      sms_opt_out_at: AT,
      sms_enabled: false,
      upcoming_runs: false,
      sms_stop_muted_push_at: AT,
    });
  });

  it('never deletes: the update carries no row removal and keeps consent history', () => {
    const update = buildStopUpdate(true, NOW);
    expect(update).not.toHaveProperty('sms_opt_in_at');
    expect(update).not.toHaveProperty('sms_phone_e164');
    expect(update).not.toHaveProperty('sms_consent_write_token');
  });
});

describe('buildStartUpdate', () => {
  it('restores push only when STOP was the one that muted it', () => {
    expect(buildStartUpdate(true)).toEqual({
      sms_opt_out_at: null,
      sms_enabled: true,
      upcoming_runs: true,
      sms_stop_muted_push_at: null,
    });
  });

  it('leaves a user-chosen push mute alone', () => {
    expect(buildStartUpdate(false)).toEqual({ sms_opt_out_at: null, sms_enabled: true });
    expect(buildStartUpdate(false)).not.toHaveProperty('upcoming_runs');
  });
});

describe('handleInboundSms', () => {
  it('records a STOP against every row holding that number', async () => {
    // Two accounts can consent with the same handset; a STOP from it must
    // silence both, because the number is what the carrier blocks.
    const rows = [consentRow({ id: 'a' }), consentRow({ id: 'b' })];
    const p = ports(rows);
    const result = await handleInboundSms({ from: '+12105550142', body: 'STOP' }, p);

    expect(result).toEqual({ keyword: 'stop', updated: 2 });
    expect(p.applyUpdate).toHaveBeenCalledTimes(1);
    expect(p.applyUpdate).toHaveBeenCalledWith(['a', 'b'], {
      sms_opt_out_at: AT,
      sms_enabled: false,
      upcoming_runs: false,
      sms_stop_muted_push_at: AT,
    });
  });

  it('does not claim to have muted push that the exhibitor had already muted', async () => {
    // The wrinkle decision B creates: if we recorded ourselves here, a later
    // START would switch ring alerts on for someone who turned them off.
    const p = ports([consentRow({ upcoming_runs: false })]);
    await handleInboundSms({ from: '+12105550142', body: 'STOP' }, p);

    expect(p.applyUpdate).toHaveBeenCalledWith(['row-1'], {
      sms_opt_out_at: AT,
      sms_enabled: false,
    });
  });

  it('splits the write when rows disagree about who muted push', async () => {
    const p = ports([
      consentRow({ id: 'push-on', upcoming_runs: true }),
      consentRow({ id: 'push-off', upcoming_runs: false }),
    ]);
    await handleInboundSms({ from: '+12105550142', body: 'STOP' }, p);

    expect(p.applyUpdate).toHaveBeenCalledTimes(2);
    expect(p.applyUpdate).toHaveBeenCalledWith(
      ['push-on'],
      expect.objectContaining({
        upcoming_runs: false,
        sms_stop_muted_push_at: AT,
      })
    );
    expect(p.applyUpdate).toHaveBeenCalledWith(['push-off'], {
      sms_opt_out_at: AT,
      sms_enabled: false,
    });
  });

  it('revives an intact consent record on START', async () => {
    const p = ports([
      consentRow({ sms_opt_out_at: AT, sms_stop_muted_push_at: AT, upcoming_runs: false }),
    ]);
    const result = await handleInboundSms({ from: '+12105550142', body: 'start' }, p);

    expect(result).toEqual({ keyword: 'start', updated: 1 });
    expect(p.applyUpdate).toHaveBeenCalledWith(['row-1'], {
      sms_opt_out_at: null,
      sms_enabled: true,
      upcoming_runs: true,
      sms_stop_muted_push_at: null,
    });
  });

  it('restores only SMS when the push mute was the user’s own choice', async () => {
    const p = ports([
      consentRow({ sms_opt_out_at: AT, sms_stop_muted_push_at: null, upcoming_runs: false }),
    ]);
    await handleInboundSms({ from: '+12105550142', body: 'START' }, p);

    expect(p.applyUpdate).toHaveBeenCalledWith(['row-1'], {
      sms_opt_out_at: null,
      sms_enabled: true,
    });
  });

  it('makes a START from an unknown number a no-op, never an insert', async () => {
    // Receiving a text is not consent to send one.
    const p = ports([]);
    const result = await handleInboundSms({ from: '+12105559999', body: 'START' }, p);

    expect(result).toEqual({ keyword: 'start', updated: 0 });
    expect(p.applyUpdate).not.toHaveBeenCalled();
  });

  it('refuses to revive a consent record that is no longer intact', async () => {
    const p = ports([consentRow({ sms_opt_out_at: AT, sms_consent_write_token: null })]);
    const result = await handleInboundSms({ from: '+12105550142', body: 'START' }, p);

    expect(result).toEqual({ keyword: 'start', updated: 0 });
    expect(p.applyUpdate).not.toHaveBeenCalled();
  });

  it('writes nothing for HELP, leaving Twilio’s auto-reply to answer', async () => {
    const p = ports([consentRow()]);
    const result = await handleInboundSms({ from: '+12105550142', body: 'HELP' }, p);

    expect(result).toEqual({ keyword: 'help', updated: 0 });
    expect(p.findByPhone).not.toHaveBeenCalled();
    expect(p.applyUpdate).not.toHaveBeenCalled();
  });

  it('writes nothing for an ordinary reply', async () => {
    const p = ports([consentRow()]);
    const result = await handleInboundSms(
      { from: '+12105550142', body: 'thanks, see you at the ring' },
      p
    );

    expect(result).toEqual({ keyword: 'unknown', updated: 0 });
    expect(p.applyUpdate).not.toHaveBeenCalled();
  });

  it('writes nothing when the sender number is missing', async () => {
    const p = ports([consentRow()]);
    const result = await handleInboundSms({ from: '   ', body: 'STOP' }, p);

    expect(result).toEqual({ keyword: 'stop', updated: 0 });
    expect(p.findByPhone).not.toHaveBeenCalled();
  });
});
