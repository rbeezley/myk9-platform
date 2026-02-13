import React, { useState } from 'react';
import { User, Dog } from '../../types/dog-types';
import { JudgeQualification } from '../../types/judge-types';
import UserTable from './UserTable';
import { UserEditPanel } from '../panels/edit';
import DeletePersonDialog from './DeletePersonDialog';
import PersonDetailsDialog from './PersonDetailsDialog';
import { JudgeQualificationPanel } from '../../components/panels/edit';
import { useUserStore } from '../../store/userStore';
import { useDogStore } from '../../store/dogStore';
import { useUsers, useAddPerson, useUpdatePerson, useDeletePerson } from '../../hooks/useUsers';
import { logger } from '@/services/LoggingService';

const UserListPage: React.FC = () => {
  // State hooks
  const { data: people, isLoading, error } = useUsers();
  const dogs = useDogStore((state) => state.dogs);
  const addPersonMutation = useAddPerson();
  const updatePersonMutation = useUpdatePerson();
  const deletePersonMutation = useDeletePerson();
const isAddPersonDialogOpen = useUserStore(state => state.isAddPersonDialogOpen);
const setIsAddPersonDialogOpen = useUserStore(state => state.setIsAddPersonDialogOpen);
const isEditPersonDialogOpen = useUserStore(state => state.isEditPersonDialogOpen);
const setIsEditPersonDialogOpen = useUserStore(state => state.setIsEditPersonDialogOpen);
const isDeleteDialogOpen = useUserStore(state => state.isDeleteDialogOpen);
const setIsDeleteDialogOpen = useUserStore(state => state.setIsDeleteDialogOpen);
const isViewDetailsDialogOpen = useUserStore(state => state.isViewDetailsDialogOpen);
const setIsViewDetailsDialogOpen = useUserStore(state => state.setIsViewDetailsDialogOpen);
const selectedUser = useUserStore(state => state.selectedUser);
const setSelectedPerson = useUserStore(state => state.setSelectedPerson);
  
  // Judge qualifications panel state
  const [isQualificationsPanelOpen, setIsQualificationsPanelOpen] = useState(false);
  const [selectedUserForQualifications, setSelectedUserForQualifications] = useState<User | null>(null);
// Create a clean form data type to avoid intersection conflicts
interface UserFormData {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  streetAddress: string;
  city: string;
  state: string;
  zipCode: string;
  profileImage?: string;
  selectedDogIds: string[];
  dogs: Dog[];
  judgeQualifications?: JudgeQualification[];
}

const [formData, setFormData] = useState<UserFormData>({
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  streetAddress: '',
  city: '',
  state: '',
  zipCode: '',
  selectedDogIds: [],
  dogs: [],
  id: '',
});
  // Handlers (add, edit, delete, view, open dialogs)
  // ... (Will be filled in next step)
  if (isLoading) return <div className="p-8">Loading people...</div>;
  if (error) return <div className="p-8 text-red-500">Failed to load people.</div>;

  return (
    <div className="p-6">
      <UserTable
        people={(people as User[]) || []}
        onView={(person: User) => { setSelectedPerson(person); setIsViewDetailsDialogOpen(true); }}
        onEdit={(person: User) => { setFormData({
          id: String(person.id),
          firstName: person.firstName,
          lastName: person.lastName,
          email: person.email || '',
          phone: person.phone || '',
          streetAddress: person.streetAddress || '',
          city: person.city || '',
          state: person.state || '',
          zipCode: person.zipCode || '',
          ...(person.profileImage !== undefined && { profileImage: person.profileImage }),
          selectedDogIds: person.dogs || [],
          dogs: person.dogs?.map(dogId => dogs.find(dog => dog.id === dogId)).filter((dog): dog is Dog => dog !== undefined) || [],
          judgeQualifications: person.judgeQualifications || []
        }); setIsEditPersonDialogOpen(true); setSelectedPerson(person); }}
        onDelete={(person: User) => { setSelectedPerson(person); setIsDeleteDialogOpen(true); }}
        onManageQualifications={(person: User) => { 
          setSelectedUserForQualifications(person); 
          setIsQualificationsPanelOpen(true); 
        }}
      />
      <UserEditPanel
        open={isAddPersonDialogOpen || isEditPersonDialogOpen}
        onClose={() => {
          setIsAddPersonDialogOpen(false);
          setIsEditPersonDialogOpen(false);
        }}
        userId={isEditPersonDialogOpen && selectedUser ? selectedUser.id : ''}
        userName={selectedUser ? `${selectedUser.firstName} ${selectedUser.lastName}` : 'New User'}
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
          judgeQualifications: formData.judgeQualifications || [],
          roles: selectedUser?.roles || [],
        }}
        onSave={async (userData) => {
          const personPayload: User = {
            ...userData,
            id: formData.id || Date.now().toString(),
            firstName: userData.firstName || '',
            lastName: userData.lastName || '',
            email: userData.email || '',
            phone: userData.phone || '',
            streetAddress: userData.streetAddress || '',
            city: userData.city || '',
            state: userData.state || '',
            zipCode: userData.zipCode || '',
            dogs: formData.selectedDogIds, // User.dogs should be string[] (dog IDs)
            judgeQualifications: userData.judgeQualifications || [],
            roles: userData.roles || [],
          };
          try {
            if (isEditPersonDialogOpen) {
              await updatePersonMutation.mutateAsync(personPayload);
            } else {
              await addPersonMutation.mutateAsync(personPayload);
            }
            setIsAddPersonDialogOpen(false);
            setIsEditPersonDialogOpen(false);
            setSelectedPerson(null);
          } catch (error) {
            logger.error('Failed to save person:', 'components', {}, error as Error);
            throw error;
          }
        }}
        enableAutoSave={false}
        showAdvancedFields={true}
      />
      <DeletePersonDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        person={selectedUser}
        onCancel={() => setIsDeleteDialogOpen(false)}
        onDelete={async () => {
          if (selectedUser) {
            await deletePersonMutation.mutateAsync(selectedUser.id);
            setIsDeleteDialogOpen(false);
            setSelectedPerson(null);
          }
        }}
      />
      <PersonDetailsDialog
        open={isViewDetailsDialogOpen}
        onOpenChange={setIsViewDetailsDialogOpen}
        person={selectedUser}
        onClose={() => { setIsViewDetailsDialogOpen(false); setSelectedPerson(null); }}
        onEdit={(person: User) => {
          setFormData({
            id: String(person.id),
            firstName: person.firstName,
            lastName: person.lastName,
            email: person.email || '',
            phone: person.phone || '',
            streetAddress: person.streetAddress || '',
            city: person.city || '',
            state: person.state || '',
            zipCode: person.zipCode || '',
            ...(person.profileImage !== undefined && { profileImage: person.profileImage }),
            selectedDogIds: person.dogs || [],
            dogs: person.dogs?.map(dogId => dogs.find(dog => dog.id === dogId)).filter((dog): dog is Dog => dog !== undefined) || [],
            judgeQualifications: person.judgeQualifications || []
          });
          setIsEditPersonDialogOpen(true);
          setSelectedPerson(person);
        }}
        onDelete={(person: User) => {
          setSelectedPerson(person);
          setIsDeleteDialogOpen(true);
        }}
      />
      <JudgeQualificationPanel
        open={isQualificationsPanelOpen}
        onClose={() => {
          setIsQualificationsPanelOpen(false);
          setSelectedUserForQualifications(null);
        }}
        userId={selectedUserForQualifications?.id || ''}
        userName={selectedUserForQualifications ? `${selectedUserForQualifications.firstName} ${selectedUserForQualifications.lastName}` : ''}
        initialQualifications={(selectedUserForQualifications?.judgeQualifications as JudgeQualification[]) || []}
        onSave={async (qualifications: JudgeQualification[]) => {
          if (!selectedUserForQualifications) return;
          try {
            const { judgeQualificationQueries } = await import('@/services/database/queries/judgeQueries');
            const existing = await judgeQualificationQueries.getByJudgeId(selectedUserForQualifications.id);

            // Delete all existing qualifications
            await Promise.all(existing.map(q => judgeQualificationQueries.delete(q.id)));

            // Create new qualifications from the updated array
            await Promise.all(qualifications.map(qual =>
              judgeQualificationQueries.create({
                person_id: selectedUserForQualifications.id,
                organization: qual.organization,
                qualification_level: qual.level || 'Regular',
                disciplines: qual.disciplines || qual.showTypes || [],
                date_obtained: qual.certificationDate || (qual.dateObtained ? new Date(qual.dateObtained as unknown as string).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]),
                ...(qual.expirationDate ? { expiration_date: new Date(qual.expirationDate as unknown as string).toISOString().split('T')[0] } : {}),
                is_active: qual.status === 'Active',
              })
            ));

            logger.info('Qualifications saved for user', 'users', { userId: selectedUserForQualifications.id, count: qualifications.length });
          } catch (error) {
            logger.error('Failed to save qualifications:', 'users', {}, error as Error);
          }

          setIsQualificationsPanelOpen(false);
          setSelectedUserForQualifications(null);
        }}
      />
    </div>
  );
};

export default UserListPage;
