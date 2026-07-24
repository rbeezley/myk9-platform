import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { RichTextEditor } from './RichTextEditor';
import type { TrainingEntry } from './EnhancedTrainingJournal';
import { progressLabels } from './TrainingJournal.constants';

interface TrainingEntryFormProps {
  entry?: TrainingEntry;
  onSubmit: (data: Omit<TrainingEntry, 'id'>) => void;
  onCancel: () => void;
}

export function TrainingEntryForm({ entry, onSubmit, onCancel }: TrainingEntryFormProps) {
  const [formData, setFormData] = useState({
    title: entry?.title || '',
    content: entry?.content || '',
    date: entry?.date || new Date(),
    duration: entry?.duration || 30,
    skills: entry?.skills || [],
    difficulty: entry?.difficulty || 3,
    progress: entry?.progress || 'good',
    photos: entry?.photos || [],
    notes: entry?.notes || '',
    goals: entry?.goals || [],
  });

  const handleSubmit = () => {
    onSubmit(formData as Omit<TrainingEntry, 'id'>);
    onCancel();
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label htmlFor="training-entry-title" className="block text-sm font-medium mb-2">
            Session Title
          </label>
          <Input
            id="training-entry-title"
            value={formData.title}
            onChange={e => setFormData(prev => ({ ...prev, title: e.target.value }))}
            placeholder="e.g., Basic obedience training"
            className="min-h-11"
          />
        </div>

        <div>
          <label htmlFor="training-entry-duration" className="block text-sm font-medium mb-2">
            Duration (minutes)
          </label>
          <Input
            id="training-entry-duration"
            type="number"
            value={formData.duration}
            onChange={e =>
              setFormData(prev => ({ ...prev, duration: parseInt(e.target.value) || 0 }))
            }
            className="min-h-11"
          />
        </div>

        <div>
          <label htmlFor="training-entry-difficulty" className="block text-sm font-medium mb-2">
            Difficulty
          </label>
          <select
            id="training-entry-difficulty"
            value={formData.difficulty}
            onChange={e =>
              setFormData(prev => ({
                ...prev,
                difficulty: parseInt(e.target.value) as 1 | 2 | 3 | 4 | 5,
              }))
            }
            className="w-full px-3 py-2 border rounded-md min-h-11"
          >
            {[1, 2, 3, 4, 5].map(level => (
              <option key={level} value={level}>
                {'★'.repeat(level)} {level === 1 ? 'Very Easy' : level === 5 ? 'Very Hard' : ''}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="training-entry-progress" className="block text-sm font-medium mb-2">
            Progress
          </label>
          <select
            id="training-entry-progress"
            value={formData.progress}
            onChange={e =>
              setFormData(prev => ({
                ...prev,
                progress: e.target.value as TrainingEntry['progress'],
              }))
            }
            className="w-full px-3 py-2 border rounded-md min-h-11"
          >
            {Object.entries(progressLabels).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">Training Notes</label>
        <RichTextEditor
          content={formData.content}
          onChange={content => setFormData(prev => ({ ...prev, content }))}
          placeholder="Describe what you worked on, how your dog performed, and any observations..."
        />
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel} className="min-h-11">
          Cancel
        </Button>
        <Button onClick={handleSubmit} disabled={!formData.title.trim()} className="min-h-11">
          {entry ? 'Update' : 'Add'} Entry
        </Button>
      </div>
    </div>
  );
}
