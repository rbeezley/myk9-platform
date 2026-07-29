import type { Browser } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ResolvedLoadTarget } from './loadTarget';
import { assertApplicationTarget, supabaseRequestOrigin } from './loadAppTarget';

afterEach(() => {
  vi.useRealTimers();
});

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

  it('accepts an explicitly declared app identity without incidental Supabase traffic', async () => {
    vi.useFakeTimers();
    const getAttribute = vi.fn().mockResolvedValue('https://approved.supabase.co');
    const close = vi.fn().mockResolvedValue(undefined);
    const page = {
      goto: vi.fn().mockResolvedValue(undefined),
      locator: vi.fn().mockReturnValue({ getAttribute }),
      on: vi.fn(),
    };
    const browser = {
      newContext: vi.fn().mockResolvedValue({
        close,
        newPage: vi.fn().mockResolvedValue(page),
      }),
    } as unknown as Browser;
    const target: ResolvedLoadTarget = {
      mode: 'e2e',
      baseUrl: 'http://127.0.0.1:5173',
      supabaseUrl: 'https://approved.supabase.co',
      projectRef: 'approved',
      computeTier: 'Micro',
      gateEligible: true,
    };

    const assertion = expect(assertApplicationTarget(browser, target)).resolves.toBeUndefined();
    await vi.runAllTimersAsync();
    await assertion;

    expect(page.locator).toHaveBeenCalledWith('meta[name="myk9-supabase-origin"]');
    expect(getAttribute).toHaveBeenCalledWith('content');
    expect(close).toHaveBeenCalledOnce();
  });

  it('declares the configured Supabase identity in the served application shell', () => {
    const applicationShell = readFileSync(resolve(__dirname, '../../../index.html'), 'utf8');

    expect(applicationShell).toContain(
      '<meta name="myk9-supabase-origin" content="%VITE_SUPABASE_URL%" />'
    );
  });
});
