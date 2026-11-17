// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { claimableFilter } from './confirmationFilter';

const NOW = '2026-11-20T15:00:00.000Z';

describe('claimableFilter (MYK9-2088)', () => {
  it('is (no lease AND status in the run statuses) OR (lease expired), as one or() string', () => {
    expect(claimableFilter(['pending'], NOW)).toBe(
      'and(confirmation_claimed_until.is.null,confirmation_email_status.in.(pending)),confirmation_claimed_until.lt.2026-11-20T15:00:00.000Z'
    );
    expect(claimableFilter(['pending', 'failed'], NOW)).toBe(
      'and(confirmation_claimed_until.is.null,confirmation_email_status.in.(pending,failed)),confirmation_claimed_until.lt.2026-11-20T15:00:00.000Z'
    );
  });

  it('is the only .or() on each candidate read and on the claim', () => {
    const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
    const sections = [
      source.slice(source.indexOf('loadCandidates: async'), source.indexOf('loadExhibitorEntries')),
      source.slice(source.indexOf('loadExhibitorEntries'), source.indexOf('loadRecipients: async')),
      source.slice(source.indexOf('claim: async'), source.indexOf('markSent: async')),
    ];
    for (const section of sections) {
      expect(section.match(/\.or\(/g)).toEqual(['.or(']);
      expect(section).toContain('.or(claimableFilter(statuses, nowIso))');
    }
  });
});
