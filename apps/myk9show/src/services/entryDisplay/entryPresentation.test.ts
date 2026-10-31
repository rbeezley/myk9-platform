import { describe, expect, it } from 'vitest';
import { deriveEntryPresentation, type EntryViewer } from './entryPresentation';

const secretary: EntryViewer = { viewer: 'secretary' };
const exhibitor: EntryViewer = { viewer: 'exhibitor' };

function present(entryStatus: string | null | undefined, viewer: EntryViewer, extra = {}) {
  return deriveEntryPresentation({ entryStatus, ...extra }, viewer);
}

describe('deriveEntryPresentation — context-aware wording', () => {
  it('reads "Needs review" to a secretary and reassures the exhibitor for a paid entry', () => {
    // The standing "paid stays pending" decision: payment is not acceptance.
    expect(present('paid', secretary)).toEqual({
      kind: 'accepted',
      statusLine: 'Needs review',
      actionHint: null,
    });
    expect(present('paid', exhibitor)).toEqual({
      kind: 'accepted',
      statusLine: "Submitted — you're in",
      actionHint: null,
    });
  });

  it('gives "Pending" (awaiting review) different words from "not yet run"', () => {
    expect(present('submitted', secretary).statusLine).toBe('Needs review');
    expect(present('submitted', exhibitor).statusLine).toBe('Submitted — awaiting review');
    // An accepted-but-unrun entry never reads as pending-anything.
    expect(present('confirmed', secretary).statusLine).toBe('Accepted');
    expect(present('confirmed', exhibitor).statusLine).toBe("Accepted — you're in");
  });

  it('keeps promotion-expired in the review lane for the secretary, honest for the exhibitor', () => {
    const sec = present('promotion-expired', secretary);
    expect(sec.statusLine).toBe('Needs review');
    expect(sec.actionHint).toBe('Waitlist promotion expired — confirm or release the spot');
    const exh = present('promotion-expired', exhibitor);
    expect(exh.statusLine).toBe('Payment window expired');
    expect(exh.actionHint).toBe('Contact the show secretary to re-enter');
  });

  it('renders a retired scratch-request value without crashing or borrowing wording (MYK9-719)', () => {
    for (const raw of ['scratch-requested', 'scratch_requested']) {
      const sec = present(raw, secretary);
      expect(sec.kind).toBe('unknown');
      expect(sec.statusLine ?? '').not.toMatch(/pull requested|scratch/i);
    }
  });

  it('surfaces the move-up approval queue to the secretary', () => {
    const sec = present('move-up-requested', secretary);
    expect(sec.statusLine).toBe('Move-up requested');
    expect(sec.actionHint).toBe('Approve or decline in Move-ups & pulls');
    expect(present('move-up-requested', exhibitor).actionHint).toBe('Awaiting secretary approval');
  });

  it('asks the exhibitor to finish payment on a waitlist promotion', () => {
    expect(present('pending-payment', exhibitor)).toEqual({
      kind: 'pending',
      statusLine: 'Payment needed',
      actionHint: 'Finish payment to keep your spot',
    });
    expect(present('pending-payment', secretary).statusLine).toBe('Awaiting payment');
  });

  it('nudges the exhibitor to finish a draft entry', () => {
    expect(present('draft', exhibitor)).toEqual({
      kind: 'pending',
      statusLine: 'Draft',
      actionHint: 'Finish and submit this entry',
    });
    expect(present('draft', secretary)).toEqual({
      kind: 'pending',
      statusLine: 'Draft',
      actionHint: null,
    });
  });
});

