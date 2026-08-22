// @vitest-environment node
//
// The app suite runs jsdom globally, which is a lie for Deno edge-function
// code: jsdom installs its own ArrayBuffer realm and provides no crypto.subtle,
// so anything touching WebCrypto fails with a cross-realm error that depends on
// the Node build. Node environment here, as for every edge-function test.

import { describe, expect, it, vi } from 'vitest';

import { buildProximitySms, estimateSegments } from '../_shared/sms/smsMessage';
import type { ProximityRecipient } from './runProximity';
import { shouldAlertOnTransition } from './runProximity';
import {
  decideChannels,
  dispatchProximityAlerts,
  DEFAULT_LEAD_DOGS,
  PROXIMITY_PREFERENCE_COLUMNS,
  type ChannelDecision,
  type ProximityAlertContext,
  type ProximityDispatchPorts,
  type ProximityPreferenceRow,
} from './proximitySms';

function pref(overrides: Partial<ProximityPreferenceRow> = {}): ProximityPreferenceRow {
  return {
    auth_user_id: 'user-1',
    push_enabled: true,
    upcoming_runs: true,
    lead_dogs: 3,
    sms_enabled: false,
    sms_phone_e164: null,
    sms_opt_out_at: null,
    ...overrides,
  };
}

function consented(overrides: Partial<ProximityPreferenceRow> = {}): ProximityPreferenceRow {
  return pref({ sms_enabled: true, sms_phone_e164: '+12105550142', ...overrides });
}

function recipient(overrides: Partial<ProximityRecipient> = {}): ProximityRecipient {
  return { authUserId: 'user-1', entryId: 'entry-1', dogsAhead: 2, ...overrides };
}

const CONTEXT: ProximityAlertContext = {
  dogName: 'Rally',
  className: 'Novice A Scent Work',
  armband: 42,
};

interface Harness {
  ports: ProximityDispatchPorts;
  pushes: Array<{ recipient: ProximityRecipient; context: ProximityAlertContext }>;
  texts: Array<{ to: string; body: string }>;
  claims: Array<[string, string]>;
  releases: Array<[string, string]>;
}

function harness(
  overrides: Partial<{
    claimSms: ProximityDispatchPorts['claimSms'];
    sendSms: ProximityDispatchPorts['sendSms'];
    sendPush: ProximityDispatchPorts['sendPush'];
    releaseSms: ProximityDispatchPorts['releaseSms'];
  }> = {}
): Harness {
  const pushes: Harness['pushes'] = [];
  const texts: Harness['texts'] = [];
  const claims: Harness['claims'] = [];
  const releases: Harness['releases'] = [];
  // One marker store shared across every call, exactly like the table.
  const claimed = new Set<string>();

  return {
    pushes,
    texts,
    claims,
    releases,
    ports: {
      sendPush:
        overrides.sendPush ??
        (async (r, context) => {
          pushes.push({ recipient: r, context });
        }),
      claimSms:
        overrides.claimSms ??
        (async (authUserId, entryId) => {
          claims.push([authUserId, entryId]);
          const key = `${authUserId}:${entryId}`;
          if (claimed.has(key)) return false;
          claimed.add(key);
          return true;
        }),
      sendSms:
        overrides.sendSms ??
        (async input => {
          texts.push(input);
        }),
      releaseSms:
        overrides.releaseSms ??
        (async (authUserId, entryId) => {
          releases.push([authUserId, entryId]);
          claimed.delete(`${authUserId}:${entryId}`);
        }),
    },
  };
}

function dispatchWith(
  recipients: readonly ProximityRecipient[],
  channels: ChannelDecision | ((authUserId: string) => ChannelDecision),
  ports: ProximityDispatchPorts,
  options: { smsAvailable?: boolean; context?: ProximityAlertContext } = {}
) {
  return dispatchProximityAlerts(recipients, {
    smsAvailable: options.smsAvailable ?? true,
    channelFor: typeof channels === 'function' ? channels : () => channels,
    contextFor: () => options.context ?? CONTEXT,
    ports,
  });
}

