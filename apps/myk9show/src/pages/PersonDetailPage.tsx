import React, { useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useRoleBasedPeople, useCanAccessPerson } from '@/hooks/useRoleBasedData';
import { useUsersQuery } from '@/hooks/queries/useUsersQuery';
import UserDetailsView from '@/components/users/UserDetails/UserDetailsView';

/**
 * PersonDetailPage is a thin wrapper around UserDetailsView for the /users/:id route.
 * Loads the person from role-based data, checks access, and renders UserDetailsView.
 */
const PersonDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const people = useRoleBasedPeople();
  const { isLoading } = useUsersQuery();
  const canAccessPerson = useCanAccessPerson(id || '');

  const person = useMemo(() => {
    if (!id) return null;
    return people.find(p => p.id === id) || null;
  }, [people, id]);

  // Redirect to /users if person not found or no access after loading
  useEffect(() => {
    if (!isLoading && people.length > 0 && id) {
      if (!canAccessPerson || !people.find(p => p.id === id)) {
        navigate('/people', { replace: true });
      }
    }
  }, [isLoading, people, id, canAccessPerson, navigate]);

  if (isLoading || (people.length === 0 && !person)) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-pulse text-muted-foreground">Loading person...</div>
      </div>
    );
  }

  if (!person) return null;

  return <UserDetailsView person={person} />;
};

export default PersonDetailPage;
