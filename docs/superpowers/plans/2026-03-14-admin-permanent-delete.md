# Admin Permanent Delete + Auth Cleanup Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add permanent delete capability for site admins (alongside existing soft delete) and clean up Supabase `auth.users` entries when permanently deleting users.

**Architecture:** A new Supabase Edge Function (`admin-delete-user`) handles permanent deletion because deleting from `auth.users` requires the service role key (unavailable client-side). The client calls this Edge Function for permanent deletes. Soft delete remains client-side (existing behavior). A new `AdminDeleteUserDialog` component gives site admins a single dialog with soft/permanent options; non-admins continue seeing the existing `DeleteConfirmationDialog`.

**Tech Stack:** Supabase Edge Functions (Deno), React, React Query, Vitest

---

## File Structure

| Action | File                                                                      | Responsibility                                                              |
| ------ | ------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Create | `supabase/functions/admin-delete-user/index.ts`                           | Edge Function: verify SITE_ADMIN, hard-delete people row + auth.users entry |
| Create | `apps/myk9show/src/components/admin/users/AdminDeleteUserDialog.tsx`      | Dialog with soft/permanent radio options for site admins                    |
| Create | `apps/myk9show/src/components/admin/users/AdminDeleteUserDialog.test.tsx` | Tests for the new dialog                                                    |
| Modify | `apps/myk9show/src/services/database/queries/userQueries.ts`              | Add `permanentDeleteUser()` that calls the Edge Function                    |
| Modify | `apps/myk9show/src/hooks/queries/useUsersQuery.ts`                        | Add `usePermanentDeleteUserMutation` hook                                   |
| Modify | `apps/myk9show/src/components/admin/users/UserTable/index.tsx`            | Use `AdminDeleteUserDialog` for site admins                                 |
| Modify | `apps/myk9show/src/components/admin/users/BulkActionsBar.tsx`             | Use `AdminDeleteUserDialog` for site admins                                 |
| Modify | `apps/myk9show/src/components/admin/users/BulkActionsBar.test.tsx`        | Update tests for new admin delete flow                                      |

---

## Chunk 1: Edge Function

### Task 1: Create the `admin-delete-user` Edge Function

**Files:**

- Create: `supabase/functions/admin-delete-user/index.ts`

- [ ] **Step 1: Create the Edge Function**

Follow the CORS pattern from `apps/myk9show/supabase/functions/stripe-customer-portal/index.ts` (browser-invoked Edge Function). The function:

1. Authenticates caller via `Authorization` header
2. Verifies caller is SITE_ADMIN by checking `people.roles` contains `site_admin`
3. Looks up the target person's `auth_user_id`
4. Hard-deletes the `people` row (DB cascades handle dependent tables)
5. If `auth_user_id` exists, deletes the `auth.users` entry via `supabase.auth.admin.deleteUser()`

