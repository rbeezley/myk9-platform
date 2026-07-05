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

  it('returns a ready verdict only when nothing blocks sending', () => {
    expect(
      buildAKCSubmissionReadiness({
        entryCount: 21,
        missingRegistrationNumberCount: 0,
      })
    ).toEqual({
      verdict: '21 entries are ready to send to AKC.',
      details: 'Submission file is ready to send or download.',
      canSend: true,
    });
  });
});