describe('decideChannels', () => {
  it('sends push and no SMS when there is no preferences row', () => {
    // AC 2: absent row = table defaults for push, but NO consent record, and a
    // missing consent record is a hard no for SMS.
    expect(decideChannels(undefined)).toEqual({
      push: true,
      sms: false,
      smsPhone: null,
      leadDogs: DEFAULT_LEAD_DOGS,
    });
  });

  it('still sends SMS when push_enabled is false', () => {
    // AC 1: the regression the old early-`continue` would have caused.
    const decision = decideChannels(consented({ push_enabled: false }));
    expect(decision.push).toBe(false);
    expect(decision.sms).toBe(true);
    expect(decision.smsPhone).toBe('+12105550142');
  });

  it('suppresses SMS once sms_opt_out_at is set, whatever sms_enabled says', () => {
    // AC 3.
    const decision = decideChannels(
      consented({ sms_opt_out_at: '2026-08-22T10:00:00Z', sms_enabled: true })
    );
    expect(decision.sms).toBe(false);
    expect(decision.smsPhone).toBeNull();
    expect(decision.push).toBe(true);
  });

  it('mutes both channels when upcoming_runs is false', () => {
    // AC 4 — also the shape an inbound STOP leaves behind (MYK9-192).
    const decision = decideChannels(consented({ upcoming_runs: false }));
    expect(decision.push).toBe(false);
    expect(decision.sms).toBe(false);
  });

  it('refuses SMS when sms_enabled is true but no number is recorded', () => {
    expect(decideChannels(consented({ sms_phone_e164: null })).sms).toBe(false);
    expect(decideChannels(consented({ sms_phone_e164: '   ' })).sms).toBe(false);
  });

  it('refuses SMS when the row exists but sms_enabled is not true', () => {
    expect(decideChannels(pref({ sms_phone_e164: '+12105550142' })).sms).toBe(false);
    expect(decideChannels(pref({ sms_enabled: null, sms_phone_e164: '+12105550142' })).sms).toBe(
      false
    );
  });

  it('carries the user lead_dogs through and falls back to the default', () => {
    expect(decideChannels(pref({ lead_dogs: 10 })).leadDogs).toBe(10);
    expect(decideChannels(pref({ lead_dogs: null })).leadDogs).toBe(DEFAULT_LEAD_DOGS);
  });

  it('selects the consent columns the decision actually reads', () => {
    // Trap 3 on the issue: the query used to omit these, so the decision above
    // would have run against undefined forever.
    for (const column of ['sms_enabled', 'sms_phone_e164', 'sms_opt_out_at']) {
      expect(PROXIMITY_PREFERENCE_COLUMNS).toContain(column);
    }
  });
});

describe('shouldAlertOnTransition', () => {
  it('alerts only on the transition into the ring', () => {
    expect(
      shouldAlertOnTransition({ check_in_status: 'in-ring' }, { check_in_status: 'checked-in' })
    ).toBe(true);
    // A re-save of an already-in-ring entry: the guard that keeps one alert per
    // exhibitor per class, and with SMS attached a spend guard.
    expect(
      shouldAlertOnTransition({ check_in_status: 'in-ring' }, { check_in_status: 'in-ring' })
    ).toBe(false);
    expect(
      shouldAlertOnTransition({ check_in_status: 'checked-in' }, { check_in_status: 'in-ring' })
    ).toBe(false);
    expect(shouldAlertOnTransition({ check_in_status: null }, { check_in_status: null })).toBe(
      false
    );
  });
});

