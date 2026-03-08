import React, { lazy, Suspense } from 'react';
import { Activity, Crown, FileText } from 'lucide-react';
import { logger } from '@/services/LoggingService';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useRememberedTab } from '@/hooks/useRememberedTab';
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
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

const DogDetailsTabs: React.FC<DogDetailsTabsProps> = ({ dog, autoOpenAddRegistration }) => {
  const { isPremium } = useSubscriptionGate();
  const [activeTab, setActiveTab] = useRememberedTab('dog-details', 'registrations');

  const handlePremiumTabClick = (e: React.MouseEvent) => {
    if (!isPremium) {
      e.preventDefault();
      logger.debug('Premium feature clicked', 'dogs');
    }
  };

  return (
    <div className="space-y-6">
      <TooltipProvider>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="overflow-x-auto no-scrollbar">
            <TabsTrigger value="registrations">
              <FileText className="w-4 h-4" />
              Registrations
            </TabsTrigger>
            <TabsTrigger value="competitions">Competitions</TabsTrigger>
            <Tooltip>
              <TooltipTrigger asChild>
                <TabsTrigger
                  value="title-progress"
                  disabled={!isPremium}
                  onClick={!isPremium ? handlePremiumTabClick : undefined}
                >
                  <Crown className="w-4 h-4" />
                  Title Progress
                </TabsTrigger>
              </TooltipTrigger>
              <TooltipContent>
                <p>Access Title Progress - Premium Feature</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <TabsTrigger
                  value="statistics"
                  disabled={!isPremium}
                  onClick={!isPremium ? handlePremiumTabClick : undefined}
                >
                  <Crown className="w-4 h-4" />
                  Statistics
                </TabsTrigger>
              </TooltipTrigger>
              <TooltipContent>
                <p>Access Statistics - Premium Feature</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <TabsTrigger
                  value="health-records"
                  disabled={!isPremium}
                  onClick={!isPremium ? handlePremiumTabClick : undefined}
                >
                  <Crown className="w-4 h-4" />
                  Health Records
                </TabsTrigger>
              </TooltipTrigger>
              <TooltipContent>
                <p>Access Health Records - Premium Feature</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <TabsTrigger
                  value="training-journal"
                  disabled={!isPremium}
                  onClick={!isPremium ? handlePremiumTabClick : undefined}
                >
                  <Crown className="w-4 h-4" />
                  Training Journal
                </TabsTrigger>
              </TooltipTrigger>
              <TooltipContent>
                <p>Access Training Journal - Premium Feature</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <TabsTrigger
                  value="pedigree"
                  disabled={!isPremium}
                  onClick={!isPremium ? handlePremiumTabClick : undefined}
                >
                  <Crown className="w-4 h-4" />
                  Pedigree
                </TabsTrigger>
              </TooltipTrigger>
              <TooltipContent>
                <p>Access Pedigree - Premium Feature</p>
              </TooltipContent>
            </Tooltip>
            <TabsTrigger value="activity">
              <Activity className="w-4 h-4" />
              Activity
            </TabsTrigger>
          </TabsList>

          {/* Tab Content */}
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
        </Tabs>
      </TooltipProvider>
    </div>
  );
};

export default DogDetailsTabs;
