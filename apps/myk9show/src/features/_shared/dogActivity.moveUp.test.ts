import { describe, it, expect } from 'vitest';
import { deriveDogActivity, type DogActivityEntry } from './dogActivity';
import { deriveEntryPresentation } from '@/services/entryDisplay/entryPresentation';

// MYK9-1553: a move-up successor is money-neutral; its balance is on the root.

const show = { id: 's1', name: 'Show', start_date: '2099-05-01', end_date: '2099-05-02' };
const row = (o: Partial<DogActivityEntry>): DogActivityEntry => ({
  id: 'e1',
  entry_status: 'submitted',
  show,
  ...o,
});

const statusLine = (entry: DogActivityEntry) =>
  deriveEntryPresentation(
    {
      entryStatus: entry.entry_status ?? null,
      paymentStatus: entry.payment_status ?? null,
      paymentMethod: entry.payment_method ?? null,
      entryFee: entry.entry_fee ?? null,
    },
    { viewer: 'exhibitor' }
  ).statusLine;

describe('deriveDogActivity money root', () => {
  const root = row({
    id: 'root',
    entry_status: 'moved',
    payment_status: 'pending',
    payment_method: 'online',
    entry_fee: 30,
  });

  it('reads the successor payment from its root, as My Shows does', () => {
    const successor = row({
      id: 'succ',
      moved_from_entry_id: 'root',
      payment_status: 'pending',
      payment_method: null,
      entry_fee: 0,
    });
    const [upcoming] = deriveDogActivity([root, successor]).upcoming;
    expect(upcoming.id).toBe('succ');
    expect(statusLine(upcoming)).toBe('Submitted — waiting on payment');
  });

  it('reads paid when the root is paid', () => {
    const [upcoming] = deriveDogActivity([
      { ...root, payment_status: 'paid_online' },
      row({ id: 'succ', moved_from_entry_id: 'root', payment_status: 'pending', entry_fee: 0 }),
    ]).upcoming;
    expect(statusLine(upcoming)).toBe('Submitted — awaiting review');
  });

  it('claims no payment when the root cannot be reached', () => {
    const [upcoming] = deriveDogActivity([
      row({
        id: 'succ',
        moved_from_entry_id: 'gone',
        payment_status: 'pending',
        entry_fee: 30,
        payment_method: 'online',
      }),
    ]).upcoming;
    expect(statusLine(upcoming)).toBe('Submitted — awaiting review');
  });
});
