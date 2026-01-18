import React, { useState, useEffect, useMemo, startTransition, Suspense } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { logger } from '@/services/LoggingService';
import { useClassStoreCompat } from '@/hooks/useClassStoreCompat';
import { useTrialStore } from '@/store/trialStore';
import { useShowStore } from '@/store/showStore';
import { useEntryStore } from '@/store/entryStore';
import { useDogStore } from '@/store/dogStore';
import { useEntriesByClass } from '@/hooks/useFilteredEntries';
// import { seedEntryStore } from '@/utils/storeMigration'; // Disabled - no mock data
import { ClassGroupedSidebar } from '@/components/classes/ClassGroupedSidebar';
import ClassDetailsMain from '@/components/classes/ClassDetailsMain';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ClassEditPanel } from '@/components/panels/edit/ClassEditPanel';
import { RegistrationWorkflow } from '@/components/shows/RegistrationWorkflow';
import { RegistrationProvider } from '@/context/RegistrationContext';
import { Button } from '@/components/ui/button';
import { Plus, ArrowLeft } from 'lucide-react';
import type { ClassData, CompetitionResult } from '@/components/classes/types/classTypes';
import type { ShowEntry } from '@/types/entry-lifecycle';
import type { CompetitionData } from '@/store/entryStore';
import type { ClassStatusValue } from '@myk9/core';

