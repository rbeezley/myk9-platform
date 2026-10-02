import React, { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useRoleBasedPeople, usePersonAccess } from '@/hooks/useRoleBasedData';
import { useDeletedUserQuery } from '@/hooks/queries/useUsersQuery';
import { useRBAC } from '@/hooks/useRBAC';
import UserDetailsView from '@/components/users/UserDetails/UserDetailsView';
import { DetailPageSkeleton } from '@/components/common/SkeletonLoaders';
import { ErrorState } from '@/components/common/ErrorState';
import { NotFoundState } from '@/components/common/NotFoundState';
import { resolveDetailPageState } from './detailPageState';
import { PageShell } from '@/components/common/PageShell';
import { getUserFriendlyError } from '@/utils/errorMessages';

/**
 * PersonDetailPage is a thin wrapper around UserDetailsView for the /people/:id route.
 * Loads the person from role-based data, checks access, and renders UserDetailsView.
 *
 * A REMOVED person is not in role-based data — `people_select` is
 * `deleted_at IS NULL`, so they are invisible to every role — and this page used
 * to bounce to /people rather than say so. An admin now falls through to the
 * admin-gated removed-person read, so the record stays reachable while it is in
 * the restore queue (MYK9-153). Everyone else still bounces.
 */
const PersonDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { hasPermission } = useRBAC();

  const { people, isLoading, error: rosterError, refetch: refetchRoster } = useRoleBasedPeople();
  const access = usePersonAccess(id || '');

  const livePerson = useMemo(() => {
    if (!id) return null;
    return people.find(p => p.id === id) || null;
  }, [people, id]);

  // Only asked once the live lookup has finished and come up empty, so an
  // ordinary page load costs no extra request.
  const canReadRemoved = hasPermission('admin:manage');
  const {
    data: removedPerson,
    isLoading: isLoadingRemoved,
    error: removedError,
    refetch: refetchRemoved,
  } = useDeletedUserQuery(id || '', !isLoading && !livePerson && canReadRemoved);

  const person = livePerson ?? removedPerson ?? null;

  // A FAILED read is not a missing person, and an empty roster is not an answer until the
  // viewer's identity has resolved. The state is decided in ONE place (`detailPageState`):
  // a read failure always wins, so its retry is reachable. A person already in hand keeps
  // the page up (the error then belongs to a background refresh).
  const readError = (removedError ?? rosterError) as Error | null;
  const state = resolveDetailPageState({
    identity: access === 'unresolved' ? 'unresolved' : 'resolved',
    read:
      readError && !person
        ? 'error'
        : isLoading || (!livePerson && canReadRemoved && isLoadingRemoved)
          ? 'loading'
          : 'success',
    recordPresent: !!id && !!person,
    access: access === 'denied' ? 'denied' : 'allowed',
  });

  switch (state) {
    case 'loading':
      return <DetailPageSkeleton />;
    case 'error':
      return (
        <PageShell>
          <ErrorState
            message="Couldn't load this person."
            description={getUserFriendlyError(readError, 'Check your connection and try again.')}
            onRetry={() => {
              if (removedError) void refetchRemoved();
              if (rosterError) void refetchRoster?.();
            }}
          />
        </PageShell>
      );
    case 'denied':
      return (
        <PageShell>
          <NotFoundState
            entityName="Person"
            heading="You can't open this person"
            description="This record belongs to someone else, so it isn't available to you."
            backTo="/people"
            backLabel="Back to People"
          />
        </PageShell>
      );
    case 'notFound':
      return (
        <PageShell>
          <NotFoundState entityName="Person" backTo="/people" backLabel="Back to People" />
        </PageShell>
      );
    case 'ready':
      return person ? <UserDetailsView person={person} /> : null;
  }
};

export default PersonDetailPage;
