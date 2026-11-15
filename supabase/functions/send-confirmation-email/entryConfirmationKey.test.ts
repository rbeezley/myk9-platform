// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { confirmationIdempotencyKey } from './entryConfirmations';

const group = { key: 'show-1:registration:reg-1' };

describe('confirmationIdempotencyKey', () => {
  it('is the same for the same entries and generations, in any order', async () => {
    const generations = new Map([
      ['e1', 'h1'],
      ['e2', 'h2'],
    ]);
    const a = await confirmationIdempotencyKey(group, ['e1', 'e2'], generations);
    const b = await confirmationIdempotencyKey(
      group,
      ['e2', 'e1'],
      new Map([...generations].reverse())
    );
    expect(b).toBe(a);
    expect(a).toMatch(/^entry-confirmation:[0-9a-f]{48}$/);
  });

  it('changes when one entry is accepted again (a new generation)', async () => {
    const before = await confirmationIdempotencyKey(
      group,
      ['e1', 'e2'],
      new Map([
        ['e1', 'h1'],
        ['e2', 'h2'],
      ])
    );
    const after = await confirmationIdempotencyKey(
      group,
      ['e1', 'e2'],
      new Map([
        ['e1', 'h1'],
        ['e2', 'h9'],
      ])
    );
    expect(after).not.toBe(before);
  });

  it('treats an entry with no history as generation none, distinct from one with history', async () => {
    const none = await confirmationIdempotencyKey(group, ['e1'], new Map());
    expect(none).toBe(await confirmationIdempotencyKey(group, ['e1'], new Map([['e9', 'x']])));
    expect(none).not.toBe(await confirmationIdempotencyKey(group, ['e1'], new Map([['e1', 'h1']])));
  });
});
