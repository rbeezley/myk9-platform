import React, { useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Plus } from 'lucide-react';
import UpcomingShowsSection from './UpcomingShows/UpcomingShowsSection';
import PastResultsSection from './PastResults/PastResultsSection';
import AchievementsSection from './Achievements/AchievementsSection';
import { useAchievementsStore } from '@/store/achievementsStore';
import type { Achievement } from '@/types/achievement-types';
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface CompetitionsTabsProps {}

const tabs = [
  { label: 'Upcoming Shows', key: 'upcoming' },
  { label: 'Past Results', key: 'past' },
  { label: 'Achievements', key: 'achievements' },
];

const CompetitionsTabs: React.FC<CompetitionsTabsProps> = () => {
  const [activeTab, setActiveTab] = useState('upcoming');
  const [showAddDialog, setShowAddDialog] = useState(false);

  // Handlers for add actions
  const handleAdd = () => {
    if (activeTab === 'upcoming') {
      setShowAddDialog(true);
    }
    // Add handlers for other tabs if needed
  };

  // Button label based on active tab
  const addButtonLabel =
    activeTab === 'upcoming' ? 'Add External Show' :
    activeTab === 'past' ? 'Add External Past Result' :
    'Add External Achievement';

  return (
    <div className="apple-section-card">
      <div className="apple-section-header">
        <h2 className="apple-section-title">Competitions</h2>
        <button 
          onClick={handleAdd}
          className="apple-add-button"
        >
          <Plus className="w-4 h-4" /> 
          {addButtonLabel}
        </button>
      </div>
      <Tabs defaultValue="upcoming" value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="apple-sub-tabs">
          {tabs.map(tab => (
            <TabsTrigger 
              key={tab.key} 
              value={tab.key}
              className="apple-sub-tab"
            >
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
          <PastResultsSection 
            addDialogOpen={false} 
            setAddDialogOpen={() => {}} 
          />
        </TabsContent>
        <TabsContent value="achievements">
          <AchievementsSection 
            achievements={useAchievementsStore(state => state.achievements)}
            addAchievement={(achievementData) => { 
              const newAchievement: Achievement = {
                ...achievementData,
                id: Date.now().toString() // Generate a temporary ID
              };
              useAchievementsStore.getState().addAchievement(newAchievement);
            }}
            editAchievement={(id, achievementData) => { 
              const achievementToUpdate: Achievement = {
                ...achievementData, 
                id: id             
              };
              useAchievementsStore.getState().editAchievement(id, achievementToUpdate);
            }}
            deleteAchievement={(id) => {
              useAchievementsStore.getState().deleteAchievement(id);
            }}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default CompetitionsTabs;
