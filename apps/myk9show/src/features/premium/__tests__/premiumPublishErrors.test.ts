import { describe, expect, it } from 'vitest';
import {
  classifyPremiumPublishError,
  classifyPremiumFunctionError,
  premiumPublishFailureMessage,
  PremiumPublishError,
  isMissingPremiumPublishRpc,
} from '../premiumPublishErrors';

describe('premium publish error contract', () => {
  it('recognizes only structured missing-function/schema-cache errors for the expected RPC', () => {
    expect(
      isMissingPremiumPublishRpc({
        code: 'PGRST202',
        message:
          'Could not find the function public.begin_premium_publish(p_show_id) in the schema cache',
      })
    ).toBe(true);
    expect(isMissingPremiumPublishRpc({ code: '42501', message: 'permission denied' })).toBe(false);
    expect(
      isMissingPremiumPublishRpc({
        code: 'PGRST202',
        message: 'publish_premium_artifact not found',
      })
    ).toBe(false);
    expect(
      isMissingPremiumPublishRpc(
        {
          code: 'PGRST202',
          message:
            'Could not find the function public.publish_premium_artifact in the schema cache',
        },
        'publish_premium_artifact'
      )
    ).toBe(true);
    expect(
      isMissingPremiumPublishRpc(
        classifyPremiumPublishError(
          {
            code: 'PGRST202',
            message:
              'Could not find the function public.publish_premium_artifact in the schema cache',
          },
          'experience-snapshot'
        ),
        'publish_premium_artifact'
      )
    ).toBe(true);
  });

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

  it('classifies a superseded publish as a safe fresh-attempt recovery', () => {
    const error = classifyPremiumPublishError(
      new Error('Premium publication attempt is stale or found no show row'),
      'experience-snapshot'
    );

    expect(error.code).toBe('stale-attempt');
    expect(premiumPublishFailureMessage(error)).toBe(
      'Another publish started for this show. Try publishing again to continue.'
    );
  });

  it('parses the production Edge Function error body before classifying it', async () => {
    const error = Object.assign(new Error('Edge Function returned a non-2xx status code'), {
      context: new Response(
        JSON.stringify({
          error: 'Premium generation is only supported for AKC and UKC shows (got: null)',
        }),
        { status: 400, headers: { 'content-type': 'application/json' } }
      ),
    });

    const classified = await classifyPremiumFunctionError(error, 'generation');

    expect(classified.code).toBe('missing-organization');
    expect(premiumPublishFailureMessage(classified)).toBe(
      "Set this show's organization to AKC or UKC in Show settings, then try again."
    );
  });

  it('uses the generic retry message when the production body is not recognized', async () => {
    const error = Object.assign(new Error('Edge Function returned a non-2xx status code'), {
      context: new Response(JSON.stringify({ error: 'database connection failed' }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      }),
    });

    const classified = await classifyPremiumFunctionError(error, 'generation');

    expect(classified.code).toBe('unknown');
    expect(premiumPublishFailureMessage(classified)).toBe(
      "We couldn't publish the premium list. Please try again."
    );
  });
});
