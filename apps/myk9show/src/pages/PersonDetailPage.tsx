import React, { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useRoleBasedPeople, usePersonAccess } from '@/hooks/useRoleBasedData';
import { useDeletedUserQuery } from '@/hooks/queries/useUsersQuery';
import { useRBAC } from '@/hooks/useRBAC';
import UserDetailsView from '@/components/users/UserDetails/UserDetailsView';
import { DetailPageSkeleton } from '@/components/common/SkeletonLoaders';
import { ErrorState } from '@/components/common/ErrorState';
import { NotFoundState } from '@/components/common/NotFoundState';
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
  // An unresolved viewer identity is "still looking" too: useRoleBasedPeople returns an
  // empty roster until it resolves, and an empty roster must not read as "no such person".
  const stillLooking =
    isLoading || access === 'unresolved' || (!livePerson && canReadRemoved && isLoadingRemoved);

  // A FAILED read is not a missing person. Redirecting on error turns a
  // transient network blip into "no such record" and throws away the URL the
  // admin was on, so the error gets its own state with a retry. The roster read
  // failing is the same shape: it returns an empty roster, not an answer.
  const readError = (removedError ?? rosterError) as Error | null;
  const readFailed = Boolean(readError) && !livePerson;

  // A record the viewer may not open says so; a person that is on no roster is the shared
  // Not Found state (MYK9-930, audit H8), not a silent bounce to the list. A read that is
  // still running or has failed is neither (see above).
  const personDenied = !stillLooking && !readFailed && access === 'denied';
  const personNotFound = !stillLooking && !readFailed && !personDenied && !!id && !person;

  if (stillLooking) {
    return <DetailPageSkeleton />;
  }

  if (readFailed) {
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
  }

  if (personDenied) {
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
  }

  if (personNotFound) {
    return (
      <PageShell>
        <NotFoundState entityName="Person" backTo="/people" backLabel="Back to People" />
      </PageShell>
    );
  }

  if (!person) return null;

  return <UserDetailsView person={person} />;
};

export default PersonDetailPage;
