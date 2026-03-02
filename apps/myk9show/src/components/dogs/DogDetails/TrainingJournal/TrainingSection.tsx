import { useState, useMemo } from 'react';
import { EnhancedTrainingJournal } from './EnhancedTrainingJournal';
import { Button } from '@/components/ui/button';
import { BookOpen, Calendar, List } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import {
  useTrainingEntriesQuery,
  useCreateTrainingEntryMutation,
  useUpdateTrainingEntryMutation,
  useDeleteTrainingEntryMutation,
} from '@/hooks/queries/useTrainingDatabase';
import type { TrainingJournalEntry, TrainingAssessment } from '@/types/training';

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
}

export default function TrainingSection({ dogId }: TrainingSectionProps) {
  const [viewMode, setViewMode] = useState<'enhanced' | 'traditional'>('enhanced');
  const { user } = useAuth();

  const { data: entries = [], isLoading, isError, error } = useTrainingEntriesQuery(dogId);
  const createMutation = useCreateTrainingEntryMutation();
  const updateMutation = useUpdateTrainingEntryMutation();
  const deleteMutation = useDeleteTrainingEntryMutation();

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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading training journal...</p>
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

  if (viewMode === 'enhanced') {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <BookOpen className="h-6 w-6" />
              Training Journal
            </h2>
            <p className="text-muted-foreground">
              Track training sessions, progress, and achievements with our enhanced journal
            </p>
          </div>

          <Button variant="outline" size="sm" onClick={() => setViewMode('traditional')}>
            <List className="h-4 w-4 mr-2" />
            Traditional View
          </Button>
        </div>

        <EnhancedTrainingJournal
          entries={enhancedEntries}
          onAddEntry={handleAddEntry}
          onUpdateEntry={handleUpdateEntry}
        />
      </div>
    );
  }

  // Traditional view
  return (
    <div className="bg-background rounded-xl shadow-sm p-6 border">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <BookOpen className="h-5 w-5" />
          Training Journal
        </h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setViewMode('enhanced')}>
            <Calendar className="h-4 w-4 mr-2" />
            Enhanced View
          </Button>
        </div>
      </div>

      {entries.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <BookOpen className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>No training sessions recorded yet.</p>
          <p className="text-sm mt-1">
            Switch to Enhanced View to add your first training session.
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {entries.map(entry => (
            <div key={entry.id} className="p-4 border rounded-lg">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-medium">{entry.title}</h3>
                  <p className="text-sm text-muted-foreground">
                    {new Date(entry.date).toLocaleDateString()}
                    {entry.duration_minutes && ` \u2022 ${entry.duration_minutes}min`}
                  </p>
                  {entry.content && <p className="text-sm mt-2">{entry.content}</p>}
                </div>
                <div className="flex items-center gap-2">
                  {entry.sport_tag && (
                    <span className="text-xs text-muted-foreground">{entry.sport_tag}</span>
                  )}
                  {entry.assessment && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-muted">
                      {entry.assessment}
                    </span>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => deleteMutation.mutate(entry.id)}>
                    Delete
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
