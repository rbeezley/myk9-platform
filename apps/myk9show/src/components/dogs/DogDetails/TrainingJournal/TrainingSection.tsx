import { useMemo } from 'react';
import { EnhancedTrainingJournal } from './EnhancedTrainingJournal';
import { BookOpen } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import {
  useTrainingEntriesQuery,
  useCreateTrainingEntryMutation,
  useUpdateTrainingEntryMutation,
  useDeleteTrainingEntryMutation,
  useTrainingGoalsQuery,
  useCreateTrainingGoalMutation,
  useUpdateTrainingGoalMutation,
} from '@/hooks/queries/useTrainingDatabase';
import type { TrainingJournalEntry, TrainingAssessment, TrainingGoal } from '@/types/training';
import { Skeleton } from '@/components/common/SkeletonLoaders';

// Map DB assessment to UI progress labels
const assessmentToProgress: Record<TrainingAssessment, string> = {
  breakthrough: 'excellent',
  solid: 'good',
  needs_work: 'fair',
  regression: 'needs_work',
};

const progressToAssessment: Record<string, TrainingAssessment> = {
  excellent: 'breakthrough',
  good: 'solid',
  fair: 'needs_work',
  needs_work: 'regression',
};

// Enhanced entry type for journal display
interface EnhancedTrainingEntry {
  id: string;
  title: string;
  content: string;
  date: Date;
  duration: number;
  skills: string[];
  difficulty: 1 | 2 | 3 | 4 | 5;
  progress: 'excellent' | 'good' | 'fair' | 'needs_work';
  photos: string[];
  notes?: string;
  goals?: string[];
}

const dbToEnhanced = (entry: TrainingJournalEntry): EnhancedTrainingEntry => ({
  id: entry.id,
  title: entry.title,
  content: entry.content || '',
  date: new Date(entry.date + 'T00:00:00'),
  duration: entry.duration_minutes ?? 30,
  skills: entry.sport_tag ? [entry.sport_tag] : [],
  difficulty: 3,
  progress: entry.assessment
    ? (assessmentToProgress[entry.assessment] as EnhancedTrainingEntry['progress'])
    : 'good',
  photos: [],
  notes: entry.notes ?? '',
  goals: entry.goals,
});

interface TrainingSectionProps {
  dogId: string;
  readOnly?: boolean;
}

export default function TrainingSection({ dogId, readOnly = false }: TrainingSectionProps) {
  const { user } = useAuth();

  const { data: entries = [], isLoading, isError, error } = useTrainingEntriesQuery(dogId);
  const { data: goals = [] } = useTrainingGoalsQuery(dogId);
  const createMutation = useCreateTrainingEntryMutation();
  const updateMutation = useUpdateTrainingEntryMutation();
  const deleteMutation = useDeleteTrainingEntryMutation();
  const createGoalMutation = useCreateTrainingGoalMutation();
  const updateGoalMutation = useUpdateTrainingGoalMutation();

  const enhancedEntries = useMemo(() => entries.map(dbToEnhanced), [entries]);

  const handleAddEntry = (entry: {
    title: string;
    content?: string;
    notes?: string;
    skills?: string[];
    duration?: number;
    progress?: string;
  }) => {
    if (!user) return;
    createMutation.mutate({
      dog_id: dogId,
      owner_id: user.id,
      title: entry.title,
      content: entry.content || entry.notes || null,
      date: new Date().toISOString().split('T')[0],
      duration_minutes: entry.duration ?? null,
      location: null,
      sport_tag: entry.skills?.[0] ?? null,
      assessment: entry.progress ? (progressToAssessment[entry.progress] ?? null) : null,
      linked_result_id: null,
      notes: entry.notes ?? null,
      goals: entry.skills ?? [],
    });
  };

  const handleUpdateEntry = (id: string, entry: Partial<EnhancedTrainingEntry>) => {
    updateMutation.mutate({
      id,
      updates: {
        ...(entry.title !== undefined ? { title: entry.title } : {}),
        ...(entry.content !== undefined ? { content: entry.content } : {}),
        ...(entry.date !== undefined ? { date: entry.date.toISOString().split('T')[0] } : {}),
        ...(entry.duration !== undefined ? { duration_minutes: entry.duration } : {}),
        ...(entry.skills !== undefined ? { sport_tag: entry.skills[0] ?? null } : {}),
        ...(entry.progress !== undefined
          ? { assessment: progressToAssessment[entry.progress] ?? null }
          : {}),
        ...(entry.notes !== undefined ? { notes: entry.notes ?? null } : {}),
        ...(entry.goals !== undefined ? { goals: entry.goals ?? [] } : {}),
      },
    });
  };

  const handleCreateGoal = async (goal: {
    title: string;
    target_date: string | null;
    sport_tag: string | null;
  }): Promise<void> => {
    if (!user) return;
    await createGoalMutation.mutateAsync({
      dog_id: dogId,
      owner_id: user.id,
      title: goal.title,
      target_date: goal.target_date,
      sport_tag: goal.sport_tag,
      notes: null,
      completed_at: null,
    });
  };

  const handleToggleGoal = (goal: TrainingGoal) => {
    updateGoalMutation.mutate({
      id: goal.id,
      updates: {
        completed_at: goal.completed_at ? null : new Date().toISOString(),
      },
    });
  };

  if (isLoading) {
    return (
      <div role="status" aria-label="Loading training journal" className="space-y-4 py-4">
        <div className="rounded-xl border bg-card p-6">
          <div className="mb-5 flex items-center justify-between gap-4">
            <div className="space-y-2">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-72 max-w-full" />
            </div>
            <Skeleton className="h-10 w-28" />
          </div>
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-20 rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <BookOpen className="h-12 w-12 text-muted-foreground mb-4 mx-auto" />
          <h3 className="text-lg font-semibold mb-2">Unable to load training journal</h3>
          <p className="text-muted-foreground mb-4">
            {error?.message || 'There was an error loading the training journal.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <EnhancedTrainingJournal
      entries={enhancedEntries}
      goals={goals}
      onAddEntry={handleAddEntry}
      onUpdateEntry={handleUpdateEntry}
      onDeleteEntry={async id => {
        await deleteMutation.mutateAsync(id);
      }}
      onCreateGoal={handleCreateGoal}
      onToggleGoal={handleToggleGoal}
      readOnly={readOnly}
    />
  );
}
