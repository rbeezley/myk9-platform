import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { RichTextEditor } from './RichTextEditor';
import { 
  BookOpen, 
  Plus, 
  Search, 
  Filter, 
  Calendar, 
  Clock, 
  Star,
  Image,
  TrendingUp,
  Award
} from 'lucide-react';
import { SafeHTML } from '@/utils/sanitization';

interface TrainingEntry {
  id: string;
  title: string;
  content: string;
  date: Date;
  duration: number; // minutes
  skills: string[];
  difficulty: 1 | 2 | 3 | 4 | 5;
  progress: 'excellent' | 'good' | 'fair' | 'needs_work';
  photos: string[];
  notes?: string;
  goals?: string[];
}

interface EnhancedTrainingJournalProps {
  entries: TrainingEntry[];
  onAddEntry?: (entry: Omit<TrainingEntry, 'id'>) => void;
  onUpdateEntry?: (id: string, entry: Partial<TrainingEntry>) => void;
}

const progressColors = {
  excellent: 'bg-green-500',
  good: 'bg-blue-500',
  fair: 'bg-yellow-500',
  needs_work: 'bg-red-500'
};

const progressLabels = {
  excellent: 'Excellent',
  good: 'Good',
  fair: 'Fair',
  needs_work: 'Needs Work'
};

