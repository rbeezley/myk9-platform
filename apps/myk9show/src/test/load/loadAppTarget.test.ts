import type { Browser } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ResolvedLoadTarget } from './loadTarget';
import { assertApplicationTarget } from './loadAppTarget';

afterEach(() => {
  vi.useRealTimers();
});

describe('application target observation', () => {
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

  it('rejects a missing declared identity even when approved-origin traffic occurs', async () => {
    let observeRequest: ((request: { url(): string }) => void) | undefined;
    const close = vi.fn().mockResolvedValue(undefined);
    const page = {
      goto: vi.fn().mockImplementation(async () => {
        observeRequest?.({ url: () => 'https://approved.supabase.co/rest/v1/shows' });
      }),
      locator: vi.fn().mockReturnValue({
        getAttribute: vi.fn().mockResolvedValue(null),
      }),
      on: vi.fn().mockImplementation((_event, handler) => {
        observeRequest = handler;
      }),
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

    await expect(assertApplicationTarget(browser, target)).rejects.toThrow(
      'Application target did not declare its Supabase identity.'
    );
    expect(close).toHaveBeenCalledOnce();
  });

  it('declares the configured Supabase identity in the served application shell', () => {
    const applicationShell = readFileSync(resolve(__dirname, '../../../index.html'), 'utf8');

    expect(applicationShell).toContain(
      '<meta name="myk9-supabase-origin" content="%VITE_SUPABASE_URL%" />'
    );
  });
});
