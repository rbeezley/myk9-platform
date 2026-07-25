import React, { lazy, Suspense } from 'react';
import { PremiumReadOnlyNotice } from '@/components/common/PremiumReadOnlyNotice';
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
  /**
   * DISPLAY tier. Also enables the Premium-only health statistics/alerts
   * READS, so an untrusted entitlement must not turn this off — the panel
   * would go blank for an exhibitor who really is Premium.
   */
  isPremium: boolean;
  /**
   * Premium AUTHORIZATION (`canAuthorizePremium`) — the only value that may
   * expose add/edit controls, so an untrusted read never offers a write the
   * server rejects. Separate from `isPremium` on purpose.
   */
  canWrite: boolean;
  onViewChange?: (view: RecordsView) => void;
  /** Secretary surface: Health only, no Premium gate, vaccinations-only content. */
  vaccinationsOnly?: boolean;
}

/**
 * Records groups Health, Training, and Pedigree behind one secondary
 * navigation. Free exhibitors can keep using their existing records in a
 * read-only state while add/edit actions remain Premium.
 */
const RecordsSection: React.FC<RecordsSectionProps> = ({
  dogId,
  view,
  isPremium,
  canWrite,
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
    { id: 'health', label: 'Health Records' },
    { id: 'training', label: 'Training Journal' },
    { id: 'pedigree', label: 'Pedigree' },
  ];
  // Writes key on authorization; the Premium-only READS above stay on the
  // display tier so an untrusted refresh doesn't blank real Premium content.
  const readOnly = !canWrite;

  return (
    <div className="space-y-4">
      {readOnly && <PremiumReadOnlyNotice />}
      <SecondaryViewNav
        label="Records view"
        views={views}
        value={view}
        onValueChange={v => onViewChange?.(v as RecordsView)}
      />

      {view === 'health' && (
        <Suspense fallback={<TabContentSkeleton />}>
          <HealthRecordsSection user={{ isPremium }} dogId={dogId} readOnly={readOnly} />
        </Suspense>
      )}

      {view === 'training' && (
        <Suspense fallback={<TabContentSkeleton />}>
          <TrainingSection dogId={dogId} readOnly={readOnly} />
        </Suspense>
      )}

      {view === 'pedigree' && (
        <Suspense fallback={<TabContentSkeleton />}>
          <PedigreeSection dogId={dogId} readOnly={readOnly} />
        </Suspense>
      )}
    </div>
  );
};

export default RecordsSection;
