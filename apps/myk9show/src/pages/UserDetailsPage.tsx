import { useCallback, useEffect, useMemo, startTransition, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useUserSidebarStore } from '@/store/userSidebarStore';
import { useUserStore, PersonInput } from '@/store/userStore';
import { useRoleBasedPeople, useCanAccessPerson } from '@/hooks/useRoleBasedData';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { UserEditPanel } from '@/components/panels/edit';
import { SidebarLayout } from '@/components/layout/SidebarLayout';
import { useSidebarLayoutState } from '@/hooks/useSidebarLayoutState';

import UserSidebar from '@/components/users/UserDetails/UserSidebar/UserSidebar';
import UserDetailsView from '@/components/users/UserDetails/UserDetailsView';
import { logger } from '@/services/LoggingService';

/**
 * UserDetails page component following the standardized entity page pattern.
 * Uses SidebarLayout for consistent sidebar behavior across the app.
 */
function UserDetails(): React.ReactElement {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const people = useRoleBasedPeople();
  const { setSelectedPersonId } = useUserSidebarStore();
  const { addUser } = useUserStore();

  // Dialog state
  const [showCreatePersonDialog, setShowCreatePersonDialog] = useState(false);
  const canAccessPerson = useCanAccessPerson(id || '');

  // Sidebar state management using the shared hook
  const { mobileOpen, setMobileOpen, closeMobile } = useSidebarLayoutState();

  // Memoize callbacks to prevent UserSidebar re-renders
  const handleOpenCreatePersonDialog = useCallback(() => {
    setShowCreatePersonDialog(true);
  }, []);

  // Find the selected person
  const selectedUser = id ? people.find(person => person.id === id) : null;

  // Update the selected person ID in the sidebar store when the URL param changes
  useEffect(() => {
    setSelectedPersonId(id || null);
  }, [id, setSelectedPersonId]);

  // If ID is provided but person not found or not accessible, navigate to the first person
  useEffect(() => {
    // Check if user has access to the requested person
    if (id && !canAccessPerson) {
      // User doesn't have access to this person
      logger.warn(`User does not have access to person ${id}`, 'pages', {});
      if (people.length > 0) {
        navigate(`/users/${people[0].id}`, { replace: true });
      }
      return;
    }

    if (id && !selectedUser && people.length > 0) {
      startTransition(() => {
        navigate(`/users/${people[0].id}`);
      });
    }
  }, [id, selectedUser, people, navigate, canAccessPerson]);

  // Memoize sidebar content to prevent unnecessary re-renders
  const sidebarContent = useMemo(() => (
    <UserSidebar
      selectedPersonId={id || null}
      onAdd={handleOpenCreatePersonDialog}
      onCloseMobile={closeMobile}
    />
  ), [id, handleOpenCreatePersonDialog, closeMobile]);

  // Render main content based on data state
  const renderContent = () => {
    if (selectedUser) {
      return <UserDetailsView person={selectedUser} />;
    }

    if (people.length === 0) {
      return (
        <div className="flex items-center justify-center h-full text-muted-foreground">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-foreground mb-4">No Users Available</h1>
            <p className="text-muted-foreground mb-6">
              Get started by adding people to your directory to manage contacts, judges, and exhibitors.
            </p>
            <Button
              onClick={() => setShowCreatePersonDialog(true)}
              className="flex items-center gap-2"
            >
              <Plus className="h-4 w-4" />
              Add User
            </Button>
          </div>
        </div>
      );
    }

    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <div className="text-center">
          <p className="text-lg mb-2">No person selected</p>
          <p className="text-sm">Select a person from the sidebar to view details</p>
        </div>
      </div>
    );
  };

  return (
    <>
      <SidebarLayout
        sidebar={sidebarContent}
        sidebarWidth={288} // w-72 = 18rem = 288px
        mobileMenuLabel="Users Menu"
        mobileOpen={mobileOpen}
        onMobileOpenChange={setMobileOpen}
      >
        {renderContent()}
      </SidebarLayout>

      {/* Create User Dialog */}
      <UserEditPanel
        open={showCreatePersonDialog}
        onClose={() => setShowCreatePersonDialog(false)}
        userId=""
        userName="New User"
        initialUserData={{
          firstName: '',
          lastName: '',
          email: '',
          phone: '',
          streetAddress: '',
          city: '',
          state: '',
          zipCode: '',
          profileImage: '',
          judgeQualifications: [],
          roles: [],
        }}
        onSave={async (userData) => {
          const newPersonInput: PersonInput = {
            firstName: userData.firstName || '',
            lastName: userData.lastName || '',
            email: userData.email || '',
            phone: userData.phone || '',
            address: {
              street: userData.streetAddress || '',
              city: userData.city || '',
              state: userData.state || '',
              zipCode: userData.zipCode || ''
            }
          };

          const newUser = await addUser(newPersonInput);
          setShowCreatePersonDialog(false);
          navigate(`/users/${newUser.id}`, { replace: true });
        }}
        enableAutoSave={false}
        showAdvancedFields={true}
      />
    </>
  );
};

export default UserDetails;
