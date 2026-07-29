import { describe, expect, it } from 'vitest';
import { supabaseRequestOrigin } from './loadAppTarget';

describe('application target observation', () => {
  it.each([
    ['https://approved.supabase.co/rest/v1/shows', 'https://approved.supabase.co'],
    ['http://127.0.0.1:54321/auth/v1/user', 'http://127.0.0.1:54321'],
    ['http://localhost:54321/realtime/v1/websocket', 'http://localhost:54321'],
  ])('recognizes a Supabase request: %s', (requestUrl, expectedOrigin) => {
    expect(supabaseRequestOrigin(requestUrl)).toBe(expectedOrigin);
  });

  it('ignores ordinary application requests', () => {
    expect(supabaseRequestOrigin('https://app.example.test/assets/main.js')).toBeUndefined();
  });
});
