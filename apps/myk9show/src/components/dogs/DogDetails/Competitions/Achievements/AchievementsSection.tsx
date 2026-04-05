import React, { useState, useMemo } from 'react';
import SectionCard from '@/components/common/SectionCard';
import AddAchievementDialog from './AddAchievementDialog';
import EditAchievementDialog from './EditAchievementDialog';
import AchievementDetailsDialog from './AchievementDetailsDialog';
import ThreeDotMenu from '@/components/ui/ThreeDotMenu';
import { formatDateMMDDYYYY } from '@/utils/dateFormat';
import { getInitials } from '@/lib/utils';
import type { Achievement as SimpleAchievement } from '@/types/achievement-types';
import type { Achievement as DbAchievement } from '@/types/achievement';
import {
  useAchievements,
  useCreateAchievement,
  useUpdateAchievement,
  useDeleteAchievement,
} from '@/hooks/queries/useAchievementsDatabase';
import { Eye, Pencil, Trash2, Trophy } from 'lucide-react';

interface AchievementsSectionProps {
  dogId: string;
  addDialogOpen: boolean;
  setAddDialogOpen: (open: boolean) => void;
}

/** Map DB Achievement → simple display type for existing dialogs */
function toSimple(a: DbAchievement): SimpleAchievement {
  return {
    id: a.id,
    title: a.title,
    date: a.date_earned,
    description: a.notes ?? '',
  };
}

const AchievementsSection: React.FC<AchievementsSectionProps> = ({
  dogId,
  addDialogOpen,
  setAddDialogOpen,
}) => {
  const { data: dbAchievements = [], isLoading } = useAchievements(dogId);
  const createMutation = useCreateAchievement();
  const updateMutation = useUpdateAchievement();
  const deleteMutation = useDeleteAchievement();
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [selectedAchievement, setSelectedAchievement] = useState<SimpleAchievement | null>(null);

  const achievements = useMemo(() => dbAchievements.map(toSimple), [dbAchievements]);

  const handleAdd = (data: Omit<SimpleAchievement, 'id'>) => {
    createMutation.mutate({
      dog_id: dogId,
      title: data.title,
      date_earned: data.date,
      notes: data.description,
      achievement_type: 'Title',
      organization: 'Other',
    });
    setAddDialogOpen(false);
  };

  const handleEdit = (id: string, data: Omit<SimpleAchievement, 'id'>) => {
    updateMutation.mutate({
      id,
      title: data.title,
      date_earned: data.date,
      notes: data.description,
    });
    setEditDialogOpen(false);
  };

  const handleDelete = (id: string) => {
    deleteMutation.mutate({ id, dogId });
  };

  if (isLoading) {
    return (
      <div className="bg-card rounded-xl p-6 flex items-center justify-center py-12 text-muted-foreground">
        Loading achievements...
      </div>
    );
  }

  if (achievements.length === 0) {
    return (
      <div className="bg-card rounded-xl p-6 flex flex-col items-center justify-center py-12 text-muted-foreground gap-3">
        <Trophy className="w-10 h-10 opacity-40" />
        <p className="text-sm">No achievements yet.</p>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-xl p-6">
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {achievements.map(ach => (
          <SectionCard key={ach.id} className="flex flex-col gap-2 relative">
            <div className="absolute top-4 right-4 z-10">
              <ThreeDotMenu
                items={[
                  {
                    label: 'View Details',
                    icon: <Eye className="w-4 h-4 mr-2" />,
                    onClick: () => {
                      setSelectedAchievement(ach);
                      setViewDialogOpen(true);
                    },
                  },
                  {
                    label: 'Edit',
                    icon: <Pencil className="w-4 h-4 mr-2" />,
                    onClick: () => {
                      setSelectedAchievement(ach);
                      setEditDialogOpen(true);
                    },
                  },
                  {
                    label: 'Delete',
                    icon: <Trash2 className="w-4 h-4 mr-2 text-destructive" />,
                    onClick: () => handleDelete(ach.id),
                    className: 'text-destructive hover:text-destructive',
                  },
                ]}
              />
            </div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="text-xs font-medium text-primary">{getInitials(ach.title)}</span>
              </div>
              <h3 className="font-medium">{ach.title}</h3>
            </div>
            <p className="text-sm text-muted-foreground line-clamp-2">{ach.description}</p>
            <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              {ach.date ? formatDateMMDDYYYY(ach.date) : 'No date'}
            </div>
          </SectionCard>
        ))}
      </div>
      <AddAchievementDialog
        open={addDialogOpen}
        onClose={() => setAddDialogOpen(false)}
        onAdd={handleAdd}
      />
      <EditAchievementDialog
        open={editDialogOpen}
        onClose={() => setEditDialogOpen(false)}
        onSave={handleEdit}
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
