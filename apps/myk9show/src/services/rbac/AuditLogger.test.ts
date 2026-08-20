import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuditLogger } from './AuditLogger';
import { ActionType } from '@/types/rbac-types';
import { mockSupabase, resetMockSupabase } from '@/test/mocks/supabase';
import { logger } from '@/services/LoggingService';

// AuditLogger reads/writes via the module-level `supabase` client, which is
// globally mocked to `mockSupabase` in src/test/setup.ts (@/lib/supabase).

beforeEach(() => {
  resetMockSupabase();
  vi.clearAllMocks();
});

describe('AuditLogger.logAuditEvent — actor resolution', () => {
  it('resolves the acting auth user to their people.id before inserting, not the auth uid', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: 'auth-uid-123' } },
      error: null,
    });

    const insertSpy = vi.fn().mockResolvedValue({ data: null, error: null });
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'people') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockImplementation((column: string, value: string) => {
              expect(column).toBe('auth_user_id');
              expect(value).toBe('auth-uid-123');
              return {
                maybeSingle: vi
                  .fn()
                  .mockResolvedValue({ data: { id: 'people-id-456' }, error: null }),
              };
            }),
          }),
        };
      }
      if (table === 'permission_audit_log') {
        return { insert: insertSpy };
      }
      throw new Error(`Unexpected table: ${table}`);
    });

    const auditLogger = new AuditLogger();
    await auditLogger.logAuditEvent(ActionType.ROLE_CREATED, {
      targetId: 'role-1',
      targetType: 'role',
    });

    expect(insertSpy).toHaveBeenCalledTimes(1);
    const insertedRow = insertSpy.mock.calls[0][0];
    expect(insertedRow.user_id).toBe('people-id-456');
    expect(insertedRow.user_id).not.toBe('auth-uid-123');
  });

  it('inserts a null user_id when no people row matches the auth user (does not guess or drop the write)', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: 'auth-uid-orphan' } },
      error: null,
    });

    const insertSpy = vi.fn().mockResolvedValue({ data: null, error: null });
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'people') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
        };
      }
      if (table === 'permission_audit_log') {
        return { insert: insertSpy };
      }
      throw new Error(`Unexpected table: ${table}`);
    });

    const auditLogger = new AuditLogger();
    await auditLogger.logAuditEvent(ActionType.ROLE_CREATED, { targetId: 'role-1' });

    expect(insertSpy).toHaveBeenCalledTimes(1);
    expect(insertSpy.mock.calls[0][0].user_id).toBeNull();
  });

  it('skips the people lookup entirely when there is no authenticated user', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null }, error: null });

    const insertSpy = vi.fn().mockResolvedValue({ data: null, error: null });
    const peopleSelect = vi.fn();
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'people') {
        return { select: peopleSelect };
      }
      if (table === 'permission_audit_log') {
        return { insert: insertSpy };
      }
      throw new Error(`Unexpected table: ${table}`);
    });

    const auditLogger = new AuditLogger();
    await auditLogger.logAuditEvent(ActionType.ROLE_CREATED, { targetId: 'role-1' });

    expect(peopleSelect).not.toHaveBeenCalled();
    expect(insertSpy.mock.calls[0][0].user_id).toBeNull();
  });
});

describe('AuditLogger.logAuditEvent — insert failure visibility', () => {
  it('logs the insert error via logger.error instead of swallowing it silently', async () => {
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});

    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null }, error: null });
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'permission_audit_log') {
        return {
          insert: vi
            .fn()
            .mockResolvedValue({ data: null, error: { message: 'FK violation on user_id' } }),
        };
      }
      return { select: vi.fn().mockReturnValue({ eq: vi.fn() }) };
    });

    const auditLogger = new AuditLogger();
    await auditLogger.logAuditEvent(ActionType.ROLE_CREATED, { targetId: 'role-1' });

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const [message, , , loggedError] = errorSpy.mock.calls[0];
    expect(message).toMatch(/audit log insert failed/i);
    expect((loggedError as Error).message).toContain('FK violation on user_id');
  });

  it('never throws out of logAuditEvent even when the insert fails', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null }, error: null });
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'permission_audit_log') {
        return {
          insert: vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } }),
        };
      }
      return { select: vi.fn().mockReturnValue({ eq: vi.fn() }) };
    });

    const auditLogger = new AuditLogger();
    await expect(
      auditLogger.logAuditEvent(ActionType.ROLE_CREATED, { targetId: 'role-1' })
    ).resolves.toBeUndefined();
  });
});

describe('AuditLogger.getAuditLogs — target-type filter', () => {
  it('applies target_type=role to the query when targetType is passed', async () => {
    const eqSpy = vi.fn().mockReturnValue({
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    });
    const orderSpy = vi.fn().mockReturnValue({ eq: eqSpy });
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'permission_audit_log') {
        return { select: vi.fn().mockReturnValue({ order: orderSpy }) };
      }
      throw new Error(`Unexpected table: ${table}`);
    });

    const auditLogger = new AuditLogger();
    await auditLogger.getAuditLogs({ limit: 200, targetType: 'role' });

    expect(eqSpy).toHaveBeenCalledWith('target_type', 'role');
  });

  it('does not filter by target_type when none is passed', async () => {
    const limitSpy = vi.fn().mockResolvedValue({ data: [], error: null });
    const orderSpy = vi.fn().mockReturnValue({ limit: limitSpy, eq: vi.fn() });
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'permission_audit_log') {
        return { select: vi.fn().mockReturnValue({ order: orderSpy }) };
      }
      throw new Error(`Unexpected table: ${table}`);
    });

    const auditLogger = new AuditLogger();
    await auditLogger.getAuditLogs({ limit: 200 });

    expect(limitSpy).toHaveBeenCalledWith(200);
  });
});
