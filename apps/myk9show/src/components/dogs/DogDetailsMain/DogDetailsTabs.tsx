import React, { Suspense, useEffect, useRef } from 'react';
import RegistrationsSection from '@/components/dogs/DogDetails/Registrations/RegistrationsSection';
import TitleProgressSection from './TitleProgressSection';
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
  onAddRequestConsumed,
  showRegistrationDetails = false,
  role = 'exhibitor',
}) => {
  const { isPremium, isLoading, canAuthorizePremium } = useSubscriptionGate();
  const { user } = useAuthContext();
  const { state, setSection, setView } = useDogDetailsNavigation();
  const isSecretary = role === 'secretary';
  const registrationDetailsHeadingRef = useRef<HTMLHeadingElement>(null);
  const wasShowingRegistrationDetails = useRef(showRegistrationDetails);
  // `showRegistrationDetails` is URL-derived, so the heading mounts in the SAME
  // commit that turns this true — the effect always sees the node. Only a
  // false -> true transition moves focus: a direct `?tab=registrations` load
  // should not yank the page on arrival.
  useEffect(() => {
    const wasShowing = wasShowingRegistrationDetails.current;
    wasShowingRegistrationDetails.current = showRegistrationDetails;
    if (wasShowing || !showRegistrationDetails) return;
    const heading = registrationDetailsHeadingRef.current;
    if (!heading) return;
    heading.scrollIntoView({ block: 'start' });
    heading.focus({ preventScroll: true });
  }, [showRegistrationDetails]);
  const dogName = getDogDisplayName(dog);
  // The URL alone governs the reveal. Gating it on a registration count too
  // made the section vanish in place (focus falling to <body>) when the last
  // registration was deleted, and rendered nothing at all for a legacy
  // `?tab=registrations` bookmark on an unregistered dog.
  const registrationDetailsVisible = showRegistrationDetails;
  // `locked` is the DISPLAY treatment (blur gate on view-only Premium panels)
  // and may use the optimistic legacy value. Anything that unlocks a WRITE
  // takes `canAuthorizePremium` instead: an untrusted entitlement read must not
  // surface create/edit controls the server will reject.
  const locked = !isLoading && !isPremium;

  // The secretary role keeps its existing narrow surface — Registrations
  // plus a vaccinations-only Health Records view — not the exhibitor
  // Overview/Career/Records hierarchy this file otherwise implements.
  if (isSecretary) {
    return (
      <div className="pt-6 space-y-8">
        <RegistrationsSection
          dog={dog}
          autoOpenAddDialog={autoOpenAddRegistration}
          onAddRequestConsumed={onAddRequestConsumed}
        />
        <section>
          <h2 className="text-base font-semibold mb-3">Health Records</h2>
          <Suspense fallback={<TabContentSkeleton />}>
            <RecordsSection
              dogId={dog.id}
              view="health"
              isPremium={isPremium}
              canWrite={canAuthorizePremium}
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
        <div className="pt-4 lg:pt-6 space-y-8">
          <section>
            <h2 className="text-base font-semibold mb-3">Activity</h2>
            <ActivityTab dogId={dog.id} dogName={dogName} role={role} />
          </section>
          {isPremium && <TitleProgressSection dogId={dog.id} />}
          {/* `contents` while hidden: the section is still mounted (it owns the
              add/edit panels) but draws no box, so Overview's space-y-8 rhythm
              closes up instead of leaving a gap above nothing. */}
          <section
            id="dog-registration-management"
            className={registrationDetailsVisible ? undefined : 'contents'}
            {...(registrationDetailsVisible
              ? { 'aria-labelledby': 'dog-registration-details' }
              : {})}
          >
            {registrationDetailsVisible && (
              <h2
                id="dog-registration-details"
                ref={registrationDetailsHeadingRef}
                tabIndex={-1}
                className="text-base font-semibold mb-3"
              >
                Manage registrations
              </h2>
            )}
            <RegistrationsSection
              dog={dog}
              autoOpenAddDialog={autoOpenAddRegistration}
              onAddRequestConsumed={onAddRequestConsumed}
              showDetails={registrationDetailsVisible}
            />
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
            isPremium={canAuthorizePremium}
            locked={locked}
            viewer={role}
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
            canWrite={canAuthorizePremium}
          />
        </div>
      )}
    </>
  );
};

export default DogDetailsTabs;
