import React, { useState } from 'react';
import SectionCard from '@/components/common/SectionCard';
import AddAchievementDialog from './AddAchievementDialog';
import EditAchievementDialog from './EditAchievementDialog';
import AchievementDetailsDialog from './AchievementDetailsDialog';
import ThreeDotMenu from '@/components/ui/ThreeDotMenu';
import { formatDateMMDDYYYY } from '@/utils/dateFormat';
import type { Achievement } from '@/types/achievement-types';
import { Eye, Pencil, Trash2 } from 'lucide-react';

interface AchievementsSectionProps {
  achievements: Achievement[];
  addAchievement: (achievement: Omit<Achievement, 'id'>) => void;
  editAchievement: (id: string, achievement: Omit<Achievement, 'id'>) => void;
  deleteAchievement: (id: string) => void;
}

const AchievementsSection: React.FC<AchievementsSectionProps> = ({ 
  achievements = [], 
  addAchievement, 
  editAchievement, 
  deleteAchievement 
}) => {
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [selectedAchievement, setSelectedAchievement] = useState<Achievement | null>(null);

  const handleEdit = (ach: Achievement) => {
    setSelectedAchievement(ach);
    setEditDialogOpen(true);
  };

  const handleView = (ach: Achievement) => {
    setSelectedAchievement(ach);
    setViewDialogOpen(true);
  };

  return (
    <div className="bg-card rounded-xl p-6">
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {achievements.map((ach) => (
          <SectionCard key={ach.id} className="flex flex-col gap-2 relative">
            <div className="absolute top-4 right-4 z-10">
              <ThreeDotMenu
                items={[
                  {
                    label: 'View Details',
                    icon: <Eye className="w-4 h-4 mr-2" />,
                    onClick: () => handleView(ach),
                  },
                  {
                    label: 'Edit',
                    icon: <Pencil className="w-4 h-4 mr-2" />,
                    onClick: () => handleEdit(ach),
                  },
                  {
                    label: 'Delete',
                    icon: <Trash2 className="w-4 h-4 mr-2 text-destructive" />,
                    onClick: () => deleteAchievement(ach.id),
                    className: 'text-destructive hover:text-destructive',
                  },
                ]}
              />
            </div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="text-xs font-medium text-primary">
                  {ach.title.split(' ').map(w => w[0]).join('').toUpperCase().substring(0, 2)}
                </span>
              </div>
              <h3 className="font-medium">{ach.title}</h3>
            </div>
            <p className="text-sm text-muted-foreground line-clamp-2">
              {ach.description}
            </p>
            <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              {ach.date ? formatDateMMDDYYYY(ach.date) : 'No date'}
              {ach.icon && <span className="ml-1">{ach.icon}</span>}
            </div>
          </SectionCard>
        ))}
      </div>
      <AddAchievementDialog
        open={addDialogOpen}
        onClose={() => setAddDialogOpen(false)}
        onAdd={(achievement) => {
          addAchievement(achievement);
          setAddDialogOpen(false);
        }}
      />
      <EditAchievementDialog
        open={editDialogOpen}
        onClose={() => setEditDialogOpen(false)}
        onSave={(id, achievement) => {
          editAchievement(id, achievement);
          setEditDialogOpen(false);
        }}
        achievement={selectedAchievement}
      />
      <AchievementDetailsDialog
        open={viewDialogOpen}
        onClose={() => setViewDialogOpen(false)}
        achievement={selectedAchievement}
      />
    </div>
  );
};

export default AchievementsSection;
