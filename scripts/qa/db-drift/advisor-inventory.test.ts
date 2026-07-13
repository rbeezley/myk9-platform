import { describe, expect, it } from 'vitest';

import {
  buildAdvisorSnapshot,
  classifyAdvisorEntries,
  findUnclassifiedRepositoryOwned,
  normalizeAdvisorLints,
  summarizeAdvisorEntries,
  type AdvisorInventoryConfig,
  type RawAdvisorResult,
} from './advisor-inventory';

describe('normalizeAdvisorLints', () => {
  it('normalizes a table-object lint into a schema.name identity', () => {
    const raw: RawAdvisorResult = {
      result: {
        lints: [
          {
            name: 'rls_enabled_no_policy',
            level: 'INFO',
            detail: 'Table `public.login_attempts` has RLS enabled, but no policies exist',
            metadata: { name: 'login_attempts', type: 'table', schema: 'public' },
          },
        ],
      },
    };

    expect(normalizeAdvisorLints(raw)).toEqual([
      {
        code: 'rls_enabled_no_policy',
        level: 'INFO',
        schema: 'public',
        objectName: 'login_attempts',
        identity: 'public.login_attempts',
        detail: 'Table `public.login_attempts` has RLS enabled, but no policies exist',
      },
    ]);
  });

  it('builds a type-only identity-argument signature for function overloads', () => {
    const raw: RawAdvisorResult = {
      lints: [
        {
          name: 'authenticated_security_definer_function_executable',
          level: 'WARN',
          detail: 'Function `public._account_ringside_show_id(p_route text)` ...',
          metadata: {
            name: '_account_ringside_show_id',
            schema: 'public',
            arguments: 'p_route text',
            security_definer: true,
          },
        },
        {
          name: 'authenticated_security_definer_function_executable',
          level: 'WARN',
          detail: 'Function `public._account_ringside_show_id(p_route text, p_id uuid)` ...',
          metadata: {
            name: '_account_ringside_show_id',
            schema: 'public',
            arguments: 'p_route text, p_id uuid',
            security_definer: true,
          },
        },
      ],
    };

    const identities = normalizeAdvisorLints(raw).map(entry => entry.identity);

    expect(identities).toEqual([
      'public._account_ringside_show_id(text, uuid)',
      'public._account_ringside_show_id(text)',
    ]);
  });

  it('sorts entries deterministically by identity then code so re-runs diff stably', () => {
    const raw: RawAdvisorResult = {
      lints: [
        { name: 'zzz_code', level: 'WARN', metadata: { name: 'b_table', schema: 'public' } },
        { name: 'aaa_code', level: 'WARN', metadata: { name: 'a_table', schema: 'public' } },
      ],
    };

    expect(normalizeAdvisorLints(raw).map(entry => entry.identity)).toEqual([
      'public.a_table',
      'public.b_table',
    ]);
  });

  it('falls back to INFO for an unrecognized level string', () => {
    const raw: RawAdvisorResult = {
      lints: [{ name: 'weird_code', level: 'notice', metadata: {} }],
    };

    expect(normalizeAdvisorLints(raw)[0]?.level).toBe('INFO');
  });

  it('returns an empty array when the raw payload has no lints', () => {
    expect(normalizeAdvisorLints({})).toEqual([]);
  });
});

