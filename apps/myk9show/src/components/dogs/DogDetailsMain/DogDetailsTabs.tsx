import React, { lazy, Suspense, useMemo } from 'react';
import {
  Activity,
  BarChart3,
  Crown,
  FileText,
  Stethoscope,
  BookOpen,
  GitBranch,
  Trophy,
} from 'lucide-react';
import { TabsContent } from '@/components/ui/tabs';
import { PrimaryTabs, type PrimaryTabDef } from '@/components/common/PrimaryTabs';
import { useUrlTab } from '@/hooks/useUrlTab';
import RegistrationsSection from '@/components/dogs/DogDetails/Registrations/RegistrationsSection';
import { BlurGate } from '@/components/common/BlurGate';
import { TabContentSkeleton } from './Skeletons';
import { useSubscriptionGate } from '@/hooks/useSubscriptionGate';
import { getDogDisplayName } from '@/types/dog-types';
import type { DogDetailsTabsProps } from './types';
import ActivityTab from './ActivityTab';

// Lazy-loaded tabs
const TrainingSection = lazy(
  () => import('@/components/dogs/DogDetails/TrainingJournal/TrainingSection')
);
const HealthRecordsSection = lazy(
  () => import('@/components/dogs/DogDetails/HealthRecords/HealthRecordsSection')
);
const CompetitionsTabs = lazy(
  () => import('@/components/dogs/DogDetails/Competitions/CompetitionsTabs')
);
const TitleProgressSection = lazy(
  () => import('@/components/dogs/DogDetails/TitleTracking/TitleProgressSection')
);
const PedigreeSection = lazy(() => import('@/components/dogs/DogDetails/Pedigree/PedigreeSection'));
const PerformanceStatisticsSection = lazy(
  () => import('@/components/dogs/DogDetails/Statistics/PerformanceStatisticsSection')
);

const TAB_IDS = [
  'activity',
  'registrations',
  'competitions',
  'title-progress',
  'statistics',
  'health-records',
  'training-journal',
  'pedigree',
] as const;

const DogDetailsTabs: React.FC<DogDetailsTabsProps> = ({
  dog,
  autoOpenAddRegistration,
  role = 'exhibitor',
}) => {
  const { isPremium, isLoading } = useSubscriptionGate();
  const [activeTab, setActiveTab] = useUrlTab(TAB_IDS, 'activity');
  const isSecretary = role === 'secretary';
  const dogName = getDogDisplayName(dog);

  const tabDefs: PrimaryTabDef[] = useMemo(() => {
    const base: PrimaryTabDef[] = [
      { id: 'activity', label: 'Activity', icon: Activity },
      {
        id: 'registrations',
        label: 'Registrations',
        icon: FileText,
        count: dog.registrations?.length ?? 0,
      },
    ];

    if (isSecretary) {
      return [...base, { id: 'health-records', label: 'Health Records', icon: Stethoscope }];
    }

    // Exhibitor tabs — premium ones get a lock icon via the locked flag
    const showLock = !isLoading && !isPremium;
    return [
      ...base,
      { id: 'competitions', label: 'Competitions', icon: Trophy },
      { id: 'title-progress', label: 'Title Progress', icon: Crown, locked: showLock },
      { id: 'statistics', label: 'Statistics', icon: BarChart3, locked: showLock },
      { id: 'health-records', label: 'Health Records', icon: Stethoscope, locked: showLock },
      { id: 'training-journal', label: 'Training Journal', icon: BookOpen, locked: showLock },
      { id: 'pedigree', label: 'Pedigree', icon: GitBranch, locked: showLock },
    ];
  }, [dog.registrations, isSecretary, isPremium, isLoading]);

  return (
    <PrimaryTabs tabs={tabDefs} value={activeTab} onValueChange={setActiveTab}>
      <TabsContent value="activity" className="pt-6">
        <ActivityTab dogId={dog.id} dogName={dogName} role={role} />
      </TabsContent>

      <TabsContent value="registrations" className="pt-6">
        <RegistrationsSection dog={dog} autoOpenAddDialog={autoOpenAddRegistration} />
      </TabsContent>

      {!isSecretary && (
        <TabsContent value="competitions" className="pt-6">
          <Suspense fallback={<TabContentSkeleton />}>
            <CompetitionsTabs dogId={dog.id} isPremium={isPremium} />
          </Suspense>
        </TabsContent>
      )}

      {!isSecretary && (
        <TabsContent value="title-progress" className="pt-6">
          <BlurGate
            locked={!isLoading && !isPremium}
            trackingContext="title-progress"
            title="Title Progress"
            description="Monitor your dog's progress toward titles and certifications."
          >
            <Suspense fallback={<TabContentSkeleton />}>
              <TitleProgressSection dogId={dog.id} />
            </Suspense>
          </BlurGate>
        </TabsContent>
      )}

      {!isSecretary && (
        <TabsContent value="statistics" className="pt-6">
          <BlurGate
            locked={!isLoading && !isPremium}
            trackingContext="statistics"
            title="Statistics"
            description="Visualize your dog's performance trends, qualification rates, and achievements."
          >
            <Suspense fallback={<TabContentSkeleton />}>
              <PerformanceStatisticsSection dogId={dog.id} />
            </Suspense>
          </BlurGate>
        </TabsContent>
      )}

      <TabsContent value="health-records" className="pt-6">
        <BlurGate
          locked={!isSecretary && !isLoading && !isPremium}
          trackingContext="health-records"
          title="Health Records"
          description="Keep comprehensive health records for your dog's wellbeing."
        >
          <Suspense fallback={<TabContentSkeleton />}>
            <HealthRecordsSection user={{ isPremium }} dogId={dog.id} />
          </Suspense>
        </BlurGate>
      </TabsContent>

      {!isSecretary && (
        <TabsContent value="training-journal" className="pt-6">
          <BlurGate
            locked={!isLoading && !isPremium}
            trackingContext="training-journal"
            title="Training Journal"
            description="Document training sessions and track your dog's progress."
          >
            <Suspense fallback={<TabContentSkeleton />}>
              <TrainingSection dogId={dog.id} />
            </Suspense>
          </BlurGate>
        </TabsContent>
      )}

      {!isSecretary && (
        <TabsContent value="pedigree" className="pt-6">
          <BlurGate
            locked={!isLoading && !isPremium}
            trackingContext="pedigree"
            title="Pedigree"
            description="Explore your dog's lineage and ancestry with detailed pedigree tracking."
          >
            <Suspense fallback={<TabContentSkeleton />}>
              <PedigreeSection dogId={dog.id} />
            </Suspense>
          </BlurGate>
        </TabsContent>
      )}
    </PrimaryTabs>
  );
};

export default DogDetailsTabs;