```typescript
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.49.1';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing required environment variables');
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// CORS configuration — same origins as other Edge Functions
const ALLOWED_ORIGINS = [
  'https://myk9show.com',
  'https://www.myk9show.com',
  'https://app.myk9show.com',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5173',
];

function getCorsHeaders(requestOrigin: string | null): Record<string, string> {
  const origin =
    requestOrigin && ALLOWED_ORIGINS.includes(requestOrigin) ? requestOrigin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
}

let _corsHeaders: Record<string, string> = getCorsHeaders(null);

function corsResponse(body: string | object | null, status = 200) {
  if (status === 204) {
    return new Response(null, { status, headers: _corsHeaders });
  }
  return new Response(JSON.stringify(body), {
    status,
    headers: { ..._corsHeaders, 'Content-Type': 'application/json' },
  });
}

interface DeleteRequest {
  personId: string;
}

Deno.serve(async req => {
  _corsHeaders = getCorsHeaders(req.headers.get('origin'));

  try {
    if (req.method === 'OPTIONS') {
      return corsResponse({}, 204);
    }

    if (req.method !== 'POST') {
      return corsResponse({ error: 'Method not allowed' }, 405);
    }

    // 1. Authenticate caller
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return corsResponse({ error: 'Missing Authorization header' }, 401);
    }

    const token = authHeader.replace('Bearer ', '');
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      console.error('Authentication failed:', authError);
      return corsResponse({ error: 'Authentication failed' }, 401);
    }

    // 2. Verify caller is SITE_ADMIN
    const { data: callerPerson, error: callerError } = await supabase
      .from('people')
      .select('id, roles')
      .eq('auth_user_id', user.id)
      .is('deleted_at', null)
      .single();

    if (callerError || !callerPerson) {
      return corsResponse({ error: 'Caller not found' }, 403);
    }

    const callerRoles: string[] = callerPerson.roles || [];
    if (!callerRoles.includes('site_admin')) {
      return corsResponse({ error: 'Insufficient permissions: site_admin required' }, 403);
    }

    // 3. Parse request
    const body: DeleteRequest = await req.json();
    const { personId } = body;

    if (!personId) {
      return corsResponse({ error: 'Missing required parameter: personId' }, 400);
    }

    // Prevent self-deletion
    if (personId === callerPerson.id) {
      return corsResponse({ error: 'Cannot delete your own account' }, 400);
    }

    // 4. Look up target person's auth_user_id
    // [NOTE] Intentionally does NOT filter by deleted_at — allows admins to
    // permanently purge soft-deleted users from the Data Lifecycle page
    const { data: targetPerson, error: targetError } = await supabase
      .from('people')
      .select('id, first_name, last_name, auth_user_id')
      .eq('id', personId)
      .single();

    if (targetError || !targetPerson) {
      return corsResponse({ error: 'User not found' }, 404);
    }

    // 5. Hard-delete the people row (CASCADE handles dependent tables)
    const { error: deleteError } = await supabase.from('people').delete().eq('id', personId);

    if (deleteError) {
      console.error('Failed to delete people row:', deleteError);
      return corsResponse({ error: 'Failed to delete user record' }, 500);
    }

    // 6. Delete auth.users entry if it exists
    if (targetPerson.auth_user_id) {
      const { error: authDeleteError } = await supabase.auth.admin.deleteUser(
        targetPerson.auth_user_id
      );

      if (authDeleteError) {
        // Log but don't fail — the people row is already deleted
        console.error('Failed to delete auth user (people row already removed):', authDeleteError);
      }
    }

    console.log(
      `User permanently deleted: ${targetPerson.first_name} ${targetPerson.last_name} (${personId}) by admin ${callerPerson.id}`
    );

    return corsResponse({
      success: true,
      deleted: {
        personId,
        authUserDeleted: !!targetPerson.auth_user_id,
      },
    });
  } catch (error: unknown) {
    console.error('Admin delete user error:', error);
    return corsResponse(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
});
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/admin-delete-user/index.ts
git commit -m "feat: add admin-delete-user Edge Function for permanent user deletion"
```

---

## Chunk 2: Client Service Layer

### Task 2: Add `permanentDeleteUser` to userQueries

**Files:**

- Modify: `apps/myk9show/src/services/database/queries/userQueries.ts` (after line 207)

- [ ] **Step 1: Add the permanent delete function**

Add after the existing `hardDeleteUser` function (line 207). This calls the Edge Function instead of doing a direct DB delete, because the Edge Function also handles `auth.users` cleanup.

