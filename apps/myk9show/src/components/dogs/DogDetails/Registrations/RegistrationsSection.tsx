import type { Dog, Registration } from '@/types/dog-types';
import AddRegistrationPanel from './AddRegistrationPanel';
import SectionCard from '@/components/common/SectionCard';
import EditRegistrationPanel from './EditRegistrationPanel';

import ConfirmDeleteRegistrationDialog from './ConfirmDeleteRegistrationDialog';
import ThreeDotMenu from '@/components/ui/ThreeDotMenu';
import { Edit, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { EmptyState } from '@/components/common/EmptyState';
import { useEffect, useState } from 'react';
import { useDogRegistrationManagement } from '@/hooks/queries/useRegistrationsDatabase';
import { Skeleton } from '@/components/common/SkeletonLoaders';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { translateDogDbError } from '@/hooks/translateDogDbError';

/**
 * Loose registration record supporting both camelCase (domain) and snake_case (DB) fields.
 * Needed because registrations may come from either the DB query (snake_case) or the domain type (camelCase).
 */
interface RegistrationRecord {
  id: string;
  organization: string;
  status?: string;
  breed?: string;
  variety?: string;
  registeredName?: string;
  registered_name?: string;
  registrationNumber?: string;
  registration_number?: string;
  applicationNumber?: string;
  application_number?: string;
  registrationDate?: string;
  registration_date?: string;
  submissionDate?: string;
  submission_date?: string;
  certificate?: string;
}

interface RegistrationsSectionProps {
  dog?: Dog;
  autoOpenAddDialog?: boolean;
}

import { useRegistrationsStore } from '@/store/registrationsStore';

export default function RegistrationsSection({
  dog,
  autoOpenAddDialog = false,
}: RegistrationsSectionProps) {
  const dogId = dog?.id || '';

  // Use database hooks for data management
  const {
    registrations: dbRegistrations,
    isLoading,
    error,
    createRegistration,
    isCreating,
    updateRegistration,
    deleteRegistration,
    refetch,
  } = useDogRegistrationManagement(dogId);

  // Fallback to dog prop registrations if database not available, or use store
  const storeRegistrations = useRegistrationsStore(state => state.registrations);
  const registrations = dbRegistrations || dog?.registrations || storeRegistrations;

  const isAddRegistrationDialogOpen = useRegistrationsStore(
    state => state.isAddRegistrationDialogOpen
  );
  const setIsAddRegistrationDialogOpen = useRegistrationsStore(
    state => state.setIsAddRegistrationDialogOpen
  );

  // Auto-open the add registration dialog if requested
  useEffect(() => {
    if (autoOpenAddDialog) {
      setIsAddRegistrationDialogOpen(true);
    }
  }, [autoOpenAddDialog, setIsAddRegistrationDialogOpen]);

  const isEditRegistrationDialogOpen = useRegistrationsStore(
    state => state.isEditRegistrationDialogOpen
  );
  const setIsEditRegistrationDialogOpen = useRegistrationsStore(
    state => state.setIsEditRegistrationDialogOpen
  );
  const isDeleteRegistrationDialogOpen = useRegistrationsStore(
    state => state.isDeleteRegistrationDialogOpen
  );
  const setIsDeleteRegistrationDialogOpen = useRegistrationsStore(
    state => state.setIsDeleteRegistrationDialogOpen
  );

  const selectedRegistration = useRegistrationsStore(state => state.selectedRegistration);
  const setSelectedRegistration = useRegistrationsStore(state => state.setSelectedRegistration);
  const [registrationSaveError, setRegistrationSaveError] = useState<string | null>(null);

  const handleDeleteRegistration = () => {
    if (selectedRegistration && selectedRegistration.id) {
      deleteRegistration(selectedRegistration.id);
    }
    setIsDeleteRegistrationDialogOpen(false);
    setSelectedRegistration(null);
  };

  // Registration docs use padded numeric dates and a dash for missing values.
  function formatRegistrationDate(dateStr?: string) {
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

  // Handle adding a new registration
  const handleAddRegistration = async (data: {
    organization: string;
    registeredName: string;
    breed: string;
    variety: string;
    registrationNumber: string;
    status: string;
    registrationDate: string;
  }) => {
    // Map to database format and create
    const registrationData = {
      organization: data.organization,
      registered_name: data.registeredName,
      breed: data.breed,
      variety: data.variety || null,
      registration_number: data.registrationNumber,
      status: data.status,
      registration_date: data.registrationDate || null,
    };

    setRegistrationSaveError(null);
    createRegistration(registrationData, {
      onSuccess: () => setIsAddRegistrationDialogOpen(false),
      onError: error => setRegistrationSaveError(translateDogDbError(error).message),
    });
  };

  // Handle updating an existing registration
  const handleUpdateRegistration = async (data: {
    id: string;
    organization: string;
    registeredName: string;
    breed: string;
    variety: string;
    registrationNumber: string;
    status: string;
    registrationDate: string;
  }) => {
    // Map to database format and update
    const registrationData = {
      organization: data.organization,
      registered_name: data.registeredName,
      breed: data.breed,
      variety: data.variety || null,
      registration_number: data.registrationNumber,
      status: data.status,
      registration_date: data.registrationDate || null,
    };

    setRegistrationSaveError(null);
    updateRegistration(
      { id: data.id, updates: registrationData },
      {
        onSuccess: () => {
          setIsEditRegistrationDialogOpen(false);
          setSelectedRegistration(null);
        },
        onError: error => setRegistrationSaveError(translateDogDbError(error).message),
      }
    );
  };

  if (isLoading) {
    return (
      <div role="status" aria-label="Loading registrations" className="space-y-4 py-2">
        <div className="flex justify-end">
          <Skeleton className="h-10 w-44" />
        </div>
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} className="h-[170px] rounded-lg" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-center">
          <p className="text-destructive mb-4">Error loading registrations</p>
          <Button onClick={() => refetch()} variant="outline">
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {registrationSaveError && (
        <Alert className="mb-4 border-destructive/30 bg-destructive/10">
          <AlertDescription className="text-destructive">{registrationSaveError}</AlertDescription>
        </Alert>
      )}

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
      {!registrations || registrations.length === 0 ? (
        <EmptyState
          icon={Plus}
          title="No Registrations Found"
          description="Add your first kennel club registration to get started."
          action={{
            label: 'Add Registration',
            onClick: () => setIsAddRegistrationDialogOpen(true),
            icon: Plus,
          }}
        />
      ) : (
        <div className="grid gap-4 grid-cols-1">
          {(registrations as RegistrationRecord[]).map((reg: RegistrationRecord, idx: number) => (
            <SectionCard key={reg.id || idx} className="min-h-[170px] justify-between">
              <div className="absolute top-4 right-4 z-10">
                <ThreeDotMenu
                  items={[
                    {
                      label: 'Edit',
                      onClick: () => {
                        setSelectedRegistration(reg as Registration);
                        setIsEditRegistrationDialogOpen(true);
                      },
                      icon: <Edit className="w-4 h-4 mr-2" />,
                    },
                    {
                      label: 'Delete',
                      onClick: () => {
                        setSelectedRegistration(reg as Registration);
                        setIsDeleteRegistrationDialogOpen(true);
                      },
                      icon: <Trash2 className="w-4 h-4 mr-2" />,
                      className: 'text-destructive',
                    },
                  ]}
                />
              </div>
              <div className="flex flex-col gap-2">
                <div className="font-semibold text-base mb-0.5">
                  {reg.organization} Registration
                </div>
                <div className="text-xs text-muted-foreground mb-0.5">
                  {reg.organization === 'AKC'
                    ? 'American Kennel Club'
                    : reg.organization === 'UKC'
                      ? 'United Kennel Club'
                      : reg.organization}
                </div>
                {typeof reg.status === 'string' && reg.status.trim() !== '' ? (
                  <span
                    className={`inline-flex w-fit px-2 py-0.5 rounded text-xs font-medium mb-1 ${reg.status === 'Active' ? 'bg-green-500/20 text-success ' : reg.status === 'Pending' || reg.status === 'Under review' ? 'bg-yellow-500/20 text-warning ' : 'bg-muted text-muted-foreground'}`}
                  >
                    {reg.status}
                  </span>
                ) : (
                  <span className="text-xs text-destructive mb-1">No status</span>
                )}
                <div className="grid grid-cols-1 gap-y-2 gap-x-6 md:grid-cols-2">
                  <div>
                    <div className="text-xs text-muted-foreground">Registered Name</div>
                    <div className="font-semibold break-words">
                      {reg.registeredName || reg.registered_name}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Registration Number</div>
                    <div className="font-semibold">
                      {reg.applicationNumber ||
                        reg.application_number ||
                        reg.registrationNumber ||
                        reg.registration_number}
                    </div>
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
                    <div className="font-semibold">
                      {formatRegistrationDate(reg.registrationDate || reg.registration_date)}
                    </div>
                  </div>
                </div>
                {(reg.submissionDate || reg.submission_date) && (
                  <div className="mt-2">
                    <div className="text-xs text-muted-foreground">Submission Date</div>
                    <div className="font-semibold">
                      {formatRegistrationDate(reg.submissionDate || reg.submission_date)}
                    </div>
                  </div>
                )}
                {reg.certificate && (
                  <div className="flex flex-col mt-2">
                    <div className="text-xs text-muted-foreground">Certificate</div>
                    <Button variant="outline" size="sm" className="mt-1 w-fit">
                      <span className="mr-1">⬇️</span>Download
                    </Button>
                  </div>
                )}
              </div>
            </SectionCard>
          ))}
        </div>
      )}
      <AddRegistrationPanel
        open={isAddRegistrationDialogOpen}
        onClose={() => setIsAddRegistrationDialogOpen(false)}
        onSave={handleAddRegistration}
        dogName={dog?.callName}
      />
      <EditRegistrationPanel
        open={isEditRegistrationDialogOpen}
        onClose={() => {
          setIsEditRegistrationDialogOpen(false);
          setSelectedRegistration(null);
        }}
        onSave={handleUpdateRegistration}
        registration={selectedRegistration}
        dogName={dog?.callName}
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
