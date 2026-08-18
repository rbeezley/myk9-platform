import React, { useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useRoleBasedPeople, useCanAccessPerson } from '@/hooks/useRoleBasedData';
import { useDeletedUserQuery } from '@/hooks/queries/useUsersQuery';
import { useRBAC } from '@/hooks/useRBAC';
import UserDetailsView from '@/components/users/UserDetails/UserDetailsView';
import { DetailPageSkeleton } from '@/components/common/SkeletonLoaders';
import { ErrorState } from '@/components/common/ErrorState';
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
  const navigate = useNavigate();
  const { hasPermission } = useRBAC();

  const { people, isLoading } = useRoleBasedPeople();
  const canAccessPerson = useCanAccessPerson(id || '');

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
  const stillLooking = isLoading || (!livePerson && canReadRemoved && isLoadingRemoved);

  // A FAILED read is not a missing person. Redirecting on error turns a
  // transient network blip into "no such record" and throws away the URL the
  // admin was on, so the error gets its own state with a retry.
  const readFailed = Boolean(removedError) && !livePerson;

  // Redirect to the people browse page if person is not found or access is denied.
  useEffect(() => {
    if (stillLooking || readFailed || !id) return;
    if (!canAccessPerson || !person) {
      navigate('/people', { replace: true });
    }
  }, [stillLooking, readFailed, id, canAccessPerson, person, navigate]);

  if (stillLooking) {
    return <DetailPageSkeleton />;
  }

  if (readFailed) {
    return (
      <ErrorState
        message="Couldn't load this person."
        description={getUserFriendlyError(removedError, 'Check your connection and try again.')}
        onRetry={() => refetchRemoved()}
      />
    );
  }

  if (!person) return null;

  return <UserDetailsView person={person} />;
};

export default PersonDetailPage;
