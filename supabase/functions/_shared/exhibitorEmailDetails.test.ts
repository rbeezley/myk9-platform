// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { UNSET_JUDGE_LABEL } from '../../../apps/myk9show/src/utils/classJudgeDisplay';
import {
  formatStreetAddress,
  formatVenueLines,
  JUDGE_TO_BE_ANNOUNCED,
  judgeLine,
  judgeNamesByClass,
  myShowsUrl,
} from './exhibitorEmailDetails';

describe('exhibitorEmailDetails copies (MYK9-1999)', () => {
  it('the root-tree copy is byte-identical to the myk9show-tree copy', () => {
    const here = fileURLToPath(new URL('./exhibitorEmailDetails.ts', import.meta.url));
    const app = fileURLToPath(
      new URL(
        '../../../apps/myk9show/supabase/functions/_shared/exhibitorEmailDetails.ts',
        import.meta.url
      )
    );
    expect(readFileSync(here, 'utf8')).toBe(readFileSync(app, 'utf8'));
  });
});

describe('judgeNamesByClass', () => {
  it('names the confirmed class judge and nobody else', () => {
    const names = judgeNamesByClass([
      { class_id: 'c1', status: 'invited', person: { first_name: 'Ann', last_name: 'Invite' } },
      {
        class_id: 'c1',
        status: 'confirmed',
        person: { first_name: 'Dana', last_name: 'Whitlock' },
      },
      { class_id: 'c2', status: 'declined', person: { first_name: 'Lee', last_name: 'Okafor' } },
      {
        class_id: 'c3',
        status: 'confirmed',
        person: { first_name: 'Gone', last_name: 'Judge', deleted_at: '2026-11-01T00:00:00Z' },
      },
      { class_id: null, status: 'confirmed', person: { first_name: 'Trial', last_name: 'Level' } },
    ]);
    expect([...names]).toEqual([['c1', 'Dana Whitlock']]);
  });

  it('says the judge is to be announced the same way the app does', () => {
    expect(JUDGE_TO_BE_ANNOUNCED).toBe(UNSET_JUDGE_LABEL);
    expect(judgeLine('  Dana Whitlock ')).toBe('Judge Dana Whitlock');
    expect(judgeLine(undefined)).toBe('Judge to be announced');
  });
});

describe('formatStreetAddress', () => {
  it('builds the street address from its parts, skipping the blank ones', () => {
    expect(
      formatStreetAddress({
        address: '1200 Fairgrounds Rd',
        city: 'Springfield',
        state: 'IL',
        zip_code: '62701',
      })
    ).toBe('1200 Fairgrounds Rd, Springfield, IL 62701');
    expect(formatStreetAddress({ address: ' ', city: 'Springfield', state: null })).toBe(
      'Springfield'
    );
    expect(formatStreetAddress({})).toBeNull();
  });

  it('puts the venue name above the street address', () => {
    expect(
      formatVenueLines({
        venue_name: 'Expo Hall',
        address: '1 Main St',
        city: 'Austin',
        state: 'TX',
      })
    ).toBe('Expo Hall\n1 Main St, Austin, TX');
    expect(formatVenueLines(null)).toBeNull();
  });

  it('prints the address the secretary typed in the show wizard (MYK9-2486)', () => {
    // What production holds: the wizard fills `location` and none of the separate columns.
    expect(
      formatVenueLines({
        location: '100 Dog Show Lane, Tulsa, OK 74101',
        city: 'Tulsa',
        state: 'Oklahoma',
      })
    ).toBe('100 Dog Show Lane, Tulsa, OK 74101');
    expect(formatVenueLines({ location: ' Expo Hall \r\n 1 Main St, Austin, TX \n' })).toBe(
      'Expo Hall\n1 Main St, Austin, TX'
    );
  });

  it('puts the venue name above the typed address, once', () => {
    expect(formatVenueLines({ venue_name: 'Expo Hall', location: '1 Main St, Austin, TX' })).toBe(
      'Expo Hall\n1 Main St, Austin, TX'
    );
    expect(
      formatVenueLines({ venue_name: 'Expo Hall', location: 'Expo Hall, 1 Main St, Austin, TX' })
    ).toBe('Expo Hall, 1 Main St, Austin, TX');
  });

  it('falls back to the city and state when no address was typed', () => {
    expect(formatVenueLines({ location: '  ', city: 'Tulsa', state: 'Oklahoma' })).toBe(
      'Tulsa, Oklahoma'
    );
  });
});

describe('myShowsUrl', () => {
  it('links to My Shows on the configured site', () => {
    expect(myShowsUrl('https://staging.example.com/')).toBe(
      'https://staging.example.com/exhibitor/entries'
    );
    expect(myShowsUrl(undefined)).toBe('https://myk9show.com/exhibitor/entries');
  });
});
