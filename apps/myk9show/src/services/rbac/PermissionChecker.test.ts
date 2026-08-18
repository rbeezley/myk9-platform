import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockRpc } = vi.hoisted(() => ({
  mockRpc: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: mockRpc,
  },
}));

import { isTransientBrowserFetchError, PermissionChecker } from './PermissionChecker';

const EMPTY_RESPONSES: Record<string, unknown[]> = {
  get_user_permissions: [],
  get_user_roles: [],
  get_effective_permissions: [],
};

function mockSuccessfulAccessLoad(
  overrides: Partial<Record<keyof typeof EMPTY_RESPONSES, unknown[]>> = {}
) {
  mockRpc.mockImplementation((name: keyof typeof EMPTY_RESPONSES) =>
    Promise.resolve({
      data: overrides[name] ?? EMPTY_RESPONSES[name],
      error: null,
    })
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSuccessfulAccessLoad();
});

describe('isTransientBrowserFetchError', () => {
  it.each([
    [
      'AbortError name',
      Object.assign(new Error('The operation was aborted'), { name: 'AbortError' }),
    ],
    ['abort message', new Error('The signal is aborted without reason')],
    ['browser fetch failure', new Error('TypeError: Failed to fetch')],
    // Offline fetch rejections are browser-specific: Chrome says "Failed to
    // fetch", Safari "Load failed", Firefox "NetworkError when attempting to
    // fetch resource" — all three must count as transient (MYK9-200).
    ['Safari offline failure', new Error('TypeError: Load failed')],
    ['Firefox offline failure', new Error('NetworkError when attempting to fetch resource.')],
  ])('returns true for %s', (_name, error) => {
    expect(isTransientBrowserFetchError(error)).toBe(true);
  });

  it.each([
    ['null', null],
    ['plain object', { message: 'Failed to fetch' }],
    ['unrelated error', new Error('permission denied')],
  ])('returns false for %s', (_name, error) => {
    expect(isTransientBrowserFetchError(error)).toBe(false);
  });
});