describe('classifyAdvisorEntries', () => {
  const config: AdvisorInventoryConfig = {
    extensionOwnedObjects: ['pg_stat_statements'],
    extensionOwnedSchemas: ['extensions'],
    exceptionCodes: ['auth_allow_anonymous_sign_ins'],
  };

  it('classifies a public-schema table as repository-owned', () => {
    const [entry] = classifyAdvisorEntries(
      normalizeAdvisorLints({
        lints: [
          {
            name: 'rls_enabled_no_policy',
            level: 'INFO',
            metadata: { name: 'shows', schema: 'public' },
          },
        ],
      }),
      config
    );

    expect(entry.classification).toBe('repository-owned');
  });

  it('classifies an extensions-schema object as extension-owned', () => {
    const [entry] = classifyAdvisorEntries(
      normalizeAdvisorLints({
        lints: [
          {
            name: 'extension_in_public',
            level: 'WARN',
            metadata: { name: 'pg_trgm', schema: 'extensions' },
          },
        ],
      }),
      config
    );

    expect(entry.classification).toBe('extension-owned');
  });

  it('classifies a configured extension-owned object name in a repo schema as extension-owned', () => {
    const [entry] = classifyAdvisorEntries(
      normalizeAdvisorLints({
        lints: [
          {
            name: 'some_code',
            level: 'INFO',
            metadata: { name: 'pg_stat_statements', schema: 'public' },
          },
        ],
      }),
      config
    );

    expect(entry.classification).toBe('extension-owned');
  });

  it('classifies a project-level advisory with no object identity as repository-owned', () => {
    const [entry] = classifyAdvisorEntries(
      normalizeAdvisorLints({
        lints: [{ name: 'auth_allow_anonymous_sign_ins', level: 'WARN', metadata: {} }],
      }),
      config
    );

    expect(entry.classification).toBe('repository-owned');
  });

  it('classifies an unrecognized non-repo schema object as unclassified', () => {
    const [entry] = classifyAdvisorEntries(
      normalizeAdvisorLints({
        lints: [
          {
            name: 'some_code',
            level: 'WARN',
            metadata: { name: 'mystery', schema: 'timescaledb' },
          },
        ],
      }),
      config
    );

    expect(entry.classification).toBe('unclassified');
  });
});

describe('findUnclassifiedRepositoryOwned', () => {
  it('surfaces only unclassified entries', () => {
    const classified = classifyAdvisorEntries(
      normalizeAdvisorLints({
        lints: [
          { name: 'a', level: 'WARN', metadata: { name: 'shows', schema: 'public' } },
          { name: 'b', level: 'WARN', metadata: { name: 'mystery', schema: 'timescaledb' } },
        ],
      })
    );

    expect(findUnclassifiedRepositoryOwned(classified)).toEqual([
      expect.objectContaining({ identity: 'timescaledb.mystery', classification: 'unclassified' }),
    ]);
  });
});

describe('summarizeAdvisorEntries and buildAdvisorSnapshot', () => {
  it('counts entries by level and classification', () => {
    const classified = classifyAdvisorEntries(
      normalizeAdvisorLints({
        lints: [
          { name: 'a', level: 'ERROR', metadata: { name: 'shows', schema: 'public' } },
          { name: 'b', level: 'WARN', metadata: { name: 'entries', schema: 'public' } },
          { name: 'c', level: 'INFO', metadata: { name: 'pg_trgm', schema: 'extensions' } },
        ],
      })
    );

    expect(summarizeAdvisorEntries(classified)).toEqual({
      total: 3,
      byLevel: { ERROR: 1, WARN: 1, INFO: 1 },
      byClassification: { 'repository-owned': 2, 'extension-owned': 1, unclassified: 0 },
    });
  });

  it('builds a versioned snapshot with a fixed capturedAt for deterministic assertions', () => {
    const classified = classifyAdvisorEntries(
      normalizeAdvisorLints({
        lints: [{ name: 'a', level: 'WARN', metadata: { name: 'shows', schema: 'public' } }],
      })
    );

    expect(buildAdvisorSnapshot(classified, '2026-07-11T00:00:00.000Z')).toEqual({
      version: 1,
      capturedAt: '2026-07-11T00:00:00.000Z',
      summary: {
        total: 1,
        byLevel: { ERROR: 0, WARN: 1, INFO: 0 },
        byClassification: { 'repository-owned': 1, 'extension-owned': 0, unclassified: 0 },
      },
      entries: classified,
    });
  });
});
