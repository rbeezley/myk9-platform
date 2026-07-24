import React, { lazy, Suspense } from 'react';
import { BlurGate } from '@/components/common/BlurGate';
import { TabContentSkeleton } from './Skeletons';
import { SecondaryViewNav, type SecondaryViewDef } from './DogDetailsSectionNav';
import type { RecordsView } from './dogDetailsSections';

const HealthRecordsSection = lazy(
  () => import('@/components/dogs/DogDetails/HealthRecords/HealthRecordsSection')
);
const TrainingSection = lazy(
  () => import('@/components/dogs/DogDetails/TrainingJournal/TrainingSection')
);
const PedigreeSection = lazy(() => import('@/components/dogs/DogDetails/Pedigree/PedigreeSection'));

interface RecordsSectionProps {
  dogId: string;
  view: RecordsView;
  isPremium: boolean;
  locked: boolean;
  onViewChange?: (view: RecordsView) => void;
  /** Secretary surface: Health only, no Premium gate, vaccinations-only content. */
  vaccinationsOnly?: boolean;
}

/**
 * Records groups Health, Training, and Pedigree — all Premium for the
 * exhibitor role — behind one secondary navigation and one coherent
 * locked/read-only treatment, rather than three separately gated peer tabs.
 */
const RecordsSection: React.FC<RecordsSectionProps> = ({
  dogId,
  view,
  isPremium,
  locked,
  onViewChange,
  vaccinationsOnly = false,
}) => {
  if (vaccinationsOnly) {
    return (
      <Suspense fallback={<TabContentSkeleton />}>
        <HealthRecordsSection user={{ isPremium }} dogId={dogId} vaccinationsOnly />
      </Suspense>
    );
  }

  const views: SecondaryViewDef[] = [
    { id: 'health', label: 'Health Records', locked },
    { id: 'training', label: 'Training Journal', locked },
    { id: 'pedigree', label: 'Pedigree', locked },
  ];

  return (
    <div className="space-y-4">
      <SecondaryViewNav
        label="Records view"
        views={views}
        value={view}
        onValueChange={v => onViewChange?.(v as RecordsView)}
      />

      {view === 'health' && (
        <BlurGate
          locked={locked}
          trackingContext="health-records"
          title="Health Records"
          description="Keep comprehensive health records for your dog's wellbeing."
        >
          <Suspense fallback={<TabContentSkeleton />}>
            <HealthRecordsSection user={{ isPremium }} dogId={dogId} />
          </Suspense>
        </BlurGate>
      )}

      {view === 'training' && (
        <BlurGate
          locked={locked}
          trackingContext="training-journal"
          title="Training Journal"
          description="Document training sessions and track your dog's progress."
        >
          <Suspense fallback={<TabContentSkeleton />}>
            <TrainingSection dogId={dogId} />
          </Suspense>
        </BlurGate>
      )}

      {view === 'pedigree' && (
        <BlurGate
          locked={locked}
          trackingContext="pedigree"
          title="Pedigree"
          description="Explore your dog's lineage and ancestry with detailed pedigree tracking."
        >
          <Suspense fallback={<TabContentSkeleton />}>
            <PedigreeSection dogId={dogId} />
          </Suspense>
        </BlurGate>
      )}
    </div>
  );
};

export default RecordsSection;
