import React, { lazy, Suspense, useMemo } from 'react';
import {
  Activity,
  BarChart3,
  Crown,
  FileText,
  Trophy,
  Stethoscope,
  BookOpen,
  GitBranch,
} from 'lucide-react';
import { TabsContent } from '@/components/ui/tabs';
import { PrimaryTabs, type PrimaryTabDef } from '@/components/common/PrimaryTabs';
import { useUrlTab } from '@/hooks/useUrlTab';
import RegistrationsSection from '@/components/dogs/DogDetails/Registrations/RegistrationsSection';
import { BlurGate } from '@/components/common/BlurGate';
import { TabContentSkeleton } from './Skeletons';
import { useSubscriptionGate } from '@/hooks/useSubscriptionGate';
import type { DogDetailsTabsProps } from './types';

// Lazy load heavy components
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
const ActivityTimeline = lazy(() => import('@/components/common/ActivityTimeline'));
const PerformanceStatisticsSection = lazy(
  () => import('@/components/dogs/DogDetails/Statistics/PerformanceStatisticsSection')
);

const TAB_IDS = [
  'registrations',
  'competitions',
  'title-progress',
  'statistics',
  'health-records',
  'training-journal',
  'pedigree',
  'activity',
] as const;

const DogDetailsTabs: React.FC<DogDetailsTabsProps> = ({ dog, autoOpenAddRegistration }) => {
  const { isPremium, isLoading } = useSubscriptionGate();
  const [activeTab, setActiveTab] = useUrlTab(TAB_IDS, 'registrations');

  const tabDefs: PrimaryTabDef[] = useMemo(
    () => [
      {
        id: 'registrations',
        label: 'Registrations',
        icon: FileText,
        count: dog.registrations?.length ?? 0,
      },
      { id: 'competitions', label: 'Competitions', icon: Trophy },
      { id: 'title-progress', label: 'Title Progress', icon: Crown },
      { id: 'statistics', label: 'Statistics', icon: BarChart3 },
      { id: 'health-records', label: 'Health Records', icon: Stethoscope },
      { id: 'training-journal', label: 'Training Journal', icon: BookOpen },
      { id: 'pedigree', label: 'Pedigree', icon: GitBranch },
      { id: 'activity', label: 'Activity', icon: Activity },
    ],
    [dog.registrations]
  );

  return (
    <div className="space-y-6">
      <PrimaryTabs tabs={tabDefs} value={activeTab} onValueChange={setActiveTab}>
        <TabsContent value="registrations" className="pt-6">
          <RegistrationsSection dog={dog} autoOpenAddDialog={autoOpenAddRegistration} />
        </TabsContent>

        <TabsContent value="competitions" className="pt-6">
          <Suspense fallback={<TabContentSkeleton />}>
            <CompetitionsTabs dogId={dog.id} isPremium={isPremium} />
          </Suspense>
        </TabsContent>

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

        <TabsContent value="health-records" className="pt-6">
          <BlurGate
            locked={!isLoading && !isPremium}
            trackingContext="health-records"
            title="Health Records"
            description="Keep comprehensive health records for your dog's wellbeing."
          >
            <Suspense fallback={<TabContentSkeleton />}>
              <HealthRecordsSection user={{ isPremium }} dogId={dog.id} />
            </Suspense>
          </BlurGate>
        </TabsContent>

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

        <TabsContent value="activity" className="pt-6">
          <Suspense fallback={<TabContentSkeleton />}>
            <ActivityTimeline recordType="dog" recordId={dog.id} />
          </Suspense>
        </TabsContent>
      </PrimaryTabs>
    </div>
  );
};

export default DogDetailsTabs;
