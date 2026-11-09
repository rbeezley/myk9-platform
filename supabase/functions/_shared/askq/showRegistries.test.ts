// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { describeShowRegistries } from './showRegistries.ts';
import type { AskQRulebookAsset } from './documentContext.ts';

const akcScent = {
  id: 'akc-scent-work',
  organizationCode: 'AKC',
  sportCode: 'akc-scent-work',
  title: 'AKC Scent Work',
} as unknown as AskQRulebookAsset;

describe('describeShowRegistries', () => {
  it('labels a single bundled-rulebook sport once', () => {
    expect(
      describeShowRegistries(
        [
          { registry_id: 'AKC', trial_type: 'akc-scent-work' },
          { registry_id: 'AKC', trial_type: 'akc-scent-work' },
        ],
        [akcScent]
      )
    ).toEqual(['AKC Scent Work']);
  });

  it('keeps a sport with no bundled rulebook so a multi-sport show is not single-sport', () => {
    const labels = describeShowRegistries(
      [
        { registry_id: 'AKC', trial_type: 'akc-scent-work' },
        { registry_id: 'AKC', trial_type: 'obedience' },
      ],
      [akcScent]
    );

    expect(labels).toHaveLength(2);
    expect(labels).toContain('AKC Scent Work');
    expect(labels).toContain('AKC obedience');
  });
});