describe('PermissionChecker complete-access cache', () => {
  it('coalesces concurrent loads for the same user into one RPC sequence', async () => {
    let resolvePermissions: ((value: { data: unknown[]; error: null }) => void) | undefined;
    mockRpc.mockImplementation((name: keyof typeof EMPTY_RESPONSES) => {
      if (name === 'get_user_permissions') {
        return new Promise(resolve => {
          resolvePermissions = resolve;
        });
      }
      return Promise.resolve({ data: [], error: null });
    });
    const checker = new PermissionChecker();

    const first = checker.getUserPermissions('user-1');
    const second = checker.getUserPermissions('user-1');

    expect(mockRpc).toHaveBeenCalledTimes(1);
    resolvePermissions?.({ data: [], error: null });
    await Promise.all([first, second]);
    expect(mockRpc).toHaveBeenCalledTimes(3);
  });

  it('reuses a successful complete-access result for five minutes', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-29T12:00:00Z'));
    const checker = new PermissionChecker();

    await checker.getUserPermissions('user-1');
    vi.setSystemTime(new Date('2026-07-29T12:04:59Z'));
    await checker.getUserPermissions('user-1');

    expect(mockRpc).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });

  it('does not cache a failed complete-access load', async () => {
    mockRpc.mockRejectedValueOnce(new Error('network unavailable'));
    const checker = new PermissionChecker();

    await expect(checker.getUserPermissions('user-1')).rejects.toThrow('network unavailable');
    mockSuccessfulAccessLoad();
    await checker.getUserPermissions('user-1');

    expect(mockRpc).toHaveBeenCalledTimes(4);
  });

  it('isolates complete-access results by user id', async () => {
    const checker = new PermissionChecker();

    await checker.getUserPermissions('user-1');
    await checker.getUserPermissions('user-2');

    expect(mockRpc).toHaveBeenCalledTimes(6);
  });

  it('invalidates a complete-access result through clearUserCache', async () => {
    const checker = new PermissionChecker();

    await checker.getUserPermissions('user-1');
    checker.clearUserCache('user-1');
    await checker.getUserPermissions('user-1');

    expect(mockRpc).toHaveBeenCalledTimes(6);
  });

  it('does not let an in-flight result repopulate the cache after clearAllCache', async () => {
    let resolvePermissions: ((value: { data: unknown[]; error: null }) => void) | undefined;
    mockRpc.mockImplementation((name: keyof typeof EMPTY_RESPONSES) => {
      if (name === 'get_user_permissions') {
        return new Promise(resolve => {
          resolvePermissions = resolve;
        });
      }
      return Promise.resolve({ data: [], error: null });
    });
    const checker = new PermissionChecker();

    const staleLoad = checker.getUserPermissions('user-1');
    checker.clearAllCache();
    resolvePermissions?.({ data: [], error: null });
    await staleLoad;

    mockSuccessfulAccessLoad();
    await checker.getUserPermissions('user-1');

    expect(mockRpc).toHaveBeenCalledTimes(6);
  });

  it('maps the RPC scope_type and scope_id fields exactly', async () => {
    mockSuccessfulAccessLoad({
      get_user_permissions: [
        {
          permission_id: 'permission-1',
          permission_code: 'show:manage',
          permission_name: 'Manage shows',
          description: 'Manage a show',
          category: 'show',
          role_id: 'role-1',
          role_name: 'secretary',
          scope_type: 'show',
          scope_id: 'show-123',
        },
      ],
      get_effective_permissions: [
        {
          permission_code: 'show:create',
          permission_name: 'Create shows',
          source_type: 'inherited',
          source_role: 'secretary (via :manage)',
          scope_type: 'club',
          scope_id: 'club-123',
        },
      ],
    });
    const checker = new PermissionChecker();

    const result = await checker.getUserPermissions('user-1');

    expect(result.permissions[0]).toMatchObject({
      permission_id: 'permission-1',
      role_id: 'role-1',
      scope_type: 'show',
      scope_id: 'show-123',
    });
    expect(result.effectivePermissionScopes).toEqual([
      {
        permission_code: 'show:create',
        scope_type: 'club',
        scope_id: 'club-123',
      },
    ]);
  });
});

describe('PermissionChecker single-permission cache', () => {
  it('does not let an in-flight result repopulate the cache after user invalidation', async () => {
    let resolvePermission: ((value: { data: boolean; error: null }) => void) | undefined;
    mockRpc.mockImplementation(
      () =>
        new Promise(resolve => {
          resolvePermission = resolve;
        })
    );
    const checker = new PermissionChecker();

    const staleCheck = checker.checkPermission('user-1', 'show:manage');
    checker.clearUserCache('user-1');
    resolvePermission?.({ data: true, error: null });
    await expect(staleCheck).resolves.toBe(true);

    mockRpc.mockResolvedValue({ data: false, error: null });
    await expect(checker.checkPermission('user-1', 'show:manage')).resolves.toBe(false);
    expect(mockRpc).toHaveBeenCalledTimes(2);
  });

  it('does not let an in-flight result repopulate the cache after global invalidation', async () => {
    let resolvePermission: ((value: { data: boolean; error: null }) => void) | undefined;
    mockRpc.mockImplementation(
      () =>
        new Promise(resolve => {
          resolvePermission = resolve;
        })
    );
    const checker = new PermissionChecker();

    const staleCheck = checker.checkPermission('user-1', 'show:manage');
    checker.clearAllCache();
    resolvePermission?.({ data: true, error: null });
    await expect(staleCheck).resolves.toBe(true);

    mockRpc.mockResolvedValue({ data: false, error: null });
    await expect(checker.checkPermission('user-1', 'show:manage')).resolves.toBe(false);
    expect(mockRpc).toHaveBeenCalledTimes(2);
  });
});
