import React, { useEffect, startTransition, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useUserSidebarStore } from '@/store/userSidebarStore';
// import { useDogStore } from '@/store/dogStore';
import { useUserStore, PersonInput } from '@/store/userStore';
import { useRoleBasedPeople, useCanAccessPerson } from '@/hooks/useRoleBasedData';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { UserEditPanel } from '@/components/panels/edit';
// import { useAuthContext } from '@/hooks/useAuthContext';

import UserSidebar from '@/components/users/UserDetails/UserSidebar/UserSidebar';
import UserDetailsView from '@/components/users/UserDetails/UserDetailsView';

/**
 * UserDetails page component following the standardized entity page pattern.
 * Each entity page has the same structure: sidebar, EntityPageLayout, and EntityCardContainer.
 */
const UserDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  // const [searchParams] = useSearchParams();
  
  // Mock data initialization disabled - using real user data only
  
  const people = useRoleBasedPeople(); // Use filtered people based on role
  // const dogs = useDogStore(state => state.dogs);
  const { setSelectedPersonId } = useUserSidebarStore();
  const { addUser } = useUserStore();
  
  // Dialog state
  const [showCreatePersonDialog, setShowCreatePersonDialog] = useState(false);
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    streetAddress: '',
    city: '',
    state: '',
    zipCode: '',
    profileImage: ''
  });
  // const { } = useAuthContext(); // Unused for now
  const canAccessPerson = useCanAccessPerson(id || '');
  
  // Get navigation context from URL parameters
  // const fromDogId = searchParams.get('fromDog');
  // const fromDog = fromDogId ? dogs.find(d => d.id === fromDogId) : undefined;
  
  
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
      console.warn(`User does not have access to person ${id}`);
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

  // Handle person deletion with proper navigation
  // const handleDeletePerson = () => {
  //   if (selectedUser) {
  //     // Remove person from store
  //     removePerson(selectedUser.id);
      
  //     // Navigate to appropriate page after deletion
  //     const remainingPeople = people.filter(p => p.id !== selectedUser.id);
  //     if (remainingPeople.length > 0) {
  //       // Navigate to first remaining person
  //       navigate(`/users/${remainingPeople[0].id}`, { replace: true });
  //     } else {
  //       // No people left, navigate to people list
  //       navigate('/users', { replace: true });
  //     }
  //   }
  // };

  // Handle creating a new person - moved to UserEditPanel onSave

  // Form data now managed by UserEditPanel

  return (
    <div className="flex min-h-screen bg-background">
      {/* Fixed sidebar with proper z-index */}
      <div className="fixed inset-y-0 left-0 z-[60] w-72 bg-card border-r border-border">
        <UserSidebar
          selectedPersonId={id || null}
          onAdd={() => setShowCreatePersonDialog(true)}
        />
      </div>
      
      {/* Main content area with proper left margin */}
      <main className="flex-1 overflow-auto ml-72 pt-16">
        {selectedUser ? (
          <UserDetailsView person={selectedUser} />
        ) : people.length === 0 ? (
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
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <div className="text-center">
              <p className="text-lg mb-2">No person selected</p>
              <p className="text-sm">Select a person from the sidebar to view details</p>
            </div>
          </div>
        )}
      </main>
      
      {/* Create User Dialog */}
      <UserEditPanel
        open={showCreatePersonDialog}
        onClose={() => setShowCreatePersonDialog(false)}
        userId=""
        userName="New User"
        initialUserData={{
          firstName: formData.firstName,
          lastName: formData.lastName,
          email: formData.email,
          phone: formData.phone,
          streetAddress: formData.streetAddress,
          city: formData.city,
          state: formData.state,
          zipCode: formData.zipCode,
          profileImage: formData.profileImage,
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
          
          try {
            const newUser = await addUser(newPersonInput);
            setShowCreatePersonDialog(false);
            
            // Reset form
            setFormData({
              firstName: '',
              lastName: '',
              email: '',
              phone: '',
              streetAddress: '',
              city: '',
              state: '',
              zipCode: '',
              profileImage: ''
            });
            
            // Navigate to the newly created person using the actual ID
            navigate(`/users/${newUser.id}`, { replace: true });
          } catch (error) {
            console.error('Failed to create user:', error);
            throw error;
          }
        }}
        enableAutoSave={false}
        showAdvancedFields={true}
      />
    </div>
  );
};

export default UserDetails;