```typescript
// Permanent delete user via Edge Function (deletes people row + auth.users entry)
// Requires site_admin role — enforced server-side
export const permanentDeleteUser = async (personId: string) => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase.functions.invoke('admin-delete-user', {
      body: { personId },
    });

    const duration = Date.now() - startTime;
    logQuery('user', 'permanent_delete', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'user', 'permanent_delete');
    }

    // Edge Function returns { error: string } on failure
    if (data?.error) {
      throw createDatabaseError(
        { message: data.error, code: data.code || 'EDGE_FUNCTION_ERROR' },
        'user',
        'permanent_delete'
      );
    }

    return { data: data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'user', 'permanent_delete');
    logQuery('user', 'permanent_delete', duration, dbError.message);
    return { data: null, error: dbError };
  }
};
```

- [ ] **Step 2: Commit**

```bash
git add apps/myk9show/src/services/database/queries/userQueries.ts
git commit -m "feat: add permanentDeleteUser query via Edge Function"
```

### Task 3: Add `usePermanentDeleteUserMutation` hook

**Files:**

- Modify: `apps/myk9show/src/hooks/queries/useUsersQuery.ts`

- [ ] **Step 1: Add import for `permanentDeleteUser`**

Update the import from `userQueries` (line 10) to include the new function:

```typescript
import {
  getAllUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  permanentDeleteUser,
  searchUsers,
  getUsersByRole,
  getUsersWithDogCounts,
  getUsersStatistics,
} from '@/services/database/queries/userQueries';
```

- [ ] **Step 2: Add `permanentDelete` to UserService**

Add after `UserService.delete` (after line 127):

```typescript
  permanentDelete: async (id: string): Promise<void> => {
    const result = await permanentDeleteUser(id);
    if (result.error) {
      throw new Error(result.error.message);
    }
  },
```

- [ ] **Step 3: Add the mutation hook**

Add after `useDeleteUserMutation` (after line 242):

```typescript
export function usePermanentDeleteUserMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id }: { id: string }) => UserService.permanentDelete(id),
    onSuccess: (_, variables) => {
      const deletedId = variables.id;
      queryClient.removeQueries({ queryKey: queryKeys.users.detail(deletedId) });

      queryClient.setQueryData(queryKeys.users.all, (oldData: User[] | undefined) => {
        if (!oldData) return [];
        return oldData.filter(user => user.id !== deletedId);
      });
    },
  });
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/myk9show/src/hooks/queries/useUsersQuery.ts
git commit -m "feat: add usePermanentDeleteUserMutation hook"
```

---

## Chunk 3: Admin Delete Dialog

### Task 4: Create `AdminDeleteUserDialog` component

**Files:**

- Create: `apps/myk9show/src/components/admin/users/AdminDeleteUserDialog.tsx`

This dialog gives site admins two options: soft delete (deactivate) or permanent delete. Non-admins should never see this dialog — they use the existing `DeleteConfirmationDialog`.

- [ ] **Step 1: Write the test file**

Create: `apps/myk9show/src/components/admin/users/AdminDeleteUserDialog.test.tsx`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AdminDeleteUserDialog } from './AdminDeleteUserDialog';

