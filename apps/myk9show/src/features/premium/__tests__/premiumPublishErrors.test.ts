import { describe, expect, it } from 'vitest';
import {
  classifyPremiumPublishError,
  premiumPublishFailureMessage,
  PremiumPublishError,
} from '../premiumPublishErrors';

describe('premium publish error contract', () => {
  it('turns a missing organization response into specific correction guidance', () => {
    const error = classifyPremiumPublishError(
      new Error('Premium generation is only supported for AKC and UKC shows (got: null)'),
      'generation'
    );

    expect(error).toBeInstanceOf(PremiumPublishError);
    expect(error.code).toBe('missing-organization');
    expect(premiumPublishFailureMessage(error)).toBe(
      "Set this show's organization to AKC or UKC in Show settings, then try again."
    );
  });

  it('keeps unknown failures safe to retry without exposing technical details', () => {
    const error = classifyPremiumPublishError(
      new Error('Edge Function returned 500: {"detail":"internal server failure"}'),
      'generation'
    );

    expect(error.code).toBe('unknown');
    expect(premiumPublishFailureMessage(error)).toBe(
      "We couldn't publish the premium list. Please try again."
    );
    expect(premiumPublishFailureMessage(error)).not.toContain('permission denied');
  });

  it('identifies the storage permission mismatch as actionable access guidance', () => {
    const error = classifyPremiumPublishError(
      new Error('new row violates row-level security policy for table "objects"'),
      'pdf-upload'
    );

    expect(error.code).toBe('permission');
    expect(premiumPublishFailureMessage(error)).toBe(
      "You do not have permission to publish this show's premium list. Ask the show owner to add you as a secretary."
    );
  });
});
