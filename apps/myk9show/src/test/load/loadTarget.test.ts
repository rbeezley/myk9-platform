import { describe, expect, it } from 'vitest';
import { resolveLoadTarget } from './loadTarget';

describe('load target preflight', () => {
  it('accepts the established disposable local target', () => {
    expect(
      resolveLoadTarget({
        mode: 'isolated',
        baseUrl: 'http://127.0.0.1:4173',
        supabaseUrl: 'http://127.0.0.1:54321',
        projectRef: 'local',
        approvedProjectRefs: ['local'],
      })
    ).toMatchObject({
      mode: 'isolated',
      projectRef: 'local',
      gateEligible: false,
    });
  });

  it.each([
    {
      name: 'missing mode',
      input: {
        mode: undefined,
        baseUrl: 'http://127.0.0.1:4173',
        supabaseUrl: 'http://127.0.0.1:54321',
        projectRef: 'local',
        approvedProjectRefs: ['local'],
      },
    },
    {
      name: 'unknown cloud project',
      input: {
        mode: 'staging',
        baseUrl: 'https://preview.example.test',
        supabaseUrl: 'https://unknown.supabase.co',
        projectRef: 'unknown',
        approvedProjectRefs: [],
      },
    },
    {
      name: 'mismatched cloud host',
      input: {
        mode: 'e2e',
        baseUrl: 'https://preview.example.test',
        supabaseUrl: 'https://different.supabase.co',
        projectRef: 'approved',
        approvedProjectRefs: ['approved'],
        cloudApproved: true,
        computeTier: 'Small',
      },
    },
  ])('rejects $name before load', ({ input }) => {
    expect(() => resolveLoadTarget(input)).toThrow();
  });

  it('requires an explicit cloud approval and compute tier', () => {
    expect(() =>
      resolveLoadTarget({
        mode: 'e2e',
        baseUrl: 'https://preview.example.test',
        supabaseUrl: 'https://approved.supabase.co',
        projectRef: 'approved',
        approvedProjectRefs: ['approved'],
      })
    ).toThrow(/approval/i);
  });
});