describe('deriveEntryPresentation — kind-level lines', () => {
  const kindLines: Array<[raw: string, sec: string, exh: string]> = [
    ['no-status', 'Needs review', 'Submitted — awaiting review'],
    ['pending', 'Needs review', 'Submitted — awaiting review'],
    ['accepted', 'Accepted', "Accepted — you're in"],
    ['scheduled', 'Accepted', "Accepted — you're in"],
    // MYK9-754: the entries CHECK constraint forbids 'waitlisted' (a waitlisted
    // dog is a waitlist_entries row), so it is an unrecognized status.
    ['waitlisted', 'Status unavailable', 'Status unavailable'],
    ['checked-in', 'In the ring', 'In the ring'],
    ['at-gate', 'In the ring', 'In the ring'],
    ['in-ring', 'In the ring', 'In the ring'],
    ['competing', 'In the ring', 'In the ring'],
    ['completed', 'Scored', 'Scored'],
    ['withdrawn', 'Withdrawn', 'Withdrawn'],
    ['cancelled', 'Withdrawn', 'Withdrawn'],
    ['not_accepted', 'Not accepted', 'Not accepted'],
    ['rejected', 'Not accepted', 'Not accepted'],
    ['scratched', 'Pulled', 'Pulled'],
    ['absent', 'Absent', 'Absent'],
    ['moved', 'Moved', 'Moved'],
  ];

  it.each(kindLines)('renders %s as "%s" (secretary) / "%s" (exhibitor)', (raw, sec, exh) => {
    expect(present(raw, secretary).statusLine).toBe(sec);
    expect(present(raw, exhibitor).statusLine).toBe(exh);
  });

  it('never leaks a raw enum or "Unknown" for unrecognized statuses', () => {
    for (const viewer of [secretary, exhibitor]) {
      const result = present('some-future-status', viewer);
      expect(result.kind).toBe('unknown');
      expect(result.statusLine).toBe('Status unavailable');
      expect(result.actionHint).toBeNull();
    }
    expect(present(null, secretary).statusLine).toBe('Status unavailable');
    expect(present(undefined, exhibitor).statusLine).toBe('Status unavailable');
  });
});

describe('deriveEntryPresentation — refund composition', () => {
  it('appends the refund atom to a terminal line', () => {
    const result = present('withdrawn', exhibitor, { refundAmount: 30 });
    expect(result.statusLine).toBe('Withdrawn · Refunded $30');
    expect(result.actionHint).toBeNull();
  });

  it('renders the Pending+Refunded special row with its secretary action hint', () => {
    const result = present('submitted', secretary, { paymentStatus: 'refunded' });
    expect(result.statusLine).toBe('Needs review · Refunded');
    expect(result.actionHint).toBe('Refunded — confirm withdrawal or keep entry');
  });

  it('treats a refunded paid entry as the same special row', () => {
    const result = present('paid', secretary, { refundAmount: 25.5 });
    expect(result.statusLine).toBe('Needs review · Refunded $25.50');
    expect(result.actionHint).toBe('Refunded — confirm withdrawal or keep entry');
  });

  it('keeps the exhibitor voice factual on a pending refund', () => {
    const result = present('submitted', exhibitor, { paymentStatus: 'refunded' });
    expect(result.statusLine).toBe('Submitted — awaiting review · Refunded');
    expect(result.actionHint).toBe('Contact the show secretary about this entry');
  });

  it('renders partial refunds distinctly', () => {
    expect(present('withdrawn', secretary, { paymentStatus: 'partial_refund' }).statusLine).toBe(
      'Withdrawn · Partial refund'
    );
  });

  it('never emits more than one action hint', () => {
    // Pending+Refunded: the refund hint wins; still exactly one.
    const result = present('submitted', secretary, { paymentStatus: 'refunded' });
    expect(result.actionHint).toBe('Refunded — confirm withdrawal or keep entry');
  });
});

describe('deriveEntryPresentation — submitted entry payment state (MYK9-1553)', () => {
  const unpaid = { paymentStatus: 'pending', paymentMethod: 'online', entryFee: 30 };

  it('says waiting on payment for an unpaid online submitted entry', () => {
    expect(present('submitted', exhibitor, unpaid).statusLine).toBe(
      'Submitted — waiting on payment'
    );
    expect(present('submitted', secretary, unpaid).statusLine).toBe('Awaiting payment');
  });

  it('says awaiting review once paid', () => {
    const paid = { ...unpaid, paymentStatus: 'paid_online' };
    expect(present('submitted', exhibitor, paid).statusLine).toBe('Submitted — awaiting review');
    expect(present('submitted', secretary, paid).statusLine).toBe('Needs review');
  });

  it('keeps pay-at-show, fee-less and unknown-payment rows on awaiting review', () => {
    expect(present('submitted', exhibitor, { ...unpaid, paymentMethod: 'cash' }).statusLine).toBe(
      'Submitted — awaiting review'
    );
    expect(present('submitted', exhibitor, { ...unpaid, entryFee: null }).statusLine).toBe(
      'Submitted — awaiting review'
    );
    expect(present('submitted', exhibitor).statusLine).toBe('Submitted — awaiting review');
  });

  it('leaves paid and promotion-expired in the review lane even with a pending payment', () => {
    expect(present('paid', exhibitor, unpaid).statusLine).toBe("Submitted — you're in");
    expect(present('promotion-expired', secretary, unpaid).statusLine).toBe('Needs review');
  });
});
