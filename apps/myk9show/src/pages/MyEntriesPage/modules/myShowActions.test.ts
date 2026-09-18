/**
 * MYK9-631: what the card's Actions menu offers, and what it must never offer.
 *
 * The render test beside this (`myShowCardActions.test.tsx`) proves the menu
 * works on the real fixtures; this one drives the rule directly, including the
 * combinations a fixture would be laborious to produce.
 */
import { describe, it, expect } from 'vitest';
import { buildMyShowActions, type MyShowActionsFacts } from './myShowActions';
import { canLeaveClassRow } from './leaveClassRow';
import type { ClassRowKind } from './myShowDogState';

const live: MyShowActionsFacts = {
  showId: 'show-1',
  showName: 'Flint Hills Fall Classic',
  hasEditableOrders: true,
  hasOrders: true,
  isPastShow: false,
};

const ids = (facts: MyShowActionsFacts) => buildMyShowActions(facts).map(action => action.id);

describe('buildMyShowActions', () => {
  it('offers the full list, in order, on a live editable show', () => {
    expect(ids(live)).toEqual([
      'add-classes',
      'edit-entry',
      'receipts',
      'add-to-calendar',
      'message-show-team',
      'view-show',
    ]);
  });

  it('never offers a payment verb — the money strip keeps its own button', () => {
    // The placement rule from docs/plan-secretary-show-actions.md. Asserted on
    // the LABELS, because an id rename would let a "Finish payment" item back
    // in under a different key.
    const labels = buildMyShowActions(live).map(action => action.label.toLowerCase());
    expect(labels.some(label => label.includes('pay'))).toBe(false);
    expect(labels.some(label => label.includes('dismiss'))).toBe(false);
    // And no menu-level withdrawal: that is a row verb (Q4).
    expect(labels.some(label => label.includes('withdraw'))).toBe(false);
    expect(labels.some(label => label.includes('pull'))).toBe(false);
  });

  it('drops the edit-window items once nothing is editable', () => {
    expect(ids({ ...live, hasEditableOrders: false })).toEqual([
      'receipts',
      'add-to-calendar',
      'message-show-team',
      'view-show',
    ]);
  });

  it('drops Add classes once the show has run, but keeps the edit item', () => {
    // An entry can still need a handler change after the show starts; adding
    // classes to a show that has happened cannot mean anything.
    expect(ids({ ...live, isPastShow: true })).not.toContain('add-classes');
    expect(ids({ ...live, isPastShow: true })).toContain('edit-entry');
  });

  it('drops Receipts when the show holds no order', () => {
    expect(ids({ ...live, hasOrders: false })).not.toContain('receipts');
  });

  it('withholds every show-bound item while the show id has not replicated', () => {
    // `/shows/` and `/messages/` with nothing after them are dead links, so the
    // guard travels with the control — and Receipts, which needs only an
    // order, survives.
    expect(ids({ ...live, showId: '' })).toEqual(['edit-entry', 'receipts']);
  });

  it('emits no href with an empty segment, ever', () => {
    for (const showId of ['show-1', '']) {
      for (const action of buildMyShowActions({ ...live, showId })) {
        if (action.href) expect(action.href).not.toMatch(/\/$/);
      }
    }
  });

  it('names the show in every screen-reader label it sets', () => {
    for (const action of buildMyShowActions(live)) {
      if (action.ariaLabel) expect(action.ariaLabel).toContain(live.showName);
    }
  });
});

describe('canLeaveClassRow', () => {
  const OFFERED: ClassRowKind[] = [
    'at-gate',
    'come-to-gate',
    'conflict',
    'checked-in',
    'check-in-available',
    'opens-later',
    'not-yet-eligible',
    'closed-today',
  ];
  const WITHHELD: ClassRowKind[] = [
    'result',
    'absent',
    'not-run',
    'in-ring',
    'pulled',
    'withdrawn',
    'scratched',
    'moved',
    'not-accepted',
  ];

  it.each(OFFERED)('offers the control on a %s row', kind => {
    expect(canLeaveClassRow(kind)).toBe(true);
  });

  it.each(WITHHELD)('withholds it on a %s row', kind => {
    expect(canLeaveClassRow(kind)).toBe(false);
  });

  it('classifies every ClassRowKind exactly once', () => {
    // A kind added later must be placed deliberately in one of the two lists
    // above rather than silently inheriting "offer it".
    const covered = [...OFFERED, ...WITHHELD];
    expect(new Set(covered).size).toBe(covered.length);
    expect(covered).toHaveLength(17);
  });
});
