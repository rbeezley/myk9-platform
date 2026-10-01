// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  loadStoredEntryJunior,
  priceCartItems,
  type CartItemForPricing,
  type StoredEntryJuniorClient,
} from './cartItemPricing';

// After a move-up the cart line names the live DESTINATION, created money-neutral
// (fee 0, no declaration). The fee and the declaration stay on the entry that was
// PAID, the money root. Pricing must read them from the root (MYK9-639).
type Row = {
  id: string;
  dog_id: string;
  class_id: string;
  entry_fee: number | string | null;
  moved_from_entry_id: string | null;
  junior_fee_declared: boolean;
  junior_fee_override_by: string | null;
};

function tableClient(rows: Row[]) {
  const calls: string[][] = [];
  const client: StoredEntryJuniorClient = {
    from() {
      return {
        select() {
          return {
            in(_column, ids) {
              calls.push(ids);
              return Promise.resolve({ data: rows.filter(r => ids.includes(r.id)), error: null });
            },
          };
        },
      };
    },
  };
  return { client, calls };
}

const show = {
  pre_entry_fee: 30,
  day_of_show_fee: 45,
  start_date: '2026-10-10',
  junior_handler_fee: 20, // raised from 15 after the entry was created
};
const NOW = '2026-10-01T12:00:00Z';

const root: Row = {
  id: 'root',
  dog_id: 'dog-1',
  class_id: 'class-old',
  entry_fee: '15.00',
  moved_from_entry_id: null,
  junior_fee_declared: true,
  junior_fee_override_by: null,
};
const destination: Row = {
  id: 'dest',
  dog_id: 'dog-1',
  class_id: 'class-new',
  entry_fee: '0.00',
  moved_from_entry_id: 'root',
  junior_fee_declared: false,
  junior_fee_override_by: null,
};
const line: CartItemForPricing = {
  id: 'item-1',
  dog_id: 'dog-1',
  class_id: 'class-new',
  entry_id: 'dest',
  junior_fee_declared: false,
  class_entry_fee: 28,
};

describe('Finish Payment line naming a moved-up destination', () => {
  it('is charged the ROOT frozen 15.00, not the destination 0 priced at the tier', async () => {
    const { client } = tableClient([root, destination]);
    const { stored, error } = await loadStoredEntryJunior(client, [line]);
    expect(error).toBeNull();
    expect(priceCartItems(show, [line], stored, NOW).get('item-1')).toBe(1500);
  });

  it('follows a two-hop chain to the original root', async () => {
    const mid: Row = {
      ...destination,
      id: 'mid',
      class_id: 'class-mid',
      moved_from_entry_id: 'root',
    };
    const dest2: Row = { ...destination, id: 'dest', moved_from_entry_id: 'mid' };
    const { client, calls } = tableClient([root, mid, dest2]);
    const { stored } = await loadStoredEntryJunior(client, [line]);
    expect(priceCartItems(show, [line], stored, NOW).get('item-1')).toBe(1500);
    // dest, then mid, then root: one read per hop, never one per line per hop.
    expect(calls).toEqual([['dest'], ['mid'], ['root']]);
  });

  it('keeps the named entry dog and class for the line check, so another dog cannot borrow it', async () => {
    const { client } = tableClient([root, destination]);
    const { stored } = await loadStoredEntryJunior(client, [line]);
    const otherDog = { ...line, dog_id: 'dog-2' };
    expect(priceCartItems(show, [otherDog], stored, NOW).get('item-1')).toBe(3000);
  });

  it('an entry with no move chain reads exactly as before, in one read', async () => {
    const { client, calls } = tableClient([root]);
    const direct = { ...line, class_id: 'class-old', entry_id: 'root' };
    const { stored } = await loadStoredEntryJunior(client, [direct]);
    expect(priceCartItems(show, [direct], stored, NOW).get('item-1')).toBe(1500);
    expect(calls).toEqual([['root']]);
  });

  it('a broken chain (root missing) falls back to the entry it can read', async () => {
    const { client } = tableClient([destination]);
    const { stored } = await loadStoredEntryJunior(client, [line]);
    // dest fee 0 and no flags: priced from the tiers, never charged nothing.
    expect(priceCartItems(show, [line], stored, NOW).get('item-1')).toBe(3000);
  });
});
