import { describe, expect, it, vi } from 'vitest';

import { HttpError } from '../_shared/http/responses';
import { runPremiumGenerationAttempt } from './premiumRateLimit';

const allowedRow = {
  allowed: true,
  attempts_count: 1,
  remaining_attempts: 4,
  retry_after_seconds: 0,
};

function dependencies(result: { data: unknown; error: unknown }) {
  return {
    checkRateLimit: vi.fn().mockResolvedValue(result),
    generate: vi.fn().mockResolvedValue({ narrative: 'generated' }),
  };
}

describe('runPremiumGenerationAttempt', () => {
  it('calls the paid model only after an allowed limiter result', async () => {
    const deps = dependencies({ data: [allowedRow], error: null });

    const result = await runPremiumGenerationAttempt({
      authUserId: 'user-1',
      showId: 'show-1',
      ...deps,
    });

    expect(deps.checkRateLimit).toHaveBeenCalledWith({
      authUserId: 'user-1',
      showId: 'show-1',
    });
    expect(deps.generate).toHaveBeenCalledOnce();
    expect(result).toEqual({ narrative: 'generated' });
  });

  it('returns a typed 429 on the sixth attempt without calling the paid model', async () => {
    const deps = dependencies({
      data: [
        {
          allowed: false,
          attempts_count: 5,
          remaining_attempts: 0,
          retry_after_seconds: 420,
        },
      ],
      error: null,
    });

    const promise = runPremiumGenerationAttempt({
      authUserId: 'user-1',
      showId: 'show-1',
      ...deps,
    });

    await expect(promise).rejects.toMatchObject<HttpError>({
      status: 429,
      code: 'premium_rate_limited',
      message: 'Too many premium generation attempts. Please try again later.',
    });
    expect(deps.generate).not.toHaveBeenCalled();
  });

  it('passes the show identity so one user has independent show windows', async () => {
    const checkRateLimit = vi.fn(async ({ showId }: { showId: string }) => ({
      data: [{ ...allowedRow, attempts_count: showId === 'show-1' ? 5 : 1 }],
      error: null,
    }));
    const generate = vi.fn().mockResolvedValue('generated');

    await runPremiumGenerationAttempt({
      authUserId: 'user-1',
      showId: 'show-1',
      checkRateLimit,
      generate,
    });
    await runPremiumGenerationAttempt({
      authUserId: 'user-1',
      showId: 'show-2',
      checkRateLimit,
      generate,
    });

    expect(checkRateLimit).toHaveBeenNthCalledWith(1, {
      authUserId: 'user-1',
      showId: 'show-1',
    });
    expect(checkRateLimit).toHaveBeenNthCalledWith(2, {
      authUserId: 'user-1',
      showId: 'show-2',
    });
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it('fails closed with 503 on a returned limiter error without calling the model', async () => {
    const deps = dependencies({ data: null, error: { message: 'database unavailable' } });

    const promise = runPremiumGenerationAttempt({
      authUserId: 'user-1',
      showId: 'show-1',
      ...deps,
    });

    await expect(promise).rejects.toMatchObject<HttpError>({
      status: 503,
      code: 'premium_rate_limit_unavailable',
      message: 'Premium generation is temporarily unavailable. Please try again.',
    });
    expect(deps.generate).not.toHaveBeenCalled();
  });

  it('fails closed with 503 when the limiter call rejects', async () => {
    const deps = dependencies({ data: null, error: null });
    deps.checkRateLimit.mockRejectedValueOnce(new Error('network unavailable'));

    const promise = runPremiumGenerationAttempt({
      authUserId: 'user-1',
      showId: 'show-1',
      ...deps,
    });

    await expect(promise).rejects.toMatchObject<HttpError>({ status: 503 });
    expect(deps.generate).not.toHaveBeenCalled();
  });

  it('fails closed with 503 on unusable limiter data', async () => {
    const deps = dependencies({ data: [{ allowed: 'yes' }], error: null });

    const promise = runPremiumGenerationAttempt({
      authUserId: 'user-1',
      showId: 'show-1',
      ...deps,
    });

    await expect(promise).rejects.toMatchObject<HttpError>({ status: 503 });
    expect(deps.generate).not.toHaveBeenCalled();
  });

  it('fails closed with 503 on an unusable limiter response envelope', async () => {
    const deps = dependencies({ data: null, error: null });
    deps.checkRateLimit.mockResolvedValueOnce(undefined as never);

    const promise = runPremiumGenerationAttempt({
      authUserId: 'user-1',
      showId: 'show-1',
      ...deps,
    });

    await expect(promise).rejects.toMatchObject<HttpError>({ status: 503 });
    expect(deps.generate).not.toHaveBeenCalled();
  });

  it('lets model failures propagate so only the existing Claude fallback handles them', async () => {
    const deps = dependencies({ data: [allowedRow], error: null });
    const modelError = new Error('Claude timed out');
    deps.generate.mockRejectedValueOnce(modelError);

    await expect(
      runPremiumGenerationAttempt({
        authUserId: 'user-1',
        showId: 'show-1',
        ...deps,
      })
    ).rejects.toBe(modelError);
  });
});