describe('dispatchProximityAlerts', () => {
  const bothChannels: ChannelDecision = {
    push: true,
    sms: true,
    smsPhone: '+12105550142',
    leadDogs: 3,
  };

  it('fires both channels for an exhibitor opted into both', async () => {
    const h = harness();
    const result = await dispatchWith([recipient()], bothChannels, h.ports);

    expect(h.pushes).toHaveLength(1);
    expect(h.texts).toHaveLength(1);
    expect(result).toMatchObject({ pushSent: 1, smsSent: 1 });
  });

  it('sends the SMS to a push-disabled recipient', async () => {
    // AC 1, end to end.
    const h = harness();
    await dispatchWith(
      [recipient()],
      { push: false, sms: true, smsPhone: '+12105550142', leadDogs: 3 },
      h.ports
    );

    expect(h.pushes).toHaveLength(0);
    expect(h.texts).toEqual([{ to: '+12105550142', body: expect.any(String) }]);
  });

  it('sends nothing when both channels are off', async () => {
    const h = harness();
    await dispatchWith(
      [recipient()],
      { push: false, sms: false, smsPhone: null, leadDogs: 3 },
      h.ports
    );

    expect(h.pushes).toHaveLength(0);
    expect(h.texts).toHaveLength(0);
    expect(h.claims).toHaveLength(0);
  });

  it('composes the body through buildProximitySms exactly', async () => {
    // AC 7 — the campaign filing's samples were copied from this function, so
    // the wire text has to be its output byte for byte.
    const h = harness();
    await dispatchWith([recipient({ dogsAhead: 2 })], bothChannels, h.ports);

    expect(h.texts[0].body).toBe(
      buildProximitySms({
        dogName: CONTEXT.dogName,
        className: CONTEXT.className,
        dogsAhead: 2,
        armband: CONTEXT.armband,
      })
    );
  });

  it('sends exactly one GSM-7 segment', async () => {
    // AC 5.
    const h = harness();
    await dispatchWith(
      [recipient()],
      bothChannels,
      h.ports,
      { context: { dogName: 'Rally', className: 'X'.repeat(400), armband: 9999 } } // worst case
    );

    const estimate = estimateSegments(h.texts[0].body);
    expect(estimate.segments).toBe(1);
    expect(estimate.encoding).toBe('GSM-7');
  });

  it('refuses to send, and does not claim, a message over one segment', async () => {
    // AC 5's failure branch: log rather than silently double-billing. Checked
    // before the claim so a refused message does not burn the entry's one text.
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    // buildProximitySms trims the CLASS name to fit, but not the dog name, so
    // an absurd dog name is the one way to get past its own guarantee.
    const context = { dogName: 'R'.repeat(300), className: 'Novice', armband: 1 };
    const expected = estimateSegments(buildProximitySms({ ...context, dogsAhead: 2 })).segments;
    expect(expected).toBeGreaterThan(1);

    const h = harness();
    const result = await dispatchWith([recipient({ dogsAhead: 2 })], bothChannels, h.ports, {
      context,
    });

    expect(result.smsSent).toBe(0);
    expect(result.smsSkipped).toBe(1);
    expect(h.claims).toHaveLength(0);
    expect(h.texts).toHaveLength(0);
    expect(error).toHaveBeenCalledWith(
      'push-trigger-run-proximity: refusing multi-segment SMS',
      expect.stringContaining(`"segments":${expected}`)
    );
    error.mockRestore();
  });

  it('sends one SMS per entry while push sends the whole countdown', async () => {
    // AC 9. Three successive in-ring transitions, one entry, same marker store.
    const h = harness();
    for (const dogsAhead of [2, 1, 0]) {
      await dispatchWith([recipient({ dogsAhead })], bothChannels, h.ports);
    }

    expect(h.pushes.map(p => p.recipient.dogsAhead)).toEqual([2, 1, 0]);
    expect(h.texts).toHaveLength(1);
    expect(h.texts[0].body).toContain('2 dogs out');
  });

  it('sends one SMS per entry at lead_dogs = 10', async () => {
    // AC 10. Ten countdown positions, ten pushes, one text.
    const h = harness();
    for (let dogsAhead = 9; dogsAhead >= 0; dogsAhead -= 1) {
      await dispatchWith([recipient({ dogsAhead })], bothChannels, h.ports);
    }

    expect(h.pushes).toHaveLength(10);
    expect(h.texts).toHaveLength(1);
  });

  it('does not duplicate when the queue churns and revisits a position', async () => {
    // AC 11. The positional approach (send when dogsAhead === leadDogs - 1)
    // would send twice here: a pulled dog restored puts the entry back at 2.
    const h = harness();
    for (const dogsAhead of [2, 1, 2, 1, 0]) {
      await dispatchWith([recipient({ dogsAhead })], bothChannels, h.ports);
    }

    expect(h.texts).toHaveLength(1);
    expect(h.claims).toHaveLength(5);
  });

  it('sends a separate SMS for a second entry of the same dog', async () => {
    // The marker is per (account, entry), not per account: two classes on the
    // same day are two alerts.
    const h = harness();
    await dispatchWith([recipient({ entryId: 'entry-1' })], bothChannels, h.ports);
    await dispatchWith([recipient({ entryId: 'entry-2' })], bothChannels, h.ports);

    expect(h.texts).toHaveLength(2);
  });

  it('still delivers push when the SMS provider fails', async () => {
    // AC 6, first half.
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const h = harness({
      sendSms: async () => {
        throw new Error('twilio down');
      },
    });

    const result = await dispatchWith([recipient()], bothChannels, h.ports);

    expect(h.pushes).toHaveLength(1);
    expect(result).toMatchObject({ pushSent: 1, smsSent: 0, smsFailed: 1 });
    error.mockRestore();
  });

  it('still delivers SMS when push fails', async () => {
    // AC 6, second half.
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const h = harness({
      sendPush: async () => {
        throw new Error('push service down');
      },
    });

    const result = await dispatchWith([recipient()], bothChannels, h.ports);

    expect(h.texts).toHaveLength(1);
    expect(result).toMatchObject({ pushSent: 0, pushFailed: 1, smsSent: 1 });
    error.mockRestore();
  });

  it('releases the claim when the send fails so the next transition retries', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    let failNext = true;
    const h = harness({
      sendSms: async () => {
        if (failNext) {
          failNext = false;
          throw new Error('twilio timeout');
        }
      },
    });

    await dispatchWith([recipient({ dogsAhead: 2 })], bothChannels, h.ports);
    expect(h.releases).toEqual([['user-1', 'entry-1']]);

    // Second transition: the marker was released, so the retry is allowed —
    // and then the entry is marked and stays marked.
    await dispatchWith([recipient({ dogsAhead: 1 })], bothChannels, h.ports);
    await dispatchWith([recipient({ dogsAhead: 0 })], bothChannels, h.ports);
    expect(h.claims).toHaveLength(3);
    expect(h.releases).toHaveLength(1);
    error.mockRestore();
  });

  it('treats a claim error as already-sent rather than sending', async () => {
    // A database blip must not become a duplicate-send storm against the
    // campaign cap. Push is unaffected.
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const h = harness({
      claimSms: async () => {
        throw new Error('rpc unavailable');
      },
    });

    const result = await dispatchWith([recipient()], bothChannels, h.ports);

    expect(h.texts).toHaveLength(0);
    expect(result).toMatchObject({ pushSent: 1, smsFailed: 1, smsSent: 0 });
    error.mockRestore();
  });

  it('sends push only when the provider is unconfigured', async () => {
    const h = harness();
    const result = await dispatchWith([recipient()], bothChannels, h.ports, {
      smsAvailable: false,
    });

    expect(h.pushes).toHaveLength(1);
    expect(h.claims).toHaveLength(0);
    expect(result.smsSent).toBe(0);
  });

  it('does not wait for push before sending the SMS', async () => {
    // The sibling requirement, first direction: a stalled push service must not
    // hold the text back. The SMS port has to be entered while push is still
    // pending, not merely after push was entered.
    let pushSettled = false;
    let smsEnteredWhilePushPending = false;
    let releasePush: () => void = () => {};
    const pushGate = new Promise<void>(resolve => {
      releasePush = resolve;
    });

    const h = harness({
      sendPush: async () => {
        await pushGate;
        pushSettled = true;
      },
      sendSms: async () => {
        smsEnteredWhilePushPending = !pushSettled;
      },
    });

    const pending = dispatchWith([recipient()], bothChannels, h.ports);
    // Let every already-scheduled microtask drain; push stays gated.
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(smsEnteredWhilePushPending).toBe(true);

    releasePush();
    await pending;
  });

  it('does not wait for the SMS before sending the push', async () => {
    // The sibling requirement, other direction: a hung provider must not hold
    // push back either.
    let smsSettled = false;
    let pushEnteredWhileSmsPending = false;
    let releaseSms: () => void = () => {};
    const smsGate = new Promise<void>(resolve => {
      releaseSms = resolve;
    });

    const h = harness({
      sendSms: async () => {
        await smsGate;
        smsSettled = true;
      },
      sendPush: async () => {
        pushEnteredWhileSmsPending = !smsSettled;
      },
    });

    const pending = dispatchWith([recipient()], bothChannels, h.ports);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(pushEnteredWhileSmsPending).toBe(true);

    releaseSms();
    await pending;
  });

  it('claims per recipient so two accounts watching one entry each get a text', async () => {
    const h = harness();
    await dispatchWith(
      [recipient({ authUserId: 'owner' }), recipient({ authUserId: 'favoriter' })],
      bothChannels,
      h.ports
    );

    expect(h.texts).toHaveLength(2);
  });
});
