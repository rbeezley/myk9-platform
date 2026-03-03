import React, { useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Plus } from 'lucide-react';
import UpcomingShowsSection from './UpcomingShows/UpcomingShowsSection';
import PastResultsSection from './PastResults/PastResultsSection';
import AchievementsSection from './Achievements/AchievementsSection';

interface CompetitionsTabsProps {
  dogId: string;
  isPremium: boolean;
}

const tabs = [
  { label: 'Upcoming Shows', key: 'upcoming' },
  { label: 'Past Results', key: 'past' },
  { label: 'Achievements', key: 'achievements' },
];

const CompetitionsTabs: React.FC<CompetitionsTabsProps> = ({ dogId, isPremium }) => {
  const [activeTab, setActiveTab] = useState('upcoming');
  const [showAddDialog, setShowAddDialog] = useState(false);

  const handleAdd = () => {
    if (activeTab === 'upcoming') {
      setShowAddDialog(true);
    }
  };

  const addButtonLabel =
    activeTab === 'upcoming'
      ? 'Add External Show'
      : activeTab === 'past'
        ? 'Add External Past Result'
        : 'Add External Achievement';

  return (
    <div className="myk9-section-card">
      <div className="myk9-section-header">
        <h2 className="myk9-section-title">Competitions</h2>
        {isPremium && (
          <button onClick={handleAdd} className="myk9-add-button">
            <Plus className="w-4 h-4" />
            {addButtonLabel}
          </button>
        )}
      </div>
      <Tabs
        defaultValue="upcoming"
        value={activeTab}
        onValueChange={setActiveTab}
        className="w-full"
      >
        <TabsList className="myk9-sub-tabs">
          {tabs.map(tab => (
            <TabsTrigger key={tab.key} value={tab.key} className="myk9-sub-tab">
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="upcoming">
          <UpcomingShowsSection
            showAddDialog={showAddDialog}
            onAddDialogClose={() => setShowAddDialog(false)}
          />
        </TabsContent>
        <TabsContent value="past">
          <PastResultsSection dogId={dogId} isPremium={isPremium} addDialogOpen={false} setAddDialogOpen={() => {}} />
        </TabsContent>
        <TabsContent value="achievements">
          <AchievementsSection dogId={dogId} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default CompetitionsTabs;
