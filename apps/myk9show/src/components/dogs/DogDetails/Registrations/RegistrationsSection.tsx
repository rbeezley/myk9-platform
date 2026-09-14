import type { Dog, Registration } from '@/types/dog-types';
import SectionCard from '@/components/common/SectionCard';

import ThreeDotMenu from '@/components/ui/ThreeDotMenu';
import { Edit, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { EmptyState } from '@/components/common/EmptyState';
import { useDogRegistrationManagement } from '@/hooks/queries/useRegistrationsDatabase';
import { Skeleton } from '@/components/common/SkeletonLoaders';

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
}

import { useRegistrationsStore } from '@/store/registrationsStore';

/**
 * The dog's registrations as a list of cards, with per-row Edit / Delete.
 *
 * List only: DogRegistrationDialogs hosts the panels these rows open, so this
 * component can be mounted wherever the list is actually wanted and unmounted
 * everywhere else without taking the add/edit flow down with it.
 */
export default function RegistrationsSection({ dog }: RegistrationsSectionProps) {
  const dogId = dog?.id || '';

  // Use database hooks for data management
  const {
    registrations: dbRegistrations,
    isLoading,
    error,
    refetch,
  } = useDogRegistrationManagement(dogId);

  // Fallback to dog prop registrations if database not available, or use store
  const storeRegistrations = useRegistrationsStore(state => state.registrations);
  const registrations = dbRegistrations || dog?.registrations || storeRegistrations;

  const setIsAddRegistrationDialogOpen = useRegistrationsStore(
    state => state.setIsAddRegistrationDialogOpen
  );
  const setIsEditRegistrationDialogOpen = useRegistrationsStore(
    state => state.setIsEditRegistrationDialogOpen
  );
  const setIsDeleteRegistrationDialogOpen = useRegistrationsStore(
    state => state.setIsDeleteRegistrationDialogOpen
  );
  const setSelectedRegistration = useRegistrationsStore(state => state.setSelectedRegistration);

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

  if (!registrations || registrations.length === 0) {
    return (
      <EmptyState
        icon={Plus}
        title="No Registrations Found"
        description="Add your first kennel club registration to get started."
        /* The rail's Add sits behind this panel's backdrop when the list is
           shown there, so the empty state has to carry its own way out. */
        action={{
          label: 'Add registration',
          onClick: () => setIsAddRegistrationDialogOpen(true),
          icon: Plus,
        }}
      />
    );
  }

  return (
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
            <div className="font-semibold text-base mb-0.5">{reg.organization} Registration</div>
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
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2 min-h-11"
                  aria-label={`Edit ${reg.organization} registered name for ${reg.registeredName || reg.registered_name}`}
                  onClick={() => {
                    setSelectedRegistration(reg as Registration);
                    setIsEditRegistrationDialogOpen(true);
                  }}
                >
                  Edit registered name
                </Button>
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
  );
}