export function EnhancedTrainingJournal({
  entries,
  onAddEntry,
  onUpdateEntry
}: EnhancedTrainingJournalProps) {
  const [isAddingEntry, setIsAddingEntry] = useState(false);
  const [editingEntry, setEditingEntry] = useState<TrainingEntry | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterSkill, setFilterSkill] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');

  // Get all unique skills for filtering
  const allSkills = Array.from(new Set(entries.flatMap(entry => entry.skills)));

  const filteredEntries = entries.filter(entry => {
    const matchesSearch = entry.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         entry.content.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesSkill = !filterSkill || entry.skills.includes(filterSkill);
    return matchesSearch && matchesSkill;
  }).sort((a, b) => b.date.getTime() - a.date.getTime());

  const totalHours = entries.reduce((sum, entry) => sum + entry.duration, 0) / 60;
  const averageProgress = entries.length > 0 ? 
    entries.filter(e => e.progress === 'excellent' || e.progress === 'good').length / entries.length * 100 : 0;

  const TrainingEntryForm = ({ entry, onSubmit, onCancel }: {
    entry?: TrainingEntry;
    onSubmit: (data: Omit<TrainingEntry, 'id'>) => void;
    onCancel: () => void;
  }) => {
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
      goals: entry?.goals || []
    });

    const handleSubmit = () => {
      onSubmit(formData as Omit<TrainingEntry, 'id'>);
      onCancel();
    };

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">Session Title</label>
            <Input
              value={""}
              onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
              placeholder="e.g., Basic obedience training"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-2">Duration (minutes)</label>
            <Input
              type="number"
              value={""}
              onChange={(e) => setFormData(prev => ({ ...prev, duration: parseInt(e.target.value) || 0 }))}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Difficulty</label>
            <select
              value={""}
              onChange={(e) => setFormData(prev => ({ ...prev, difficulty: parseInt(e.target.value) as 1|2|3|4|5 }))}
              className="w-full px-3 py-2 border rounded-md"
            >
              {[1, 2, 3, 4, 5].map(level => (
                <option key={level} value={""}>
                  {'★'.repeat(level)} {level === 1 ? 'Very Easy' : level === 5 ? 'Very Hard' : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Progress</label>
            <select
              value={""}
              onChange={(e) => setFormData(prev => ({ ...prev, progress: e.target.value as TrainingEntry['progress'] }))}
              className="w-full px-3 py-2 border rounded-md"
            >
              {Object.entries(progressLabels).map(([key, label]) => (
                <option key={key} value={""}>{label}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Training Notes</label>
          <RichTextEditor
            content={formData.content}
            onChange={(content) => setFormData(prev => ({ ...prev, content }))}
            placeholder="Describe what you worked on, how your dog performed, and any observations..."
          />
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!formData.title.trim()}>
            {entry ? 'Update' : 'Add'} Entry
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header and Stats */}
      <div className="flex flex-col lg:flex-row gap-6">
        <Card className="flex-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5" />
              Training Journal
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-2xl font-bold">{entries.length}</p>
                <p className="text-sm text-muted-foreground">Sessions</p>
              </div>
              <div>
                <p className="text-2xl font-bold">{totalHours.toFixed(1)}h</p>
                <p className="text-sm text-muted-foreground">Total Time</p>
              </div>
              <div>
                <p className="text-2xl font-bold">{averageProgress.toFixed(0)}%</p>
                <p className="text-sm text-muted-foreground">Success Rate</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:w-80">
          <CardHeader>
            <CardTitle className="text-lg">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button 
              onClick={() => setIsAddingEntry(true)}
              className="w-full"
            >
              <Plus className="h-4 w-4 mr-2" />
              New Training Session
            </Button>
            <Button variant="outline" className="w-full">
              <TrendingUp className="h-4 w-4 mr-2" />
              View Progress Report
            </Button>
            <Button variant="outline" className="w-full">
              <Award className="h-4 w-4 mr-2" />
              Set Training Goals
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search training sessions..."
                  value={""}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            
            <select
              value={""}
              onChange={(e) => setFilterSkill(e.target.value)}
              className="px-3 py-2 border rounded-md text-sm"
            >
              <option value="">All Skills</option>
              {allSkills.map(skill => (
                <option key={skill} value={""}>{skill}</option>
              ))}
            </select>
            
            <Button
              variant="outline"
              size="sm"
              onClick={() => setViewMode(viewMode === 'list' ? 'grid' : 'list')}
            >
              <Filter className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Training Entries */}
      <AnimatePresence mode="wait">
        <motion.div
          key={viewMode}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className={viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4' : 'space-y-4'}
        >
          {filteredEntries.map(entry => (
            <motion.div
              key={entry.id}
              layout
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <Card className="cursor-pointer hover:shadow-md transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-lg mb-1">{entry.title}</CardTitle>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Calendar className="h-4 w-4" />
                        {entry.date.toLocaleDateString()}
                        <Clock className="h-4 w-4 ml-2" />
                        {entry.duration}min
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className={`w-3 h-3 rounded-full ${progressColors[entry.progress]}`} />
                      <div className="flex">
                        {Array.from({ length: entry.difficulty }, (_, i) => (
                          <Star key={i} className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                        ))}
                      </div>
                    </div>
                  </div>
                </CardHeader>
                
                <CardContent>
                  <SafeHTML
                    html={entry.content}
                    config="richText"
                    className="prose prose-sm max-w-none mb-3 line-clamp-3"
                    fallback={<p className="text-gray-500 italic">No content available</p>}
                  />
                  
                  {entry.skills.length > 0 && (
                    <div className="flex gap-1 flex-wrap mb-3">
                      {entry.skills.slice(0, 3).map(skill => (
                        <Badge key={skill} variant="outline" className="text-xs">
                          {skill}
                        </Badge>
                      ))}
                      {entry.skills.length > 3 && (
                        <Badge variant="outline" className="text-xs">
                          +{entry.skills.length - 3}
                        </Badge>
                      )}
                    </div>
                  )}

                  {entry.photos.length > 0 && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Image className="h-3 w-3" />
                      {entry.photos.length} photo{entry.photos.length !== 1 ? 's' : ''}
                    </div>
                  )}

                  <div className="flex justify-between items-center mt-4">
                    <Badge variant="outline" className={progressColors[entry.progress]}>
                      {progressLabels[entry.progress]}
                    </Badge>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditingEntry(entry)}
                    >
                      Edit
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      </AnimatePresence>

      {filteredEntries.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <BookOpen className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Training Sessions Found</h3>
            <p className="text-sm text-muted-foreground mb-4">
              {searchTerm ? 'Try adjusting your search' : 'Start documenting your training journey!'}
            </p>
            <Button onClick={() => setIsAddingEntry(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add First Session
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Add Entry Dialog */}
      <Dialog open={isAddingEntry} onOpenChange={setIsAddingEntry}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Training Session</DialogTitle>
          </DialogHeader>
          <TrainingEntryForm
            onSubmit={(data) => {
              onAddEntry?.(data);
              setIsAddingEntry(false);
            }}
            onCancel={() => setIsAddingEntry(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Edit Entry Dialog */}
      <Dialog open={!!editingEntry} onOpenChange={() => setEditingEntry(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Training Session</DialogTitle>
          </DialogHeader>
          {editingEntry && (
            <TrainingEntryForm
              entry={editingEntry}
              onSubmit={(data) => {
                onUpdateEntry?.(editingEntry.id, data);
                setEditingEntry(null);
              }}
              onCancel={() => setEditingEntry(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}