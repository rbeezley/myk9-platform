import type { Registration, Dog } from '@/types/dog-types';
import AddRegistrationDialog from './AddRegistrationDialog';
import SectionCard from '@/components/common/SectionCard';
import EditRegistrationDialog from './EditRegistrationDialog';

import ConfirmDeleteRegistrationDialog from './ConfirmDeleteRegistrationDialog';
import ThreeDotMenu from '@/components/ui/ThreeDotMenu';
import { Eye, Edit, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { NoDataEmptyState } from '@/components/common/EmptyState';
import { useState, useEffect } from 'react';
import { 
  useDogRegistrationManagement
} from '@/hooks/queries/useRegistrationsDatabase';

interface RegistrationsSectionProps {
  dog?: Dog;
  autoOpenAddDialog?: boolean;
}

import { useRegistrationsStore } from '@/store/registrationsStore';

export default function RegistrationsSection({ dog, autoOpenAddDialog = false }: RegistrationsSectionProps) {
  const dogId = dog?.id || '';
  
  // Use database hooks for data management
  const {
    registrations: dbRegistrations,
    isLoading,
    error,
    createRegistration,
    isCreating,
    deleteRegistration,
    refetch
  } = useDogRegistrationManagement(dogId);
  
  // Fallback to dog prop registrations if database not available, or use store
  const storeRegistrations = useRegistrationsStore(state => state.registrations);
  const registrations = dbRegistrations || dog?.registrations || storeRegistrations;
  
  const isAddRegistrationDialogOpen = useRegistrationsStore(state => state.isAddRegistrationDialogOpen);
  const setIsAddRegistrationDialogOpen = useRegistrationsStore(state => state.setIsAddRegistrationDialogOpen);
  
  // Auto-open the add registration dialog if requested
  useEffect(() => {
    if (autoOpenAddDialog) {
      setIsAddRegistrationDialogOpen(true);
    }
  }, [autoOpenAddDialog, setIsAddRegistrationDialogOpen]);
  
  const isEditRegistrationDialogOpen = useRegistrationsStore(state => state.isEditRegistrationDialogOpen);
  const setIsEditRegistrationDialogOpen = useRegistrationsStore(state => state.setIsEditRegistrationDialogOpen);
  const isDeleteRegistrationDialogOpen = useRegistrationsStore(state => state.isDeleteRegistrationDialogOpen);
  const setIsDeleteRegistrationDialogOpen = useRegistrationsStore(state => state.setIsDeleteRegistrationDialogOpen);
  
  const setIsViewRegistrationDialogOpen = useRegistrationsStore(state => state.setIsViewRegistrationDialogOpen);
  const selectedRegistration = useRegistrationsStore(state => state.selectedRegistration);
  const setSelectedRegistration = useRegistrationsStore(state => state.setSelectedRegistration);

  // Local state for new/edit registration form
  const [newRegistration, setNewRegistration] = useState<Omit<Registration, 'id'>>({
    organization: '', registeredName: '', breed: '', variety: '', registrationNumber: '', status: 'Active', applicationNumber: '', submissionDate: '', registrationDate: '', certificate: '',
  });

  const handleDeleteRegistration = () => {
    if (selectedRegistration && selectedRegistration.id) {
      deleteRegistration(selectedRegistration.id);
    }
    setIsDeleteRegistrationDialogOpen(false);
    setSelectedRegistration(null);
  };

  // Helper function to format date as mm/dd/yyyy without timezone shift
  function formatDateMMDDYYYY(dateStr?: string) {
    if (!dateStr) return '-';
    // If dateStr is in YYYY-MM-DD, split and format directly
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return `${parts[1].padStart(2, '0')}/${parts[2].padStart(2, '0')}/${parts[0]}`;
    }
    // fallback to previous logic
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const yyyy = date.getFullYear();
    return `${mm}/${dd}/${yyyy}`;
  }

  const handleAddRegistration = () => {
    // Map to database format and create
    const registrationData = {
      organization: newRegistration.organization,
      registered_name: newRegistration.registeredName,
      breed: newRegistration.breed,
      variety: newRegistration.variety,
      registration_number: newRegistration.registrationNumber,
      status: newRegistration.status,
      application_number: newRegistration.applicationNumber,
      submission_date: newRegistration.submissionDate || null,
      registration_date: newRegistration.registrationDate || null,
      certificate: newRegistration.certificate || null,
    };
    
    createRegistration(registrationData);
    setIsAddRegistrationDialogOpen(false);
    setNewRegistration({
      organization: '', registeredName: '', breed: '', variety: '', registrationNumber: '', status: 'Active', applicationNumber: '', submissionDate: '', registrationDate: '', certificate: '',
    });
  };


  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading registrations...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-center">
          <p className="text-red-600 mb-4">Error loading registrations</p>
          <Button onClick={() => refetch()} variant="outline">
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <Button
          onClick={() => setIsAddRegistrationDialogOpen(true)}
          variant="default"
          disabled={isCreating}
        >
          <Plus className="w-4 h-4 mr-2" />
          {isCreating ? 'Adding...' : 'Add New Registration'}
        </Button>
      </div>
      {(!registrations || registrations.length === 0) ? (
        <NoDataEmptyState
          entityName="Registrations"
          description="Add your first kennel club registration to get started."
          canCreate={true}
          onCreateClick={() => setIsAddRegistrationDialogOpen(true)}
        />
      ) : (
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        {registrations.map((reg: any, idx: number) => (
          <SectionCard key={reg.id || idx} className="min-h-[170px] justify-between">
            <div className="absolute top-4 right-4 z-10">
              <ThreeDotMenu
                items={[{
                  label: 'View',
                  onClick: () => {
                    setSelectedRegistration(reg);
                    setIsViewRegistrationDialogOpen(true);
                  },
                  icon: <Eye className="w-4 h-4 mr-2" />,
                }, {
                  label: 'Edit',
                  onClick: () => {
                    setSelectedRegistration(reg);
                    setNewRegistration({ ...reg });
                    setIsEditRegistrationDialogOpen(true);
                  },
                  icon: <Edit className="w-4 h-4 mr-2" />,
                }, {
                  label: 'Delete',
                  onClick: () => {
                    setSelectedRegistration(reg);
                    setIsDeleteRegistrationDialogOpen(true);
                  },
                  icon: <Trash2 className="w-4 h-4 mr-2" />,
                  className: 'text-red-600',
                }]}
              />
            </div>
            <div className="flex flex-col gap-2">
              <div className="font-semibold text-base mb-0.5">{reg.organization} Registration</div>
              <div className="text-xs text-muted-foreground mb-0.5">{reg.organization === 'AKC' ? 'American Kennel Club' : reg.organization === 'UKC' ? 'United Kennel Club' : reg.organization}</div>
              {/* DEBUG: Show the status value as a fallback */}
              {typeof reg.status === 'string' && reg.status.trim() !== '' ? (
                <span className={`inline-flex w-fit px-2 py-0.5 rounded text-xs font-medium mb-1 ${reg.status === 'Active' ? 'bg-green-500/20 text-green-800 dark:text-green-200' : reg.status === 'Pending' || reg.status === 'Under review' ? 'bg-yellow-500/20 text-yellow-800 dark:text-yellow-200' : 'bg-muted text-muted-foreground'}`}>{reg.status}</span>
              ) : (
                <span className="text-xs text-red-600 dark:text-red-400 mb-1">No status</span>
              )}
              <div className="grid grid-cols-1 gap-y-2 gap-x-6 md:grid-cols-2">
                <div>
                  <div className="text-xs text-muted-foreground">Registered Name</div>
                  <div className="font-semibold break-words">{reg.registeredName || reg.registered_name}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Registration Number</div>
                  <div className="font-semibold">{reg.applicationNumber || reg.application_number || reg.registrationNumber || reg.registration_number}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Breed</div>
                  <div className="font-semibold">{reg.breed}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Variety</div>
                  <div className="font-semibold">{reg.variety || '-'}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Registration Date</div>
                  <div className="font-semibold">{formatDateMMDDYYYY(reg.registrationDate || reg.registration_date)}</div>
                </div>
              </div>
              {(reg.submissionDate || reg.submission_date) && (
                <div className="mt-2">
                  <div className="text-xs text-muted-foreground">Submission Date</div>
                  <div className="font-semibold">{formatDateMMDDYYYY(reg.submissionDate || reg.submission_date)}</div>
                </div>
              )}
              {reg.certificate && (
                <div className="flex flex-col mt-2">
                  <div className="text-xs text-muted-foreground">Certificate</div>
                  <Button variant="outline" size="sm" className="mt-1 w-fit"><span className="mr-1">⬇️</span>Download</Button>
                </div>
              )}
            </div>
          </SectionCard>
        ))}
      </div>
      )}
      <AddRegistrationDialog
        open={isAddRegistrationDialogOpen}
        onClose={() => setIsAddRegistrationDialogOpen(false)}
        onAdd={handleAddRegistration}
        newRegistration={newRegistration}
        setNewRegistration={setNewRegistration}
      />
      <EditRegistrationDialog
        open={isEditRegistrationDialogOpen}
        onClose={() => setIsEditRegistrationDialogOpen(false)}
        onUpdate={() => {}}
        newRegistration={newRegistration}
        setNewRegistration={setNewRegistration}
      />
      
      <ConfirmDeleteRegistrationDialog
        open={isDeleteRegistrationDialogOpen}
        onClose={() => {
          setIsDeleteRegistrationDialogOpen(false);
          setSelectedRegistration(null);
        }}
        onDelete={handleDeleteRegistration}
        registration={selectedRegistration}
      />
    </div>
  );
}
