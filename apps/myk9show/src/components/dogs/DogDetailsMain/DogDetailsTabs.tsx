import React, { lazy, Suspense } from 'react';
import { Activity, Crown, FileText, Trophy, Stethoscope, BookOpen, GitBranch } from 'lucide-react';
import { TabsContent } from '@/components/ui/tabs';
import { PrimaryTabs, type PrimaryTabDef } from '@/components/common/PrimaryTabs';
import { useUrlTab } from '@/hooks/useUrlTab';
import RegistrationsSection from '@/components/dogs/DogDetails/Registrations/RegistrationsSection';
import { PremiumGate } from '@/components/common/PremiumGate';
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
  const { isPremium } = useSubscriptionGate();
  const [activeTab, setActiveTab] = useUrlTab(TAB_IDS, 'registrations');

  const tabDefs: PrimaryTabDef[] = [
    { id: 'registrations', label: 'Registrations', icon: FileText },
    { id: 'competitions', label: 'Competitions', icon: Trophy },
    { id: 'title-progress', label: 'Title Progress', icon: Crown },
    { id: 'statistics', label: 'Statistics', icon: Crown },
    { id: 'health-records', label: 'Health Records', icon: Stethoscope },
    { id: 'training-journal', label: 'Training Journal', icon: BookOpen },
    { id: 'pedigree', label: 'Pedigree', icon: GitBranch },
    { id: 'activity', label: 'Activity', icon: Activity },
  ];

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
          {isPremium ? (
            <Suspense fallback={<TabContentSkeleton />}>
              <TitleProgressSection dogId={dog.id} />
            </Suspense>
          ) : (
            <PremiumGate
              title="Title Progress"
              description="Monitor your dog's progress toward titles and certifications."
              trackingContext="title-progress"
            />
          )}
        </TabsContent>

        <TabsContent value="statistics" className="pt-6">
          {isPremium ? (
            <Suspense fallback={<TabContentSkeleton />}>
              <PerformanceStatisticsSection dogId={dog.id} />
            </Suspense>
          ) : (
            <PremiumGate
              title="Statistics"
              description="Visualize your dog's performance trends, qualification rates, and achievements."
              trackingContext="statistics"
            />
          )}
        </TabsContent>

        <TabsContent value="health-records" className="pt-6">
          {isPremium ? (
            <Suspense fallback={<TabContentSkeleton />}>
              <HealthRecordsSection user={{ isPremium }} dogId={dog.id} />
            </Suspense>
          ) : (
            <PremiumGate
              title="Health Records"
              description="Keep comprehensive health records for your dog's wellbeing."
              trackingContext="health-records"
            />
          )}
        </TabsContent>

        <TabsContent value="training-journal" className="pt-6">
          {isPremium ? (
            <Suspense fallback={<TabContentSkeleton />}>
              <TrainingSection dogId={dog.id} />
            </Suspense>
          ) : (
            <PremiumGate
              title="Training Journal"
              description="Document training sessions and track your dog's progress."
              trackingContext="training-journal"
            />
          )}
        </TabsContent>

        <TabsContent value="pedigree" className="pt-6">
          {isPremium ? (
            <Suspense fallback={<TabContentSkeleton />}>
              <PedigreeSection dogId={dog.id} />
            </Suspense>
          ) : (
            <PremiumGate
              title="Pedigree"
              description="Explore your dog's lineage and ancestry with detailed pedigree tracking."
              trackingContext="pedigree"
            />
          )}
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
