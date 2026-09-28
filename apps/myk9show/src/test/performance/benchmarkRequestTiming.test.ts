import { describe, expect, it } from 'vitest';
import type { Request } from '@playwright/test';
import { readSupabaseRequestDuration } from './benchmarkRequestTiming';

describe('Supabase request timing', () => {
  it('drops a response that rejects after its page closes', async () => {
    const request = {
      url: () => 'https://db.example.test/rest/v1/shows',
      response: () => Promise.reject(new Error('Target page, context or browser has been closed')),
    } as unknown as Request;
    await expect(readSupabaseRequestDuration(request, 'https://db.example.test')).resolves.toBeNull();
  });

  it('keeps a completed response timing', async () => {
    const request = {
      url: () => 'https://db.example.test/rest/v1/shows',
      response: async () => ({ request: () => ({ timing: () => ({ responseEnd: 183 }) }) }),
    } as unknown as Request;
    await expect(readSupabaseRequestDuration(request, 'https://db.example.test')).resolves.toEqual({
      path: '/rest/v1/shows',
      durationMs: 183,
    });
  });
});
