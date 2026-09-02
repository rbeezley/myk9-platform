import { describe, expect, it } from 'vitest';
import { buildAKCSubmissionReadiness } from '../ResultsSubmissionPage/helpers';

describe('buildAKCSubmissionReadiness', () => {
  it('returns one blocked verdict when registration numbers are missing', () => {
    expect(
      buildAKCSubmissionReadiness({
        entryCount: 21,
        missingRegistrationNumberCount: 21,
      })
    ).toEqual({
      verdict: '21 entries need AKC registration numbers before sending.',
      details:
        'You can still download a draft XML file, but Send to AKC stays disabled until the missing registration numbers are added.',
      canSend: false,
    });
  });

  // MYK9-323 — AKC has no "not scored yet" code, so an unscored dog can only
  // go out as NQ. Sending must be blocked until every entry carries a result.
  it('blocks sending while any entry has no result recorded', () => {
    expect(
      buildAKCSubmissionReadiness({
        entryCount: 21,
        missingRegistrationNumberCount: 0,
        unscoredEntryCount: 3,
      })
    ).toEqual({
      verdict: '3 entries have no result recorded yet.',
      details:
        'AKC has no code for an unscored run, so these would be submitted as NQ. Record a result (or mark the dog absent, excused, or withdrawn) for each one before sending.',
      canSend: false,
    });
  });

  it('singularises the unscored-entry verdict', () => {
    expect(
      buildAKCSubmissionReadiness({
        entryCount: 21,
        missingRegistrationNumberCount: 0,
        unscoredEntryCount: 1,
      }).verdict
    ).toBe('1 entry has no result recorded yet.');
  });

  it('returns a ready verdict only when nothing blocks sending', () => {
    expect(
      buildAKCSubmissionReadiness({
        entryCount: 21,
        missingRegistrationNumberCount: 0,
        unscoredEntryCount: 0,
      })
    ).toEqual({
      verdict: '21 entries are ready to send to AKC.',
      details: 'Submission file is ready to send or download.',
      canSend: true,
    });
  });
});