const ClassDetailsPage: React.FC = () => {
  const { classId, showId, trialId } = useParams<{ 
    classId: string; 
    showId?: string; 
    trialId?: string; 
  }>();
  const navigate = useNavigate();
  const location = useLocation();
  
  // Detect if we're in "results view mode" based on URL path
  const isResultsView = location.pathname.endsWith('/results');
  
  const { classes, updateClass, deleteClass } = useClassStoreCompat();
  const { updateResult } = useEntryStore();
  const { dogs } = useDogStore();
  const { trials } = useTrialStore();
  const { shows } = useShowStore();
  
  // Dialog state
  const [editClassPanelOpen, setEditClassPanelOpen] = useState(false);
  const [editEntryDialogOpen, setEditEntryDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editEntryId, setEditEntryId] = useState<string | null>(null);
  const [addEntryDialogOpen, setAddEntryDialogOpen] = useState(false);
  const [deleteEntryDialogOpen, setDeleteEntryDialogOpen] = useState(false);
  const [entryToDelete, setEntryToDelete] = useState<string | null>(null);
  
  // Search state
  const [searchTerm, setSearchTerm] = useState('');
  

  // Simply get the current class from URL parameter, don't sync with store
  const currentClass = classId ? classes.find(cls => cls.id === classId) : null;
  
  // Filter classes to only show classes from the same trial (like TrialDetailsPage filters by show)
  const trialClasses = currentClass ? classes.filter(cls => cls.trialId === currentClass.trialId) : classes;
  
  // Handle case where no classId in URL but we have classes
  // Fixed: Only run after initial render and with proper guards
  useEffect(() => {
    // Add guards to prevent running during SSR or initial hydration
    if (typeof window === 'undefined') return;
    if (!classId && trialClasses.length > 0 && classes.length > 0) {
      // Use requestAnimationFrame to ensure this runs after the current render cycle
      const frameId = requestAnimationFrame(() => {
        startTransition(() => {
          navigate(`/classes/${trialClasses[0].id}`, { replace: true });
        });
      });
      return () => cancelAnimationFrame(frameId);
    }
    return;
  }, [classId, trialClasses, navigate, classes.length]);

  // Get entries for current class using safe custom hook
  const rawEntries = useEntriesByClass(classId || '');
  
  // Debug: Check if rawEntries is updating after store changes
  React.useEffect(() => {
    logger.debug('rawEntries updated', 'classes', {
      count: rawEntries.length,
      entries: rawEntries.map((entry, index) => {
        const typedEntry = entry as ShowEntry & { updatedAt?: string; createdAt?: string };
        return {
          entryIndex: index + 1,
          id: typedEntry.id,
          qualified: typedEntry.competitionData?.qualified,
          updatedAt: typedEntry.updatedAt
        };
      })
    });
  }, [rawEntries]);
  
  // Get parent trial and show for breadcrumb context
  // First try to get from URL params (when accessed via hierarchical routes)
  // Then fall back to finding via class's trialId (when accessed via /classes/:classId)
  const parentTrial = trialId 
    ? trials.find(trial => trial.id === trialId)
    : currentClass 
      ? trials.find(trial => trial.id === currentClass.trialId) 
      : undefined;
  
  const parentShow = showId 
    ? shows.find(show => show.id === showId)
    : parentTrial 
      ? shows.find(show => show.id === parentTrial.showId) 
      : undefined;
  
  // Debug logging
  logger.debug('ClassDetailsPage debug', 'classes', {
    classId,
    currentClass: currentClass ? { id: currentClass.id, className: currentClass.className, trialId: currentClass.trialId } : null,
    rawEntriesCount: rawEntries.length,
    rawEntries: rawEntries.map(e => ({ id: (e as ShowEntry).id, classId: (e as ShowEntry).classId, dogId: (e as ShowEntry).dogId })),
    allClassesCount: classes.length,
    trialClassesCount: trialClasses.length,
    parentTrial: parentTrial ? { id: parentTrial.id, name: parentTrial.name || parentTrial.type } : null
  });
  
  
  
  // Transform entries to format expected by ClassDetailsMain
  const classEntries = useMemo(() => {
    return rawEntries.map(entry => {
      const typedEntry = entry as ShowEntry;
      const dog = dogs.find(d => d.id === typedEntry.dogId);

      // Debug logging for qualification status
      logger.debug('Transform entry', 'classes', {
        id: typedEntry.id,
        dogName: dog?.callName || dog?.name,
        competitionData: typedEntry.competitionData,
        qualification: (typedEntry.competitionData as unknown as CompetitionData & { qualification?: string })?.qualification,
        qualified: typedEntry.competitionData?.qualified
      });
      
      const qualificationReason = (typedEntry.competitionData as unknown as CompetitionData & { qualificationReason?: string })?.qualificationReason;
      return {
        id: typedEntry.id,
        armband: typedEntry.registrationData?.armband || '',
        handler: typedEntry.registrationData?.handler || '',
        dog: dog?.callName || dog?.name || 'Unknown Dog',
        status: ((typedEntry.competitionData as unknown as CompetitionData & { qualification?: string })?.qualification ||
                (typedEntry.competitionData?.qualified ? 'Qualified' : 'Not Qualified')) as 'Qualified' | 'Not Qualified' | 'Absent' | 'Excused' | 'Withdrawn' | 'Eliminated',
        ...(qualificationReason !== undefined && { qualificationReason }),
        score: typedEntry.competitionData?.score || '',
        time: typedEntry.competitionData?.time || '',
        placement: typedEntry.competitionData?.placement || '',
        classId: typedEntry.classId
      };
    });
  }, [rawEntries, dogs]);

  // Handle case where class doesn't exist
  if (classId && !currentClass && trialClasses.length > 0) {
    return (
      <div className="apple-class-page flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-foreground mb-4">Class Not Found</h1>
          <p className="text-muted-foreground mb-4">The class you're looking for doesn't exist.</p>
          <button 
            onClick={() => {
              startTransition(() => {
                navigate('/classes');
              });
            }}
            className="apple-action-button apple-action-button-primary"
          >
            Back to Classes
          </button>
        </div>
      </div>
    );
  }

  // Handlers
  const handleSelectClass = (id: string) => {
    startTransition(() => {
      navigate(`/classes/${id}`);
    });
  };

  const handleEditClass = () => {
    setEditClassPanelOpen(true);
  };

  const handleDeleteClass = () => {
    setDeleteDialogOpen(true);
  };

  const handleConfirmDeleteClass = () => {
    if (classId) {
      deleteClass(classId);
      startTransition(() => {
        // Navigate based on context - return to parent trial if available
        if (trialId) {
          navigate(`/trials/${trialId}`);
        } else if (currentClass?.trialId) {
          navigate(`/trials/${currentClass.trialId}`);
        } else {
          navigate('/classes');
        }
      });
    }
    setDeleteDialogOpen(false);
  };



  const handleViewTrial = () => {
    if (currentClass?.trialId) {
      startTransition(() => {
        navigate(`/trials/${currentClass.trialId}`);
      });
    }
  };


  const handleAddEntry = () => {
    setAddEntryDialogOpen(true);
  };

  const handleDeleteEntry = (entryId: string) => {
    setEntryToDelete(entryId);
    setDeleteEntryDialogOpen(true);
  };

  const handleConfirmDeleteEntry = () => {
    if (entryToDelete) {
      // Delete from store
      const { deleteEntry } = useEntryStore.getState();
      deleteEntry(entryToDelete);
      setDeleteEntryDialogOpen(false);
      setEntryToDelete(null);
    }
  };

  const handleSaveClassEdit = (data: Partial<typeof currentClass>) => {
    if (classId && currentClass) {
      updateClass(classId, data as Partial<ClassData>);
    }
    setEditClassPanelOpen(false);
  };

  const handleSaveEntryEdit = (data: Record<string, unknown>) => {
    if (editEntryId) {
      // TODO: Update entry in store
      logger.debug('Save entry', 'classes', { editEntryId, data });
    }
    setEditEntryDialogOpen(false);
    setEditEntryId(null);
  };


  const handleStatusChange = (newStatus: string) => {
    if (classId) {
      updateClass(classId, {
        status: newStatus as ClassStatusValue
      });
    }
  };

  const handleResultUpdate = async (entryId: string, result: Partial<CompetitionResult>) => {
    try {
      logger.debug('handleResultUpdate called', 'classes', { entryId, result });

      // Map the status string to the boolean qualified field (for legacy compatibility)
      const qualified = result.status === 'Qualified' ? true :
                       result.status === 'Not Qualified' ? false :
                       undefined;

      const storeUpdate = {
        time: result.time,
        qualified, // Keep for legacy compatibility
        qualification: result.status, // Store the actual qualification status
        qualificationReason: result.qualificationReason,
        score: result.score,
        placement: result.placement,
        recordedBy: 'secretary', // TODO: Get from auth context
        // Note: recordedAt is handled automatically by the store
      };

      logger.debug('Calling updateResult', 'classes', { entryId, storeUpdate });

      // Update the result in the entry store
      updateResult(entryId, storeUpdate);

      logger.debug('updateResult called successfully', 'classes', { entryId });

      // Let's also check what the store has after the update
      const updatedEntry = rawEntries.find(e => (e as ShowEntry).id === entryId);
      if (updatedEntry) {
        const typedUpdatedEntry = updatedEntry as ShowEntry;
        logger.debug('Entry after update in store', 'classes', {
          entryId,
          qualified: typedUpdatedEntry.competitionData?.qualified,
          qualification: (typedUpdatedEntry.competitionData as unknown as CompetitionData & { qualification?: string })?.qualification,
          competitionData: typedUpdatedEntry.competitionData
        });
      }

    } catch (error) {
      logger.error('Failed to update result', 'classes', { entryId }, error as Error);
      throw error;
    }
  };


  // Early return if we don't have essential data to prevent suspension issues
  if (!classId || !currentClass) {
    // Check if we have no classes at all (empty state)
    if (classes.length === 0) {
      return (
        <div className="flex min-h-screen bg-background">
          <div className="w-80 border-r border-border bg-card">
            <div className="p-4">
              <div className="text-sm text-muted-foreground">No classes found</div>
            </div>
          </div>
          <main className="flex-1 overflow-auto">
            <div className="flex items-center justify-center min-h-screen">
              <div className="text-center">
                <h1 className="text-2xl font-bold text-foreground mb-4">No Classes Available</h1>
                <p className="text-muted-foreground mb-6">
                  Classes are created within trials. Start by creating a show and adding trials with classes.
                </p>
                <div className="flex gap-3 justify-center">
                  <Button 
                    onClick={() => navigate('/shows')}
                    variant="outline"
                    className="flex items-center gap-2"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Go to Shows
                  </Button>
                  <Button 
                    onClick={() => navigate('/shows')}
                    className="flex items-center gap-2"
                  >
                    <Plus className="h-4 w-4" />
                    Create Show
                  </Button>
                </div>
              </div>
            </div>
          </main>
        </div>
      );
    }
    
    // Loading state - we have classes but currentClass is not found yet
    return (
      <div className="flex min-h-screen bg-background">
        <div className="w-80 border-r border-border bg-card">
          <div className="p-4">
            <div className="text-sm text-muted-foreground">Loading classes...</div>
          </div>
        </div>
        <main className="flex-1 overflow-auto">
          <div className="flex items-center justify-center min-h-screen">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
              <h1 className="text-xl font-medium text-foreground">Loading class details...</h1>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // Layout assembly - exactly like ShowDetailsPage
  return (
    <div className="flex min-h-screen bg-background">
      <ClassGroupedSidebar
        classes={trialClasses}
        selectedId={classId || null}
        onSelect={handleSelectClass}
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
      />
      
      <main className="flex-1 overflow-auto">
        <>
            <ClassDetailsMain
              classData={currentClass}
              classEntries={classEntries}
              {...(parentShow !== undefined && { parentShow })}
              {...(parentTrial !== undefined && { parentTrial })}
              isResultsView={isResultsView}
              onEditClass={handleEditClass}
              onDeleteClass={handleDeleteClass}
              onEditPhoto={() => logger.debug('Edit photo not implemented', 'classes')}
              onViewTrial={handleViewTrial}
              onAddEntry={handleAddEntry}
              onDeleteEntry={handleDeleteEntry}
              onStatusChange={handleStatusChange}
              onResultUpdate={handleResultUpdate}
            />
        </>
      </main>

      {/* Dialogs */}
      <ClassEditPanel
        open={editClassPanelOpen}
        onClose={() => setEditClassPanelOpen(false)}
        classId={currentClass?.id || ''}
        className={currentClass?.element || ''}
        initialClassData={currentClass || {}}
        mode="full"
        onSave={async (classData) => {
          if (currentClass?.id && classData.id) {
            const updatedClass = { ...currentClass, ...classData };
            // The save handler will update the class
            handleSaveClassEdit(updatedClass);
            setEditClassPanelOpen(false);
          }
        }}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Class</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this class?
              <span className="block mt-2 font-medium text-foreground">
                {currentClass?.element} {currentClass?.level} {currentClass?.section}
              </span>
              <span className="block text-sm text-muted-foreground">
                from {currentClass?.trial}
              </span>
              <span className="block mt-2 text-destructive">
                This action cannot be undone. All entries will also be deleted.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDeleteClass}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Entry Dialog - Combined handler and results editing */}
      <Dialog open={editEntryDialogOpen} onOpenChange={setEditEntryDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Entry & Results</DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto space-y-4">
            {editEntryId && (() => {
              const entry = rawEntries.find(e => (e as ShowEntry).id === editEntryId) as ShowEntry | undefined;
              const dog = dogs.find(d => d.id === entry?.dogId);
              if (!entry) return <div>Entry not found</div>;

              return (
                <div className="space-y-4">
                  {/* Entry Info Header */}
                  <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg">
                    <div>
                      <h3 className="font-semibold">{dog?.callName || dog?.name || 'Unknown Dog'}</h3>
                      <p className="text-sm text-muted-foreground">Entry ID: {entry.id}</p>
                    </div>
                  </div>

                  {/* Handler Information */}
                  <div className="space-y-3">
                    <h4 className="font-medium">Handler Information</h4>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium mb-1">Handler Name</label>
                        <input
                          type="text"
                          defaultValue={entry.registrationData?.handler || ''}
                          className="w-full px-3 py-2 border rounded-md text-sm"
                          placeholder="Handler name"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Armband</label>
                        <input
                          type="text"
                          defaultValue={entry.registrationData?.armband || ''}
                          className="w-full px-3 py-2 border rounded-md text-sm"
                          placeholder="A101"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Special Requests</label>
                      <textarea
                        defaultValue={entry.registrationData?.specialRequests || ''}
                        className="w-full px-3 py-2 border rounded-md text-sm"
                        rows={2}
                        placeholder="Any special requests or notes"
                      />
                    </div>
                  </div>

                  {/* Results Section */}
                  <div className="space-y-3">
                    <h4 className="font-medium">Competition Results</h4>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium mb-1">Score</label>
                        <input
                          type="text"
                          defaultValue={entry.competitionData?.score || ''}
                          className="w-full px-3 py-2 border rounded-md text-sm"
                          placeholder="85"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Time</label>
                        <input
                          type="text"
                          defaultValue={entry.competitionData?.time || ''}
                          className="w-full px-3 py-2 border rounded-md text-sm"
                          placeholder="2:45"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Placement</label>
                        <input
                          type="text"
                          defaultValue={entry.competitionData?.placement || ''}
                          className="w-full px-3 py-2 border rounded-md text-sm"
                          placeholder="1"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Status</label>
                        <select
                          defaultValue={entry.competitionData?.qualified ? 'Qualified' : 'Not Qualified'}
                          className="w-full px-3 py-2 border rounded-md text-sm"
                        >
                          <option value="Qualified">Qualified</option>
                          <option value="Not Qualified">Not Qualified</option>
                          <option value="Withdrawn">Withdrawn</option>
                          <option value="Absent">Absent</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Judge Notes</label>
                      <textarea
                        defaultValue={entry.competitionData?.judgeNotes || ''}
                        className="w-full px-3 py-2 border rounded-md text-sm"
                        rows={2}
                        placeholder="Judge comments or notes"
                      />
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditEntryDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => handleSaveEntryEdit({})}>
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* TODO: Fix PhotoDialog props
      <PhotoDialog
        open={photoDialogOpen}
        onOpenChange={setPhotoDialogOpen}
        currentPhotoUrl={selectedClass?.photoUrl}
      />
      */}

      {/* Add Entry Dialog */}
      {parentShow && (
        <Dialog open={addEntryDialogOpen} onOpenChange={setAddEntryDialogOpen}>
          <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700">
            <DialogHeader>
              <DialogTitle className="text-gray-900 dark:text-gray-100">
                Add Entry - {currentClass?.element} {currentClass?.level} {currentClass?.section}
              </DialogTitle>
            </DialogHeader>
            <RegistrationProvider>
              <Suspense fallback={
                <div className="flex items-center justify-center p-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  <span className="ml-3 text-gray-600 dark:text-gray-400">Loading registration...</span>
                </div>
              }>
                <RegistrationWorkflow
                  showId={parentShow.id}
                  onComplete={(data) => {
                    logger.info('Registration completed', 'classes', { showId: parentShow.id, data });
                    setAddEntryDialogOpen(false);
                    // TODO: Refresh entries after successful registration
                  }}
                  onCancel={() => setAddEntryDialogOpen(false)}
                />
              </Suspense>
            </RegistrationProvider>
          </DialogContent>
        </Dialog>
      )}

      {/* Delete Entry Confirmation Dialog */}
      <AlertDialog open={deleteEntryDialogOpen} onOpenChange={setDeleteEntryDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Entry</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this entry?
              {(() => {
                const entry = rawEntries.find(e => (e as ShowEntry).id === entryToDelete) as ShowEntry | undefined;
                const dog = entry ? dogs.find(d => d.id === entry.dogId) : undefined;
                const hasResults = entry?.competitionData?.time || entry?.competitionData?.score || entry?.competitionData?.placement;

                return (
                  <>
                    <span className="block mt-2 font-medium text-foreground">
                      {dog?.callName || dog?.name || 'Unknown Dog'}
                    </span>
                    <span className="block text-sm">
                      Handler: {entry?.registrationData?.handler || 'Unknown'}
                    </span>
                    <span className="block text-sm">
                      Armband: #{entry?.registrationData?.armband || 'N/A'}
                    </span>
                    {hasResults && (
                      <span className="block mt-2 text-destructive font-semibold">
                        Warning: This entry has recorded results that will be permanently lost!
                      </span>
                    )}
                    <span className="block mt-2 text-destructive">
                      This action cannot be undone.
                    </span>
                  </>
                );
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDeleteEntry}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ClassDetailsPage;
