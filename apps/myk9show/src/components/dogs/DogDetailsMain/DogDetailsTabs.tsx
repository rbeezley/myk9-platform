import React, { lazy, Suspense } from 'react';
import { Crown, FileText } from 'lucide-react';
import { logger } from '@/services/LoggingService';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import RegistrationsSection from '@/components/dogs/DogDetails/Registrations/RegistrationsSection';
import { PremiumGate } from '@/components/common/PremiumGate';
import { mockPedigreeData } from '@/data/mockPedigreeData';
import { TabContentSkeleton } from './Skeletons';
import { user } from './utils';
import type { DogDetailsTabsProps } from './types';

// Lazy load heavy components
const TrainingSection = lazy(() => import('@/components/dogs/DogDetails/TrainingJournal/TrainingSection'));
const HealthRecordsSection = lazy(() => import('@/components/dogs/DogDetails/HealthRecords/HealthRecordsSection'));
const CompetitionsTabs = lazy(() => import('@/components/dogs/DogDetails/Competitions/CompetitionsTabs'));
const TitleProgressSection = lazy(() => import('@/components/dogs/DogDetails/TitleTracking/TitleProgressSection'));
const PedigreeSection = lazy(() => import('@/components/dogs/DogDetails/Pedigree/PedigreeSection'));

const DogDetailsTabs: React.FC<DogDetailsTabsProps> = ({
  dog,
  autoOpenAddRegistration,
  ancestors,
  onSetAncestors,
}) => {
  const handlePremiumTabClick = (e: React.MouseEvent) => {
    if (!user.isPremium) {
      e.preventDefault();
      logger.debug('Premium feature clicked', 'dogs');
    }
  };

  return (
    <div className="space-y-6">
      <TooltipProvider>
        <Tabs defaultValue="registrations" className="w-full">
          <TabsList className="overflow-x-auto no-scrollbar">
            <TabsTrigger value="registrations">
              <FileText className="w-4 h-4" />
              Registrations
            </TabsTrigger>
            <Tooltip>
              <TooltipTrigger asChild>
                <TabsTrigger
                  value="competitions"
                  disabled={!user.isPremium}
                  onClick={!user.isPremium ? handlePremiumTabClick : undefined}
                >
                  <Crown className="w-4 h-4" />
                  Competitions
                </TabsTrigger>
              </TooltipTrigger>
              <TooltipContent>
                <p>Access Competitions - Premium Feature</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <TabsTrigger
                  value="title-progress"
                  disabled={!user.isPremium}
                  onClick={!user.isPremium ? handlePremiumTabClick : undefined}
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
                  value="health-records"
                  disabled={!user.isPremium}
                  onClick={!user.isPremium ? handlePremiumTabClick : undefined}
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
                  disabled={!user.isPremium}
                  onClick={!user.isPremium ? handlePremiumTabClick : undefined}
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
                  disabled={!user.isPremium}
                  onClick={!user.isPremium ? handlePremiumTabClick : undefined}
                >
                  <Crown className="w-4 h-4" />
                  Pedigree
                </TabsTrigger>
              </TooltipTrigger>
              <TooltipContent>
                <p>Access Pedigree - Premium Feature</p>
              </TooltipContent>
            </Tooltip>
          </TabsList>

          {/* Tab Content */}
          <TabsContent value="registrations" className="pt-6">
            <RegistrationsSection dog={dog} autoOpenAddDialog={autoOpenAddRegistration} />
          </TabsContent>

          <TabsContent value="competitions" className="pt-6">
            {user.isPremium ? (
              <Suspense fallback={<TabContentSkeleton />}>
                <CompetitionsTabs />
              </Suspense>
            ) : (
              <PremiumGate
                title="Competitions"
                description="Track your dog's competition history and achievements with our premium features."
                trackingContext="competitions"
              />
            )}
          </TabsContent>

          <TabsContent value="title-progress" className="pt-6">
            {user.isPremium ? (
              <Suspense fallback={<TabContentSkeleton />}>
                <TitleProgressSection initialTitleProgressList={[]} />
              </Suspense>
            ) : (
              <PremiumGate
                title="Title Progress"
                description="Monitor your dog's progress toward titles and certifications."
                trackingContext="title-progress"
              />
            )}
          </TabsContent>

          <TabsContent value="health-records" className="pt-6">
            {user.isPremium ? (
              <Suspense fallback={<TabContentSkeleton />}>
                <HealthRecordsSection user={user} />
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
            {user.isPremium ? (
              <Suspense fallback={<TabContentSkeleton />}>
                <TrainingSection />
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
            {user.isPremium ? (
              <Suspense fallback={<TabContentSkeleton />}>
                <PedigreeSection
                  header={<h2 className="text-lg font-semibold flex items-center">Pedigree</h2>}
                  pedigree={ancestors.length > 0 ? ancestors : mockPedigreeData}
                  addAncestor={(ancestor) => onSetAncestors(prev => [...prev, { ...ancestor, id: String(Date.now()) }])}
                  editAncestor={(id, updated) => onSetAncestors(prev => prev.map(a => String(a.id) === id ? updated : a))}
                  deleteAncestor={(id) => onSetAncestors(prev => prev.filter(a => String(a.id) !== id))}
                />
              </Suspense>
            ) : (
              <PremiumGate
                title="Pedigree"
                description="Explore your dog's lineage and ancestry with detailed pedigree tracking."
                trackingContext="pedigree"
              />
            )}
          </TabsContent>
        </Tabs>
      </TooltipProvider>
    </div>
  );
};

export default DogDetailsTabs;
