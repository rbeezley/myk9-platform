import { describe, expect, it } from 'vitest';

import {
  getReportScopeSearchParams,
  isReportScopeSupported,
  resolveReportScope,
} from '../reportScope';

describe('report scope', () => {
  it('resolves the narrowest complete invoking scope', () => {
    expect(resolveReportScope({ showId: 'show-1' })).toEqual({
      kind: 'show',
      showId: 'show-1',
    });
    expect(resolveReportScope({ showId: 'show-1', trialId: 'trial-1' })).toEqual({
      kind: 'trial',
      showId: 'show-1',
      trialId: 'trial-1',
    });
    expect(
      resolveReportScope({ showId: 'show-1', trialId: 'trial-1', classId: 'class-1' })
    ).toEqual({
      kind: 'class',
      showId: 'show-1',
      trialId: 'trial-1',
      classId: 'class-1',
    });
  });

  it('never invents a Class scope without its Trial', () => {
    expect(resolveReportScope({ showId: 'show-1', classId: 'class-1' })).toEqual({
      kind: 'show',
      showId: 'show-1',
    });
  });

  it('checks registry-supported scope and serializes only relevant ids', () => {
    const scope = {
      kind: 'class' as const,
      showId: 'show-1',
      trialId: 'trial-1',
      classId: 'class-1',
    };
    expect(isReportScopeSupported({ scopes: ['trial', 'class'] }, scope)).toBe(true);
    expect(isReportScopeSupported({ scopes: ['show'] }, scope)).toBe(false);
    expect(getReportScopeSearchParams(scope).toString()).toBe(
      'trialId=trial-1&classId=class-1'
    );
  });
});
