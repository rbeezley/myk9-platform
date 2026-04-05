import React, { useState } from 'react';
import { SubTabs, SubTabsContent } from '@/components/common/SubTabs';
import type { SubTabDef } from '@/components/common/SubTabs';
import { Plus, Calendar, History, Award } from 'lucide-react';
import UpcomingShowsSection from './UpcomingShows/UpcomingShowsSection';
import PastResultsSection from './PastResults/PastResultsSection';
import AchievementsSection from './Achievements/AchievementsSection';

interface CompetitionsTabsProps {
  dogId: string;
  isPremium: boolean;
}

const tabs: SubTabDef[] = [
  { id: 'upcoming', label: 'Upcoming Shows', icon: Calendar },
  { id: 'past', label: 'Past Results', icon: History },
  { id: 'achievements', label: 'Achievements', icon: Award },
];

const CompetitionsTabs: React.FC<CompetitionsTabsProps> = ({ dogId, isPremium }) => {
  const [activeTab, setActiveTab] = useState('upcoming');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [addPastResultOpen, setAddPastResultOpen] = useState(false);
  const [addAchievementOpen, setAddAchievementOpen] = useState(false);

  const handleAdd = () => {
    if (activeTab === 'upcoming') {
      setShowAddDialog(true);
    } else if (activeTab === 'past') {
      setAddPastResultOpen(true);
    } else if (activeTab === 'achievements') {
      setAddAchievementOpen(true);
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
      <SubTabs tabs={tabs} value={activeTab} onValueChange={setActiveTab} className="w-full">
        <SubTabsContent value="upcoming">
          <UpcomingShowsSection
            showAddDialog={showAddDialog}
            onAddDialogClose={() => setShowAddDialog(false)}
          />
        </SubTabsContent>
        <SubTabsContent value="past">
          <PastResultsSection
            dogId={dogId}
            isPremium={isPremium}
            addDialogOpen={addPastResultOpen}
            setAddDialogOpen={setAddPastResultOpen}
          />
        </SubTabsContent>
        <SubTabsContent value="achievements">
          <AchievementsSection
            dogId={dogId}
            addDialogOpen={addAchievementOpen}
            setAddDialogOpen={setAddAchievementOpen}
          />
        </SubTabsContent>
      </SubTabs>
    </div>
  );
};

export default CompetitionsTabs;
