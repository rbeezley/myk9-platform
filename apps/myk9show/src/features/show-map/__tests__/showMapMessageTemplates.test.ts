import { describe, expect, it } from 'vitest';
import { getShowMapMessageTemplates } from '../showMapMessageTemplates';
import type { ShowMapNode } from '../showMapTypes';

describe('showMapMessageTemplates', () => {
  it('builds canned messages with the armband and dog name', () => {
    const node = {
      id: 'entry:entry-1',
      type: 'entry',
      label: '#12 Bella',
      entryDisplay: {
        armband: '12',
        dogName: 'Bella',
      },
      childrenCount: 0,
    } satisfies ShowMapNode;

    expect(getShowMapMessageTemplates(node)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'secretary-table',
          body: 'Please stop by the secretary table about #12 Bella.',
        }),
        expect.objectContaining({
          id: 'gate-soon',
          body: 'Please bring #12 Bella to the gate when you can.',
        }),
      ])
    );
  });

  it('falls back to a plain entry reference when display details are missing', () => {
    expect(getShowMapMessageTemplates(undefined)[0]?.body).toBe(
      'Please stop by the secretary table about your entry.'
    );
  });
});