describe('AdminDeleteUserDialog', () => {
  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    onSoftDelete: vi.fn(),
    onPermanentDelete: vi.fn(),
    entityName: 'John Doe',
    isDeleting: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders with deactivate selected by default', () => {
    render(<AdminDeleteUserDialog {...defaultProps} />);

    expect(screen.getByText(/Delete User/)).toBeInTheDocument();
    expect(screen.getByText(/John Doe/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Deactivate/)).toBeChecked();
  });

  it('shows soft delete description when deactivate is selected', () => {
    render(<AdminDeleteUserDialog {...defaultProps} />);

    expect(screen.getByText(/can be restored later/i)).toBeInTheDocument();
  });

  it('shows permanent delete warning when permanently delete is selected', () => {
    render(<AdminDeleteUserDialog {...defaultProps} />);

    const permanentRadio = screen.getByLabelText(/Permanently delete/);
    fireEvent.click(permanentRadio);

    expect(screen.getByText(/cannot be undone/i)).toBeInTheDocument();
    expect(screen.getByText(/removes.*login account/i)).toBeInTheDocument();
  });

  it('calls onSoftDelete when deactivate is confirmed', () => {
    render(<AdminDeleteUserDialog {...defaultProps} />);

    const confirmButton = screen.getByRole('button', { name: /deactivate/i });
    fireEvent.click(confirmButton);

    expect(defaultProps.onSoftDelete).toHaveBeenCalledOnce();
    expect(defaultProps.onPermanentDelete).not.toHaveBeenCalled();
  });

  it('calls onPermanentDelete when permanent delete is confirmed', () => {
    render(<AdminDeleteUserDialog {...defaultProps} />);

    const permanentRadio = screen.getByLabelText(/Permanently delete/);
    fireEvent.click(permanentRadio);

    const confirmButton = screen.getByRole('button', { name: /permanently delete/i });
    fireEvent.click(confirmButton);

    expect(defaultProps.onPermanentDelete).toHaveBeenCalledOnce();
    expect(defaultProps.onSoftDelete).not.toHaveBeenCalled();
  });

  it('shows loading state during deletion', () => {
    render(<AdminDeleteUserDialog {...defaultProps} isDeleting={true} />);

    const confirmButton = screen.getByRole('button', { name: /deactivat/i });
    expect(confirmButton).toBeDisabled();
  });

  it('does not render when open is false', () => {
    render(<AdminDeleteUserDialog {...defaultProps} open={false} />);

    expect(screen.queryByText(/Delete User/)).not.toBeInTheDocument();
  });

  it('resets to deactivate mode when dialog reopens', () => {
    const { rerender } = render(<AdminDeleteUserDialog {...defaultProps} />);

    // Select permanent delete
    const permanentRadio = screen.getByLabelText(/Permanently delete/);
    fireEvent.click(permanentRadio);
    expect(permanentRadio).toBeChecked();

    // Close and reopen
    rerender(<AdminDeleteUserDialog {...defaultProps} open={false} />);
    rerender(<AdminDeleteUserDialog {...defaultProps} open={true} />);

    // Should reset to deactivate
    expect(screen.getByLabelText(/Deactivate/)).toBeChecked();
  });

  it('supports bulk mode with count', () => {
    render(
      <AdminDeleteUserDialog
        {...defaultProps}
        entityName="3 users"
        bulkCount={3}
      />
    );

    expect(screen.getByText(/3 users/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/myk9show && pnpm test -- --run src/components/admin/users/AdminDeleteUserDialog.test.tsx
```

Expected: FAIL (module not found)

- [ ] **Step 3: Create the dialog component**

```typescript
import React, { useState } from 'react';
import { AlertTriangle, Trash2, UserX } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';

type DeleteMode = 'soft' | 'permanent';

interface AdminDeleteUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSoftDelete: () => void;
  onPermanentDelete: () => void;
  entityName: string;
  isDeleting: boolean;
  bulkCount?: number;
}

export function AdminDeleteUserDialog({
  open,
  onOpenChange,
  onSoftDelete,
  onPermanentDelete,
  entityName,
  isDeleting,
  bulkCount,
}: AdminDeleteUserDialogProps) {
  const [mode, setMode] = useState<DeleteMode>('soft');

  // Reset to soft delete when dialog opens
  React.useEffect(() => {
    if (open) setMode('soft');
  }, [open]);

  const handleConfirm = () => {
    if (mode === 'soft') {
      onSoftDelete();
    } else {
      onPermanentDelete();
    }
  };

  const entityLabel = bulkCount ? `${bulkCount} users` : 'user';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trash2 className="h-5 w-5" />
            Delete {bulkCount ? 'Users' : 'User'}
          </DialogTitle>
          <DialogDescription>
            Choose how to delete <strong>{entityName}</strong>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Soft Delete Option */}
          <label
            className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-colors
              ${mode === 'soft' ? 'border-primary bg-primary/5' : 'border-border hover:border-border/80'}`}
          >
            <input
              type="radio"
              name="deleteMode"
              value="soft"
              checked={mode === 'soft'}
              onChange={() => setMode('soft')}
              className="mt-1"
              aria-label="Deactivate"
            />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <UserX className="h-4 w-4 text-orange-500" />
                <span className="font-medium">Deactivate</span>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                Hides the {entityLabel} from the system. Records are preserved and can be restored later.
              </p>
            </div>
          </label>

          {/* Permanent Delete Option */}
          <label
            className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-colors
              ${mode === 'permanent' ? 'border-destructive bg-destructive/5' : 'border-border hover:border-border/80'}`}
          >
            <input
              type="radio"
              name="deleteMode"
              value="permanent"
              checked={mode === 'permanent'}
              onChange={() => setMode('permanent')}
              className="mt-1"
              aria-label="Permanently delete"
            />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <Trash2 className="h-4 w-4 text-destructive" />
                <span className="font-medium">Permanently delete</span>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                Removes all data and the login account. This cannot be undone.
              </p>
            </div>
          </label>

          {/* Warning for permanent delete */}
          {mode === 'permanent' && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                This permanently removes <strong>{entityName}</strong>, all related data
                (dogs, entries, registrations), and their login account.
                This action cannot be undone.
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isDeleting}>
            Cancel
          </Button>
          <Button
            variant={mode === 'permanent' ? 'destructive' : 'default'}
            onClick={handleConfirm}
            disabled={isDeleting}
          >
            {isDeleting
              ? 'Deleting...'
              : mode === 'soft'
                ? 'Deactivate'
                : 'Permanently Delete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/myk9show && pnpm test -- --run src/components/admin/users/AdminDeleteUserDialog.test.tsx
```

Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/components/admin/users/AdminDeleteUserDialog.tsx apps/myk9show/src/components/admin/users/AdminDeleteUserDialog.test.tsx
git commit -m "feat: add AdminDeleteUserDialog with soft/permanent delete options"
```

---

## Chunk 4: Wire Into UserTable

### Task 5: Update UserTable to use AdminDeleteUserDialog for site admins

**Files:**

- Modify: `apps/myk9show/src/components/admin/users/UserTable/index.tsx`

- [ ] **Step 1: Add imports**

Add these imports to the top of the file:

```typescript
import { useAuthContext } from '@/hooks/useAuthContext';
import { usePermanentDeleteUserMutation } from '@/hooks/queries/useUsersQuery';
import { AdminDeleteUserDialog } from '../AdminDeleteUserDialog';
```

- [ ] **Step 2: Add the permanent delete mutation and auth context**

Inside the component, near the existing `deleteUser` setup (around lines 52-53), add:

```typescript
const { isAdmin } = useAuthContext();
const permanentDeleteMutation = usePermanentDeleteUserMutation();
```

- [ ] **Step 3: Add permanent delete handler**

Add a new handler alongside the existing `confirmDelete` (after line 148):

```typescript
const confirmPermanentDelete = async () => {
  if (!deleteTarget) return;
  setIsDeleting(true);
  try {
    await permanentDeleteMutation.mutateAsync({ id: deleteTarget.id });
    toast.success(
      `${deleteTarget.firstName} ${deleteTarget.lastName} has been permanently deleted`
    );
    setDeleteTarget(null);
  } catch {
    toast.error('Failed to permanently delete user');
  } finally {
    setIsDeleting(false);
  }
};
```

- [ ] **Step 4: Replace the delete dialog rendering**

Find the existing `DeleteConfirmationDialog` usage (around lines 207-214) and replace it with a conditional:

```typescript
{isAdmin ? (
  <AdminDeleteUserDialog
    open={!!deleteTarget}
    onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
    onSoftDelete={confirmDelete}
    onPermanentDelete={confirmPermanentDelete}
    entityName={deleteTarget ? `${deleteTarget.firstName} ${deleteTarget.lastName}` : ''}
    isDeleting={isDeleting}
  />
) : (
  <DeleteConfirmationDialog
    open={!!deleteTarget}
    onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
    onConfirm={confirmDelete}
    entityName={deleteTarget ? `${deleteTarget.firstName} ${deleteTarget.lastName}` : ''}
    entityType="User"
    isDeleting={isDeleting}
  />
)}
```

- [ ] **Step 5: Run typecheck**

```bash
pnpm typecheck
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/myk9show/src/components/admin/users/UserTable/index.tsx
git commit -m "feat: wire AdminDeleteUserDialog into UserTable for site admins"
```

> **[ADDED] Testing note:** UserTable has no existing test file. The admin dialog conditional is covered by the AdminDeleteUserDialog unit tests (Task 4) and manual verification (Task 8 Step 4). If a UserTable test file is created in the future, add cases for admin vs non-admin dialog rendering.

---

## Chunk 5: Wire Into BulkActionsBar

### Task 6: Update BulkActionsBar for admin permanent delete

**Files:**

- Modify: `apps/myk9show/src/components/admin/users/BulkActionsBar.tsx`

- [ ] **Step 1: Add imports**

```typescript
import { useAuthContext } from '@/hooks/useAuthContext';
import { usePermanentDeleteUserMutation } from '@/hooks/queries/useUsersQuery';
import { AdminDeleteUserDialog } from './AdminDeleteUserDialog';
```

- [ ] **Step 2: Add hooks inside the component**

Near the existing `deleteUserMutation` (line 102):

```typescript
const { isAdmin } = useAuthContext();
const permanentDeleteMutation = usePermanentDeleteUserMutation();
```

- [ ] **Step 3: Add permanent bulk delete handler**

Add after `handleCascadeDelete` (after line 294):

```typescript
// Handle bulk permanent delete
const handleBulkPermanentDelete = async () => {
  setIsProcessing(true);
  setError(null);

  try {
    const userIds = selectedUsers.map(u => u.id);
    logger.debug('Bulk permanent delete', 'admin', { userIds });

    const results = await Promise.allSettled(
      userIds.map(async userId => {
        await permanentDeleteMutation.mutateAsync({ id: userId });
        return userId;
      })
    );

    const succeeded = results
      .filter((r): r is PromiseFulfilledResult<string> => r.status === 'fulfilled')
      .map(r => r.value);
    const failed = results.filter(r => r.status === 'rejected');

    if (succeeded.length > 0) {
      logger.info('Successfully permanently deleted users', 'admin', {
        count: succeeded.length,
        userIds: succeeded,
      });
      onUsersDeleted?.(succeeded);
    }

    if (failed.length > 0) {
      const errorMessage = `${failed.length} of ${userIds.length} users failed to delete.`;
      logger.error('Partial failure in bulk permanent delete', 'admin', {
        succeeded: succeeded.length,
        failed: failed.length,
      });
      setError(errorMessage);
    } else {
      closeDialog();
    }

    onBulkComplete();
  } finally {
    setIsProcessing(false);
  }
};
```

- [ ] **Step 4: Replace the Delete Confirmation Dialog with conditional rendering**

Replace the "Delete Confirmation Dialog" section (the `<Dialog open={currentDialog === 'delete'}>` block, lines 570-618) with:

```typescript
{/* Delete Dialog — Admin sees soft/permanent options, others see standard confirmation */}
{isAdmin ? (
  <AdminDeleteUserDialog
    open={currentDialog === 'delete'}
    onOpenChange={() => closeDialog()}
    onSoftDelete={handleBulkDelete}
    onPermanentDelete={handleBulkPermanentDelete}
    entityName={selectedUsers
      .slice(0, 3)
      .map(u => `${u.user.firstName} ${u.user.lastName}`)
      .join(', ') + (selectedUsers.length > 3 ? ` and ${selectedUsers.length - 3} more` : '')}
    isDeleting={isProcessing}
    bulkCount={selectedUsers.length}
  />
) : (
  /* Keep the ENTIRE existing <Dialog open={currentDialog === 'delete'}> block
     from lines 570-618 of BulkActionsBar.tsx here verbatim — this is the
     standard delete confirmation dialog for non-admin users. Copy it as-is;
     do not modify it. */
)}
```

Keep the existing Cascade Delete Confirmation Dialog unchanged — it only appears after a soft delete attempt finds related data.

- [ ] **Step 5: Run typecheck**

```bash
pnpm typecheck
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/myk9show/src/components/admin/users/BulkActionsBar.tsx
git commit -m "feat: wire AdminDeleteUserDialog into BulkActionsBar for site admins"
```

### Task 7: Update BulkActionsBar tests

**Files:**

- Modify: `apps/myk9show/src/components/admin/users/BulkActionsBar.test.tsx`

- [ ] **Step 1: Add mock for useAuthContext and usePermanentDeleteUserMutation**

Add at the top of the test file, after the existing mock:

```typescript
import { useAuthContext } from '@/hooks/useAuthContext';

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: vi.fn(),
}));

const mockUseAuthContext = vi.mocked(useAuthContext);
```

Update the `useUsersQuery` mock to include the new mutation:

```typescript
vi.mock('@/hooks/queries/useUsersQuery', () => ({
  useDeleteUserMutation: vi.fn(),
  usePermanentDeleteUserMutation: vi.fn(),
}));
```

Add the new mock reference:

```typescript
import { usePermanentDeleteUserMutation } from '@/hooks/queries/useUsersQuery';
const mockUsePermanentDeleteUserMutation = vi.mocked(usePermanentDeleteUserMutation);
```

- [ ] **Step 2: Update beforeEach to configure auth mock**

In `beforeEach`, add:

```typescript
// Default to non-admin (existing tests stay the same)
mockUseAuthContext.mockReturnValue({
  user: null,
  userWithRoles: null,
  loading: false,
  signIn: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
  signInWithGoogle: vi.fn(),
  resetPassword: vi.fn(),
  updatePassword: vi.fn(),
  updateProfile: vi.fn(),
  hasRole: vi.fn().mockReturnValue(false),
  hasPermission: vi.fn().mockReturnValue(false),
  getUserRoles: vi.fn().mockReturnValue([]),
  switchUserRole: vi.fn(),
  checkPermissionAsync: vi.fn().mockResolvedValue(false),
  isAdmin: false,
  isSecretary: false,
  isExhibitor: false,
  isJudge: false,
  dbPermissions: [],
  dbRoles: [],
  rbacLoading: false,
  rbacError: null,
});

// Setup permanent delete mutation mock
mockUsePermanentDeleteUserMutation.mockReturnValue({
  mutateAsync: vi.fn(),
  mutate: vi.fn(),
  isPending: false,
  isError: false,
  error: null,
  data: undefined,
  reset: vi.fn(),
  isIdle: true,
  isSuccess: false,
  failureCount: 0,
  failureReason: null,
  isPaused: false,
  status: 'idle' as const,
  submittedAt: 0,
  variables: undefined,
  context: undefined,
});
```

- [ ] **Step 3: Add admin-specific test cases**

Add a new describe block:

```typescript
describe('Site Admin Delete', () => {
  beforeEach(() => {
    mockUseAuthContext.mockReturnValue({
      user: null,
      userWithRoles: null,
      loading: false,
      signIn: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn(),
      signInWithGoogle: vi.fn(),
      resetPassword: vi.fn(),
      updatePassword: vi.fn(),
      updateProfile: vi.fn(),
      hasRole: vi.fn().mockReturnValue(true),
      hasPermission: vi.fn().mockReturnValue(true),
      getUserRoles: vi.fn().mockReturnValue(['site_admin']),
      switchUserRole: vi.fn(),
      checkPermissionAsync: vi.fn().mockResolvedValue(true),
      isAdmin: true,
      isSecretary: false,
      isExhibitor: false,
      isJudge: false,
      dbPermissions: [],
      dbRoles: [],
      rbacLoading: false,
      rbacError: null,
    });
  });

  it('shows AdminDeleteUserDialog with soft/permanent options for admins', () => {
    render(<BulkActionsBar {...defaultProps} />);

    const deleteButton = screen.getByRole('button', { name: /delete/i });
    fireEvent.click(deleteButton);

    // Should show the admin dialog with radio options
    expect(screen.getByLabelText(/Deactivate/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Permanently delete/)).toBeInTheDocument();
  });

  it('calls soft delete when deactivate is chosen', async () => {
    mockMutateAsync.mockResolvedValue(undefined);

    render(<BulkActionsBar {...defaultProps} />);

    const deleteButton = screen.getByRole('button', { name: /delete/i });
    fireEvent.click(deleteButton);

    // Deactivate is default
    const confirmButton = screen.getByRole('button', { name: /deactivate/i });
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalled();
    });
  });

  it('calls permanent delete when permanently delete is chosen', async () => {
    const mockPermanentMutateAsync = vi.fn().mockResolvedValue(undefined);
    mockUsePermanentDeleteUserMutation.mockReturnValue({
      mutateAsync: mockPermanentMutateAsync,
      mutate: vi.fn(),
      isPending: false,
      isError: false,
      error: null,
      data: undefined,
      reset: vi.fn(),
      isIdle: true,
      isSuccess: false,
      failureCount: 0,
      failureReason: null,
      isPaused: false,
      status: 'idle' as const,
      submittedAt: 0,
      variables: undefined,
      context: undefined,
    });

    render(<BulkActionsBar {...defaultProps} />);

    const deleteButton = screen.getByRole('button', { name: /delete/i });
    fireEvent.click(deleteButton);

    const permanentRadio = screen.getByLabelText(/Permanently delete/);
    fireEvent.click(permanentRadio);

    const confirmButton = screen.getByRole('button', { name: /permanently delete/i });
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(mockPermanentMutateAsync).toHaveBeenCalledWith({ id: 'user-1' });
      expect(mockPermanentMutateAsync).toHaveBeenCalledWith({ id: 'user-2' });
    });
  });
});
```

- [ ] **Step 4: Run all BulkActionsBar tests**

```bash
cd apps/myk9show && pnpm test -- --run src/components/admin/users/BulkActionsBar.test.tsx
```

Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/components/admin/users/BulkActionsBar.test.tsx
git commit -m "test: update BulkActionsBar tests for admin delete flow"
```

---

## Chunk 6: Deploy & Verify

### Task 8: Deploy Edge Function and run full test suite

- [ ] **Step 1: Run full test suite**

```bash
cd apps/myk9show && pnpm test -- --run
```

Expected: All tests PASS

- [ ] **Step 2: Run typecheck and lint**

```bash
pnpm typecheck && pnpm lint
```

Expected: PASS

- [ ] **Step 3: Deploy the Edge Function**

```bash
supabase functions deploy admin-delete-user --no-verify-jwt
```

Note: `--no-verify-jwt` is used because the function handles auth internally (same pattern as all other Edge Functions in this project).

- [ ] **Step 4: Manual verification**

1. Open `localhost:5173/admin/users` as a site admin
2. Click delete on a test user — verify the dialog shows soft/permanent options
3. Test deactivate (soft delete) — user should disappear from list, be restorable from Data Lifecycle page
4. Test permanent delete — user should be fully removed (check Supabase dashboard to verify auth.users entry is also gone)
5. Test bulk delete with multiple users selected

- [ ] **Step 5: Commit any fixes from verification**

```bash
git add -A
git commit -m "fix: address issues found during manual verification"
```
