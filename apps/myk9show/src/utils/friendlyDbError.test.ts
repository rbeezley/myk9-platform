import { beforeEach, describe, expect, it, vi } from 'vitest';
import { friendlyDbError } from './friendlyDbError';
import { logger } from '@/services/LoggingService';

vi.mock('@/services/LoggingService', () => ({
  logger: {
    error: vi.fn(),
  },
}));

describe('friendlyDbError', () => {
  beforeEach(() => {
    vi.mocked(logger.error).mockClear();
  });

  it('maps RLS errors to safe user copy while logging raw details', () => {
    const message = friendlyDbError({
      code: '42501',
      message: 'new row violates row-level security policy for table "show_passcodes"',
      details: 'relation "show_passcodes" is protected',
    });

    expect(message).toBe("You don't have permission to make that change.");
    expect(message).not.toContain('show_passcodes');
    expect(message).not.toContain('relation');
    expect(logger.error).toHaveBeenCalledWith(
      'Database operation failed',
      'database',
      expect.objectContaining({
        code: '42501',
        message: 'new row violates row-level security policy for table "show_passcodes"',
        details: 'relation "show_passcodes" is protected',
      }),
      expect.any(Error)
    );
  });
});
