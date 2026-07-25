import React, { lazy, Suspense } from 'react';
import { BlurGate } from '@/components/common/BlurGate';
import { TabContentSkeleton } from './Skeletons';
import { features } from '@/config/features';
import { SecondaryViewNav, type SecondaryViewDef } from './DogDetailsSectionNav';
import type { CareerView } from './dogDetailsSections';

const CompetitionsTabs = lazy(
  () => import('@/components/dogs/DogDetails/Competitions/CompetitionsTabs')
);
const TitleProgressSection = lazy(
  () => import('@/components/dogs/DogDetails/TitleTracking/TitleProgressSection')
);
const PerformanceStatisticsSection = lazy(
  () => import('@/components/dogs/DogDetails/Statistics/PerformanceStatisticsSection')
);

interface CareerSectionProps {
  dogId: string;
  ownerId: string;
  view: CareerView;
  onViewChange: (view: CareerView) => void;
  /**
   * Premium AUTHORIZATION (`canAuthorizePremium`), not the display tier —
   * it reaches content that offers writes.
   */
  isPremium: boolean;
  /** Free-user DISPLAY lock — Competitions itself is always free. */
  locked: boolean;
}

/**
 * Career groups Competitions (free), Title Progress, and Statistics
 * (both Premium) behind one secondary navigation. Free users keep
 * Competitions usable and see one consistent locked-view treatment for
 * Title Progress/Statistics instead of two competing lock tabs.
 */
const CareerSection: React.FC<CareerSectionProps> = ({
  dogId,
  ownerId,
  view,
  onViewChange,
  isPremium,
  locked,
}) => {
  const views: SecondaryViewDef[] = [
    ...(features.competitionsTab ? [{ id: 'competitions' as const, label: 'Competitions' }] : []),
    { id: 'titles', label: 'Title Progress', locked },
    ...(features.statisticsTab ? [{ id: 'statistics' as const, label: 'Statistics', locked }] : []),
  ];
  // With the competitions deployment switch off, the section default falls
  // through to Title Progress so the URL default never selects a hidden view.
  const effectiveView = view === 'competitions' && !features.competitionsTab ? 'titles' : view;

  return (
    <div className="space-y-4">
      <SecondaryViewNav
        label="Career view"
        views={views}
        value={effectiveView}
        onValueChange={v => onViewChange(v as CareerView)}
      />

      {effectiveView === 'competitions' && features.competitionsTab && (
        <Suspense fallback={<TabContentSkeleton />}>
          <CompetitionsTabs dogId={dogId} isPremium={isPremium} />
        </Suspense>
      )}

      {effectiveView === 'titles' && (
        <BlurGate
          locked={locked}
          trackingContext="title-progress"
          title="Title Progress"
          description="Monitor your dog's progress toward titles and certifications."
        >
          <Suspense fallback={<TabContentSkeleton />}>
            <TitleProgressSection dogId={dogId} ownerId={ownerId} />
          </Suspense>
        </BlurGate>
      )}

      {effectiveView === 'statistics' && features.statisticsTab && (
        <BlurGate
          locked={locked}
          trackingContext="statistics"
          title="Statistics"
          description="Visualize your dog's performance trends, qualification rates, and achievements."
        >
          <Suspense fallback={<TabContentSkeleton />}>
            <PerformanceStatisticsSection dogId={dogId} />
          </Suspense>
        </BlurGate>
      )}
    </div>
  );
};

export default CareerSection;
