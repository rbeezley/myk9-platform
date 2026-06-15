import { describe, it, expect } from 'vitest';
import { isNationalsCompetition } from './sortableEntryCardUtils';

// Pins the contract between the show-context producers (myK9Show's
// validate-passcode edge function + the /at-show RingsideShowContext, both of
// which emit competition_type = 'Nationals' | 'Regular' from shows.is_nationals)
// and this ringside consumer, which detects Nationals by substring.
describe('isNationalsCompetition', () => {
  it('detects the Nationals routing value', () => {
    expect(isNationalsCompetition({ competition_type: 'Nationals' })).toBe(true);
  });

  it('treats Regular as not-Nationals', () => {
    expect(isNationalsCompetition({ competition_type: 'Regular' })).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(isNationalsCompetition({ competition_type: 'akc scent work nationals' })).toBe(true);
  });

  it('handles empty / missing / null context as not-Nationals', () => {
    expect(isNationalsCompetition({ competition_type: '' })).toBe(false);
    expect(isNationalsCompetition({})).toBe(false);
    expect(isNationalsCompetition(null)).toBe(false);
    expect(isNationalsCompetition(undefined)).toBe(false);
  });
});
