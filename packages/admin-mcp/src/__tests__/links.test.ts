import { describe, expect, it } from 'vitest';

import type { AdminMcpConfig } from '../config';
import { buildEntryManagementLink, buildShowLink } from '../diagnostics/links';

const CONFIG: AdminMcpConfig = {
  supabaseUrl: 'https://example.supabase.co',
  supabaseServiceRoleKey: 'service-role-key',
  appBaseUrl: 'https://app.myk9show.com',
  envLabel: 'staging',
  defaultLimit: 25,
  maxLimit: 50,
};

describe('buildShowLink', () => {
  it('points at the canonical show detail route', () => {
    expect(buildShowLink(CONFIG, 'show-123').url).toBe(
      'https://app.myk9show.com/shows/show-123',
    );
  });
});

describe('buildEntryManagementLink', () => {
  it('points at the show entry-management route', () => {
    expect(buildEntryManagementLink(CONFIG, 'show-123').url).toBe(
      'https://app.myk9show.com/shows/show-123/entry-management',
    );
  });

  it('appends the entry id as a query param when provided', () => {
    expect(buildEntryManagementLink(CONFIG, 'show-123', 'entry-9').url).toBe(
      'https://app.myk9show.com/shows/show-123/entry-management?entryId=entry-9',
    );
  });
});
