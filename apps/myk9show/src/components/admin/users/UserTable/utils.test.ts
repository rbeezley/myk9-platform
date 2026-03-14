import { describe, it, expect } from 'vitest';
import type { User } from '@/types/user-types';
import { getUserStatus, getStatusConfig, getDeletedStatusConfig } from './utils';

describe('getUserStatus', () => {
  it('returns active for users with active status', () => {
    expect(getUserStatus({ status: 'active' } as User)).toBe('active');
  });

  it('returns suspended for suspended users', () => {
    expect(getUserStatus({ status: 'suspended' } as User)).toBe('suspended');
  });

  it('defaults to active when status is undefined', () => {
    expect(getUserStatus({} as User)).toBe('active');
  });
});

describe('getStatusConfig', () => {
  it('returns green config for active', () => {
    const config = getStatusConfig('active');
    expect(config.label).toBe('Active');
    expect(config.color).toBe('#34C759');
  });

  it('returns red config for suspended', () => {
    const config = getStatusConfig('suspended');
    expect(config.label).toBe('Suspended');
    expect(config.color).toBe('#EF4444');
  });

  it('defaults to active config for unknown status', () => {
    const config = getStatusConfig('unknown');
    expect(config.label).toBe('Active');
  });
});

describe('getDeletedStatusConfig', () => {
  it('returns gray config with Deleted label', () => {
    const config = getDeletedStatusConfig();
    expect(config.label).toBe('Deleted');
    expect(config.color).toBe('#8E8E93');
  });
});
