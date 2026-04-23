import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../../ui/dialog';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Badge } from '../../ui/badge';
import { Separator } from '../../ui/separator';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card';
import {
  Save,
  FolderOpen,
  Trash2,
  Clock,
  FileText,
  CheckCircle,
  Archive
} from 'lucide-react';
import { SavedDraft, DraftMetadata } from '../../../hooks/useDraftPersistence';
import { formatDistanceToNow } from 'date-fns';
import { useShowRegistrationStore } from '../../../store/showRegistrationStore';

interface DraftManagerProps {
  saveDraft: (title: string) => string | null;
  loadDraft: (draftId: string) => SavedDraft | null;
  deleteDraft: (draftId: string) => void;
  availableDrafts: DraftMetadata[];
  clearAllDrafts: () => void;
  hasUnsavedChanges: boolean;
  onDraftLoaded?: (draft: SavedDraft) => void;
  onDraftSaved?: (draftId: string) => void;
}

export function DraftManager({
  saveDraft,
  loadDraft,
  deleteDraft,
  availableDrafts,
  clearAllDrafts,
  hasUnsavedChanges,
  onDraftLoaded,
  onDraftSaved
}: DraftManagerProps) {
  const [isLoadDialogOpen, setIsLoadDialogOpen] = useState(false);
  const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);
  const [saveTitle, setSaveTitle] = useState('');
  const [selectedDraft, setSelectedDraft] = useState<DraftMetadata | null>(null);

  const { setDraftData } = useShowRegistrationStore();

  const handleSaveDraft = async () => {
    if (!saveTitle.trim()) {
      return;
    }

    const draftId = saveDraft(saveTitle.trim());
    if (draftId) {
      onDraftSaved?.(draftId);
      setSaveTitle('');
      setIsSaveDialogOpen(false);
    }
  };

  const handleLoadDraft = (draftId: string) => {
    const draft = loadDraft(draftId);
    if (draft) {
      setDraftData(draft.data);
      onDraftLoaded?.(draft);
      setIsLoadDialogOpen(false);
      setSelectedDraft(null);
    }
  };

  const handleDeleteDraft = (draftId: string) => {
    deleteDraft(draftId);
    if (selectedDraft?.id === draftId) {
      setSelectedDraft(null);
    }
  };

  const formatDraftAge = (timestamp: number) => {
    return formatDistanceToNow(new Date(timestamp), { addSuffix: true });
  };

  const getStepBadgeVariant = (step: string) => {
    const stepMapping: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      'dog-selection': 'outline',
      'class-selection': 'secondary',
      'handler-assignment': 'secondary',
      'payment': 'default',
      'confirmation': 'default'
    };
    return stepMapping[step] || 'outline';
  };

  const getStepDisplayName = (step: string) => {
    const stepNames: Record<string, string> = {
      'dog-selection': 'Dog Selection',
      'class-selection': 'Class Selection',
      'handler-assignment': 'Handler Assignment',
      'payment': 'Payment',
      'confirmation': 'Confirmation'
    };
    return stepNames[step] || step;
  };

  return (
    <div className="flex items-center gap-3">
      {/* Save Status Indicator */}
      <DraftIndicator hasUnsavedChanges={!!hasUnsavedChanges} />
      
      {/* Save Draft Button */}
      <Dialog open={isSaveDialogOpen} onOpenChange={setIsSaveDialogOpen}>
        <DialogTrigger asChild>
          <Button variant="ghost" size="sm" disabled={!hasUnsavedChanges} className="text-xs">
            <Save className="h-3 w-3 mr-1" />
            Save Draft
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Save Registration Draft</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="draft-title">Draft Title</Label>
              <Input
                id="draft-title"
                value={saveTitle}
                onChange={(e) => setSaveTitle(e.target.value)}
                placeholder={`Draft from ${new Date().toLocaleDateString()}`}
                className="mt-1"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button 
                variant="outline" 
                onClick={() => setIsSaveDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button 
                onClick={handleSaveDraft}
                disabled={!saveTitle.trim()}
              >
                Save Draft
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Load Draft Button */}
      <Dialog open={isLoadDialogOpen} onOpenChange={setIsLoadDialogOpen}>
        <DialogTrigger asChild>
          <Button 
            variant="ghost" 
            size="sm"
            disabled={availableDrafts.length === 0}
            className="text-xs"
          >
            <FolderOpen className="h-3 w-3 mr-1" />
            Load Draft ({availableDrafts.length})
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle>Load Registration Draft</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            {availableDrafts.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Archive className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No saved drafts found</p>
                <p className="text-sm">Your progress is automatically saved every 30 seconds</p>
              </div>
            ) : (
              <>
                <div className="grid gap-3 max-h-96 overflow-y-auto">
                  {availableDrafts.map((draft) => (
                    <Card 
                      key={draft.id}
                      className={`cursor-pointer transition-colors hover:bg-muted/50 ${
                        selectedDraft?.id === draft.id ? 'ring-2 ring-primary' : ''
                      }`}
                      onClick={() => setSelectedDraft(draft)}
                    >
                      <CardHeader className="pb-2">
                        <div className="flex items-start justify-between">
                          <div className="space-y-1">
                            <CardTitle className="text-sm font-medium">
                              {draft.title}
                            </CardTitle>
                            <CardDescription className="text-xs">
                              {draft.preview}
                            </CardDescription>
                          </div>
                          <Badge variant={getStepBadgeVariant(draft.stepCompleted)} className="text-xs">
                            {getStepDisplayName(draft.stepCompleted)}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            <span>{formatDraftAge(draft.timestamp)}</span>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteDraft(draft.id);
                            }}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                <Separator />

                <div className="flex justify-between items-center">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={clearAllDrafts}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Clear All Drafts
                  </Button>

                  <div className="flex gap-2">
                    <Button 
                      variant="outline" 
                      onClick={() => setIsLoadDialogOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button 
                      onClick={() => selectedDraft && handleLoadDraft(selectedDraft.id)}
                      disabled={!selectedDraft}
                    >
                      <FileText className="h-4 w-4 mr-2" />
                      Load Selected Draft
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface DraftIndicatorProps {
  hasUnsavedChanges: boolean;
}

/**
 * Simple indicator component showing draft status
 */
export function DraftIndicator({ hasUnsavedChanges }: DraftIndicatorProps) {
  if (!hasUnsavedChanges) {
    return (
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <CheckCircle className="h-3 w-3 text-green-500" />
        <span>Saved</span>
      </div>
    );
  }

  return null;
}