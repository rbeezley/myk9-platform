/**
 * Admins tab of the club members manager (MYK9-2209): who runs this club, add one by email,
 * remove one. Lives with the roster tabs because club admins are not always members, so the roster
 * cannot show them. Admins can open Payments and edit the club; the copy says so.
 */
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { UserMinus } from 'lucide-react';
import { useClubAdmins } from './useClubAdmins';
import { ClubAdminDialogs } from './ClubAdminDialogs';

interface ClubAdminsTabProps {
  clubId: string;
  clubName: string;
}

export const ClubAdminsTab: React.FC<ClubAdminsTabProps> = ({ clubId, clubName }) => {
  const {
    admins,
    isLoading,
    isOffline,
    isError,
    retry,
    addAdmin,
    isAdding,
    pendingRemoval,
    requestRemoval,
    cancelRemoval,
    confirmRemoval,
    isRemoving,
  } = useClubAdmins(clubId);
  const [email, setEmail] = useState('');

  // Adding grants real access (and may email a stranger), so the address is confirmed first.
  const [confirmingEmail, setConfirmingEmail] = useState<string | null>(null);

  const handleAdd = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = email.trim();
    if (trimmed) setConfirmingEmail(trimmed);
  };

  const confirmAdd = async () => {
    const target = confirmingEmail;
    setConfirmingEmail(null);
    if (!target) return;
    try {
      await addAdmin(target);
      setEmail('');
    } catch {
      // The hook already told the admin; keep the address so they can fix it.
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Club admins can edit the club, manage members, appoint secretaries and open Payments. Add
        someone by the email on their myK9 account and they become an admin at once.
      </p>

      <form onSubmit={handleAdd} className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-1.5">
          <label htmlFor="club-admin-email" className="text-sm font-medium text-foreground">
            Add an admin
          </label>
          <Input
            id="club-admin-email"
            type="email"
            autoComplete="off"
            placeholder="name@example.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="border-border"
          />
        </div>
        <Button type="submit" disabled={isAdding || !email.trim()}>
          {isAdding ? 'Adding...' : 'Add admin'}
        </Button>
      </form>

      {isOffline ? (
        <p role="status" className="text-sm text-muted-foreground">
          You are offline. Reconnect to see who has access.
        </p>
      ) : isLoading ? (
        <p role="status" className="text-sm text-muted-foreground">
          Loading admins...
        </p>
      ) : isError ? (
        <p role="status" className="text-sm text-warning">
          We couldn&apos;t load the admins list.{' '}
          <button type="button" onClick={retry} className="underline underline-offset-2">
            Try again
          </button>
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {admins.map(admin => (
            <li key={admin.personId} className="flex items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">
                  {admin.personName ?? admin.personEmail ?? 'Unnamed'}
                </p>
                {admin.personName && admin.personEmail && (
                  <p className="truncate text-xs text-muted-foreground">{admin.personEmail}</p>
                )}
              </div>
              <Button
                variant="outline"
                className="min-h-11 text-destructive"
                disabled={isRemoving}
                onClick={() => requestRemoval(admin)}
                aria-label={`Remove admin ${admin.personName ?? admin.personEmail ?? ''}`.trim()}
              >
                <UserMinus className="mr-2 h-4 w-4" />
                Remove admin
              </Button>
            </li>
          ))}
        </ul>
      )}

      <ClubAdminDialogs
        clubName={clubName}
        confirmingEmail={confirmingEmail}
        onCancelAdd={() => setConfirmingEmail(null)}
        onConfirmAdd={() => void confirmAdd()}
        pendingRemoval={pendingRemoval}
        onCancelRemoval={cancelRemoval}
        onConfirmRemoval={confirmRemoval}
      />
    </div>
  );
};
