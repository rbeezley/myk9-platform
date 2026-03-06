import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCurrentUserPersonId } from '@/hooks/useRoleBasedData';

/**
 * Redirects /profile to /users/{currentUserPersonId}.
 * The UserDetailsView page handles both self-view and admin-view,
 * so a separate profile page is unnecessary.
 */
export default function ProfileRedirect() {
  const navigate = useNavigate();
  const personId = useCurrentUserPersonId();
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (personId) {
      navigate(`/users/${personId}`, { replace: true });
    }
  }, [personId, navigate]);

  useEffect(() => {
    const timer = setTimeout(() => setTimedOut(true), 5000);
    return () => clearTimeout(timer);
  }, []);

  if (timedOut && !personId) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-2">
          <p className="text-muted-foreground">Unable to load your profile.</p>
          <p className="text-sm text-muted-foreground">
            Your account may not have a linked profile yet. Please contact support.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="animate-pulse text-muted-foreground">Loading profile...</div>
    </div>
  );
}
