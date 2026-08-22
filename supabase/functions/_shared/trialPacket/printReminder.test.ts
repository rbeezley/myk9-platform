// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  buildPrintReminderEmailHtml,
  buildPrintReminderSubject,
  decidePrintReminder,
  isPrintReminderKind,
  packetDayIsPrinted,
  type PrintConfirmationRow,
} from './printReminder.ts';

const confirmation = (
  trialDate: string,
  overrides: Partial<PrintConfirmationRow> = {}
): PrintConfirmationRow => ({
  report_id: 'emergency-trial-packet',
  coverage: { trialDate, scopeKind: 'show' },
  voided_at: null,
  ...overrides,
});

describe('packetDayIsPrinted', () => {
  it('reads the day out of coverage, since the row carries no trial_id', () => {
    // A packet covers a DAY and a day may hold several trials, so no
    // scope_kind in paperwork_prints_scope_shape can express it — every packet
    // row is show-scoped with a null trial_id (phase 5a).
    expect(packetDayIsPrinted([confirmation('2026-10-04')], '2026-10-04')).toBe(true);
    expect(packetDayIsPrinted([confirmation('2026-10-03')], '2026-10-04')).toBe(false);
  });

  it('does not accept another report printed on the same day', () => {
    // A check-in sheet is not the emergency packet. Counting it would silence
    // the reminder for paperwork that was never printed.
    expect(
      packetDayIsPrinted([confirmation('2026-10-04', { report_id: 'check-in-sheet' })], '2026-10-04')
    ).toBe(false);
  });

  it('treats a voided confirmation as retracted, not weaker', () => {
    expect(
      packetDayIsPrinted([confirmation('2026-10-04', { voided_at: '2026-10-04T01:00:00Z' })], '2026-10-04')
    ).toBe(false);
  });

  it('survives coverage that is not the shape we expect', () => {
    // `coverage` is jsonb with only an "is an object" CHECK. A malformed row
    // must not throw mid-run and cancel the reminder for everyone.
    for (const coverage of [null, 'a string', 42, [], { trialDate: 5 }]) {
      expect(packetDayIsPrinted([{ ...confirmation('x'), coverage }], '2026-10-04')).toBe(false);
    }
  });
});

describe('decidePrintReminder', () => {
  it('fires when a packet exists and nobody has confirmed printing it', () => {
    expect(
      decidePrintReminder({ hasDeliveredPacket: true, confirmations: [], trialDate: '2026-10-04' })
    ).toEqual({ remind: true });
  });

  it('stops once a confirmation covers the day', () => {
    expect(
      decidePrintReminder({
        hasDeliveredPacket: true,
        confirmations: [confirmation('2026-10-04')],
        trialDate: '2026-10-04',
      })
    ).toEqual({ remind: false, reason: 'already-printed' });
  });

  it('says nothing at all when there is no packet to print', () => {
    // "Print the packet" when no packet exists is noise, and noise is how a
    // channel stops being read. The generation failure is a different problem
    // with its own visibility (delivery_status / error_message).
    expect(
      decidePrintReminder({ hasDeliveredPacket: false, confirmations: [], trialDate: '2026-10-04' })
    ).toEqual({ remind: false, reason: 'no-packet' });
  });

  it('is not satisfied by yesterday being printed', () => {
    expect(
      decidePrintReminder({
        hasDeliveredPacket: true,
        confirmations: [confirmation('2026-10-03')],
        trialDate: '2026-10-04',
      })
    ).toEqual({ remind: true });
  });
});

describe('isPrintReminderKind', () => {
  it('accepts only the two slots', () => {
    expect(isPrintReminderKind('evening-before')).toBe(true);
    expect(isPrintReminderKind('morning-of')).toBe(true);
    for (const bad of ['evening', '', null, undefined, 3, {}]) {
      expect(isPrintReminderKind(bad)).toBe(false);
    }
  });
});

describe('reminder wording', () => {
  it('asks for paper, never for a file', () => {
    const html = buildPrintReminderEmailHtml({
      showName: 'Heartland',
      trialDate: '2026-10-04',
      kind: 'evening-before',
    });
    expect(html).toMatch(/PRINT IT AND PUT IT IN THE TRIAL BOX/);
    expect(html).toMatch(/Mark printed/);
    // The whole reframing of this reminder: it is not "please generate a
    // packet", a chore about our plumbing that reads as our problem.
    expect(html).not.toMatch(/generate a packet|create a packet/i);
  });

  it('says the morning send is the last chance', () => {
    const morning = buildPrintReminderEmailHtml({
      showName: 'Heartland',
      trialDate: '2026-10-04',
      kind: 'morning-of',
    });
    expect(morning).toMatch(/is today/);
    expect(morning).toMatch(/last chance/i);
    expect(buildPrintReminderSubject({ showName: 'Heartland', trialDate: '2026-10-04', kind: 'morning-of' })).toMatch(/^Today:/);
    expect(buildPrintReminderSubject({ showName: 'Heartland', trialDate: '2026-10-04', kind: 'evening-before' })).toMatch(/^Tonight:/);
  });

  it('escapes a show name that contains markup', () => {
    const html = buildPrintReminderEmailHtml({
      showName: '<script>alert(1)</script>',
      trialDate: '2026-10-04',
      kind: 'evening-before',
    });
    expect(html).not.toMatch(/<script>/);
    expect(html).toMatch(/&lt;script&gt;/);
  });
});
