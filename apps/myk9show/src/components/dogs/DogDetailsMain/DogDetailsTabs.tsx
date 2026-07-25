import React, { Suspense } from 'react';
import RegistrationsSection from '@/components/dogs/DogDetails/Registrations/RegistrationsSection';
import { TabContentSkeleton } from './Skeletons';
import { useSubscriptionGate } from '@/hooks/useSubscriptionGate';
import { useAuthContext } from '@/hooks/useAuthContext';
import { getDogDisplayName } from '@/types/dog-types';
import type { DogDetailsTabsProps } from './types';
import ActivityTab from './ActivityTab';
import { useDogDetailsNavigation } from './useDogDetailsNavigation';
import { TopLevelSectionNav } from './DogDetailsSectionNav';
import CareerSection from './CareerSection';
import RecordsSection from './RecordsSection';
import type { CareerView, RecordsView } from './dogDetailsSections';

const DogDetailsTabs: React.FC<DogDetailsTabsProps> = ({
  dog,
  autoOpenAddRegistration,
  role = 'exhibitor',
}) => {
  const { isPremium, isLoading } = useSubscriptionGate();
  const { user } = useAuthContext();
  const { state, setSection, setView } = useDogDetailsNavigation();
  const isSecretary = role === 'secretary';
  const dogName = getDogDisplayName(dog);
  const locked = !isLoading && !isPremium;

  // The secretary role keeps its existing narrow surface — Registrations
  // plus a vaccinations-only Health Records view — not the exhibitor
  // Overview/Career/Records hierarchy this file otherwise implements.
  if (isSecretary) {
    return (
      <div className="pt-6 space-y-8">
        <RegistrationsSection dog={dog} autoOpenAddDialog={autoOpenAddRegistration} />
        <section>
          <h2 className="text-base font-semibold mb-3">Health Records</h2>
          <Suspense fallback={<TabContentSkeleton />}>
            <RecordsSection
              dogId={dog.id}
              view="health"
              isPremium={isPremium}
              vaccinationsOnly
            />
          </Suspense>
        </section>
      </div>
    );
  }

  return (
    <>
      <TopLevelSectionNav value={state.section} onValueChange={setSection} />

      {state.section === 'overview' && (
        <div className="pt-6 space-y-8">
          <RegistrationsSection dog={dog} autoOpenAddDialog={autoOpenAddRegistration} />
          <section>
            <h2 className="text-base font-semibold mb-3">Activity</h2>
            <ActivityTab dogId={dog.id} dogName={dogName} role={role} />
          </section>
        </div>
      )}

      {state.section === 'career' && (
        <div className="pt-6">
          <CareerSection
            dogId={dog.id}
            ownerId={user?.id ?? ''}
            view={(state.view as CareerView) ?? 'competitions'}
            onViewChange={setView}
            isPremium={isPremium}
            locked={locked}
          />
        </div>
      )}

      {state.section === 'records' && (
        <div className="pt-6">
          <RecordsSection
            dogId={dog.id}
            view={(state.view as RecordsView) ?? 'health'}
            onViewChange={setView}
            isPremium={isPremium}
          />
        </div>
      )}
    </>
  );
};

export default DogDetailsTabs;
