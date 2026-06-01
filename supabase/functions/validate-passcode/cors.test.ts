import { describe, expect, it } from 'vitest';
import { getCorsHeaders } from './cors';

describe('validate-passcode CORS', () => {
  it('allows the myK9Q staging deployment', () => {
    const headers = getCorsHeaders('https://myk9-platform-myk9q.vercel.app');

    expect(headers['Access-Control-Allow-Origin']).toBe('https://myk9-platform-myk9q.vercel.app');
  });

  it('allows Vercel preview deployments for myK9Show', () => {
    const headers = getCorsHeaders(
      'https://myk9-platform-myk9show-eolf80hbs-richard-beezleys-projects.vercel.app'
    );

    expect(headers['Access-Control-Allow-Origin']).toBe(
      'https://myk9-platform-myk9show-eolf80hbs-richard-beezleys-projects.vercel.app'
    );
  });

  it('does not reflect unrelated origins', () => {
    const headers = getCorsHeaders('https://example.com');

    expect(headers['Access-Control-Allow-Origin']).toBe('https://myk9q.com');
  });
});
