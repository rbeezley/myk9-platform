import React, { useState, useMemo } from 'react';
import { EnhancedTrainingJournal } from './EnhancedTrainingJournal';
import { Button } from '@/components/ui/button';
import { BookOpen, Calendar, List } from 'lucide-react';
import { MOCK_TRAINING_ENTRIES } from '@/mockData/mockTrainingEntries';
import type { TrainingEntry } from './AddTrainingEntryDialog';

// Enhanced TrainingEntry type for journal display
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

// Convert mock training entries to our enhanced format
const convertToEnhancedFormat = (mockEntries: Array<{ id: number; exerciseName?: string; notes?: string; date: string; duration?: number; skills?: string; difficulty?: number; progress?: string }>): EnhancedTrainingEntry[] => {
  return mockEntries.map(entry => ({
    id: String(entry.id),
    title: entry.exerciseName || 'Training Session',
    content: entry.notes || 'Training session completed',
    date: new Date(entry.date),
    duration: entry.duration || 30,
    skills: entry.skills ? entry.skills.split(',').map((s: string) => s.trim()) : ['Basic Training'],
    difficulty: (entry.difficulty || 3) as 1 | 2 | 3 | 4 | 5,
    progress: (entry.progress || 'good') as 'excellent' | 'good' | 'fair' | 'needs_work',
    photos: [],
    notes: entry.notes || '',
    goals: []
  }));
};

export default function TrainingSection() {
  const [viewMode, setViewMode] = useState<'enhanced' | 'traditional'>('enhanced');
  const [trainingEntries, setTrainingEntries] = useState(MOCK_TRAINING_ENTRIES);
  
  const enhancedEntries = useMemo(() => 
    convertToEnhancedFormat(trainingEntries),
    [trainingEntries]
  );

  const handleAddEntry = (entry: { title: string; content?: string; notes?: string; skills?: string[] }) => {
    const newEntry = {
      id: Date.now(),
      title: entry.title,
      notes: entry.content || entry.notes || '',
      date: new Date().toISOString().split('T')[0],
      tags: entry.skills || []
    };
    setTrainingEntries(prev => [...prev, newEntry]);
  };

  const handleUpdateEntry = (id: string, entry: Partial<EnhancedTrainingEntry>) => {
    // Convert EnhancedTrainingEntry to proper TrainingEntry format for storage
    const updatedEntry: TrainingEntry = {
      id: parseInt(id),
      title: entry.title || '',
      notes: entry.content || entry.notes || '',
      date: entry.date ? entry.date.toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
      tags: entry.skills || []
    };
    setTrainingEntries(prev => prev.map(e => 
      String(e.id) === id ? updatedEntry : e
    ));
  };

  // const handleDeleteEntry = (id: string) => {
  //   setTrainingEntries(prev => prev.filter(e => String(e.id) !== id));
  // };

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
          
          <Button
            variant="outline"
            size="sm"
            onClick={() => setViewMode('traditional')}
          >
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

  // Traditional view (simplified fallback)
  return (
    <div className="bg-background rounded-xl shadow-sm p-6 border">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <BookOpen className="h-5 w-5" />
          Training Journal
        </h2>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setViewMode('enhanced')}
          >
            <Calendar className="h-4 w-4 mr-2" />
            Enhanced View
          </Button>
          <Button variant="default" size="sm">
            + Add Entry
          </Button>
        </div>
      </div>
      
      <div className="grid gap-4">
        {trainingEntries.map(entry => (
          <div key={entry.id} className="p-4 border rounded-lg">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="font-medium">{entry.title}</h3>
                <p className="text-sm text-muted-foreground">
                  {new Date(entry.date).toLocaleDateString()}
                </p>
                {entry.notes && (
                  <p className="text-sm mt-2">{entry.notes}</p>
                )}
              </div>
              <span className="text-xs text-muted-foreground">
                {entry.tags?.join(', ')}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}