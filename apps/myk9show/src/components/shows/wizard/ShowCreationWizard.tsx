import React, { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { AlertTriangle } from 'lucide-react';
import { logger } from '@/services/LoggingService';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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
import { usePanelManager } from '@/components/panels/hooks';
import type { EntityCreationResult } from '@/components/panels/types';
import { useWizardStore } from '@/store/wizardStore';
import { useShowStore, type ShowInput } from '@/store/showStore';
import { useClubStore } from '@/store/clubStore';
import { useTrialStore, type TrialInput } from '@/store/trialStore';
import { useClassStoreCompat } from '@/hooks/useClassStoreCompat';
import { useUserStore } from '@/store/userStore';
import type { Show } from '@/types/show-types';
// import type { Trial } from '@/components/trials/types/trial.types';
import type { ClassData } from '@/components/classes/types/classTypes';
import ProgressIndicator from './components/ProgressIndicator';
import WizardNavigation from './components/WizardNavigation';
import ShowDetailsStep from './steps/ShowDetailsStep';
import TrialConfigurationStep from './steps/TrialConfigurationStep';
import ClassSelectionStep from './steps/ClassSelectionStep';
import ReviewStep from './steps/ReviewStep';

interface ShowCreationWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editMode?: {
    showId: string;
    mode: 'add-trials' | 'add-classes' | 'edit-show';
  };
}

const WIZARD_STEPS = [
  { id: 0, label: 'Show Details', description: 'Basic information' },
  { id: 1, label: 'Trials', description: 'Configure trials' },
  { id: 2, label: 'Classes', description: 'Select from templates' },
  { id: 3, label: 'Review', description: 'Final confirmation' },
];

export const ShowCreationWizard: React.FC<ShowCreationWizardProps> = ({
  open,
  onOpenChange,
  editMode,
}) => {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showValidationErrors, setShowValidationErrors] = useState(false);
  const [isClosingPanel, setIsClosingPanel] = useState(false);
  
  const {
    currentStep,
    completedSteps,
    isDirty,
    setCurrentStep,
    markStepCompleted,
    goToStep,
    saveProgress,
    resetWizard,
    loadDraft,
    show,
    trials,
    judgeDetails,
  } = useWizardStore();
  
  const { addShow, updateShow, shows } = useShowStore();
  const { clubs } = useClubStore();
  const { addTrial: addTrialToStore, trials: existingTrials } = useTrialStore();
  const { addClass, classes: existingClasses } = useClassStoreCompat();
  const { people } = useUserStore();
  const panelManager = usePanelManager();
  
  // Initialize wizard with existing show data in edit mode
  useEffect(() => {
    if (editMode && open) {
      const existingShow = shows.find(s => s.id === editMode.showId);
      const showTrials = existingTrials.filter(t => t.showId === editMode.showId);
      
      
      if (existingShow) {
        // Transform existing trials to wizard format
        const wizardTrials = showTrials.map(trial => {
          // Get classes for this trial from classStore
          const trialClasses = existingClasses.filter(c => c.trialId === trial.id);
          
          // Convert ClassData to wizard class format
          const wizardClasses = trialClasses.map(classData => {
            // Find the judge ID by matching the judge name
            let judgeId = '';
            if (classData.judge && classData.judge !== 'TBD') {
              // Check if any assigned judge matches this name
              const matchingJudge = existingShow.assignedJudges?.find(j => 
                j.judgeName === classData.judge
              );
              if (matchingJudge) {
                judgeId = matchingJudge.judgeId;
              }
            }
            
            return {
              templateId: classData.templateId || '',
              customizations: {
                className: classData.className,
                element: classData.element,
                level: classData.level,
                section: classData.section,
                fieldOverrides: {}
              },
              judgeId: judgeId
            };
          });
          
          return {
            id: trial.id,
            name: trial.type || trial.name || 'Trial',
            dateTime: trial.trialDate,
            eventNumber: trial.eventNumber || '',
            classes: wizardClasses
          };
        });

        // Build judge details from assigned judges and people store
        const judgeDetailsMap: Record<string, {
          name: string;
          email: string;
          phone: string;
          certifications: string[];
          notes: string;
        }> = {};
        existingShow.assignedJudges?.forEach(judge => {
          // Try to find more complete info from people store
          const personInfo = people.find(p => p.id === judge.judgeId);
          
          judgeDetailsMap[judge.judgeId] = {
            name: personInfo ? `${personInfo.firstName} ${personInfo.lastName}` : judge.judgeName,
            email: personInfo?.email || '',
            phone: personInfo?.phone || '',
            certifications: personInfo?.judgeQualifications?.map(q => q.organization) || [],
            notes: ''
          };
        });

        // Load existing show data into wizard
        loadDraft({
          show: {
            name: existingShow.name,
            type: existingShow.type as 'AKC' | 'UKC' | 'Other',
            startDate: existingShow.startDate,
            endDate: existingShow.endDate,
            location: existingShow.location,
            clubId: existingShow.clubId,
            entryOpenDate: existingShow.entryOpenDate,
            entryCloseDate: existingShow.entryCloseDate,
            preEntryFee: parseFloat(existingShow.preEntryFee) || 0,
            dayOfShowFee: parseFloat(existingShow.dayOfShowFee || '0') || 0,
            chairman: existingShow.chairman,
            secretary: existingShow.secretary,
            judgeIds: existingShow.assignedJudges?.map(j => j.judgeId) || [],
          },
          trials: wizardTrials,
          judgeDetails: judgeDetailsMap,
          // Set initial step based on edit mode
          currentStep: editMode.mode === 'add-trials' ? 1 : 
                      editMode.mode === 'add-classes' ? 2 : 0,
          completedSteps: editMode.mode === 'add-trials' ? [0] :
                         editMode.mode === 'add-classes' ? [0, 1] : []
        });

      }
    }
  }, [editMode, open, shows, existingTrials, loadDraft, people, existingClasses]);
  
  // Helper function to build trial ID mapping
  const buildTrialIdMapping = useCallback((wizardTrials: typeof trials, showId: string): Record<string, string> => {
    const trialIdMap: Record<string, string> = {};
    // Generate safe numeric IDs, filtering out NaN values
    const numericIds = existingTrials
      .map(t => parseInt(t.id))
      .filter(id => !isNaN(id));
    const baseId = numericIds.length > 0 ? Math.max(...numericIds) + 1 : 1;
    
    if (editMode) {
      // In edit mode, existing trials keep their IDs, only new trials get mapped
      const existingTrialIds = existingTrials
        .filter(t => t.showId === showId)
        .map(t => t.id);
      
      let newTrialIndex = 0;
      wizardTrials.forEach((wizardTrial) => {
        if (existingTrialIds.includes(wizardTrial.id)) {
          // Existing trial - use its existing ID
          trialIdMap[wizardTrial.id] = wizardTrial.id;
        } else {
          // New trial - generate a new ID
          const generatedId = String(baseId + newTrialIndex);
          trialIdMap[wizardTrial.id] = generatedId;
          newTrialIndex++;
        }
      });
    } else {
      // New show - all trials get new IDs
      wizardTrials.forEach((wizardTrial, index) => {
        const generatedId = String(baseId + index);
        trialIdMap[wizardTrial.id] = generatedId;
      });
    }
    
    return trialIdMap;
  }, [editMode, existingTrials]);

  // Helper function to create classes in class store with trial mapping
  const createClassesWithTrialMapping = useCallback((showId: string, trialIdMap: Record<string, string>) => {
    logger.debug('createClassesWithTrialMapping called', 'wizard', { showId, trialIdMap });
    
    // In edit mode, only create classes for NEW trials
    const trialsToProcess = editMode ? (() => {
      const existingTrialIds = existingTrials
        .filter(t => t.showId === showId)
        .map(t => t.id);
      return trials.filter(wizardTrial => !existingTrialIds.includes(wizardTrial.id));
    })() : trials;
    
    trialsToProcess.forEach(wizardTrial => {
      const trialId = trialIdMap[wizardTrial.id];
      logger.debug('Processing wizard trial', 'wizard', { trialName: wizardTrial.name, trialId });
      
      if (trialId && wizardTrial.classes.length > 0) {
        // Create classes for this trial
        wizardTrial.classes.forEach((cls, index) => {
          const className = cls.customizations?.className as string || `Class ${index + 1}`;
          const element = cls.customizations?.element as string || 'Unknown';
          const level = cls.customizations?.level as string || 'Unknown';
          
          // Generate a unique class ID
          const classId = `${trialId}-class-${Date.now()}-${index}`;
          
          const classData: ClassData = {
            id: classId,
            trialId: trialId,
            trial: wizardTrial.name,
            trialDate: wizardTrial.dateTime,
            trialNumber: wizardTrial.eventNumber || wizardTrial.name,
            classOrder: String(index + 1),
            status: 'Scheduled' as const,
            judge: judgeDetails[cls.judgeId || '']?.name || 'TBD',
            element: element,
            level: level,
            section: cls.customizations?.section as string || 'A',
            hidesUsed: '0',
            distractionsUsed: '0',
            itemsUsed: '',
            timeLimit1: '3:00',
            timeLimit2: '',
            timeLimit3: '',
            photoUrl: '',
            className: className,
            entryFee: 30,
            preEntryFee: 30,
            dayOfShowFee: 35,
            maxEntries: 40,
            templateId: cls.templateId
          };
          
          logger.debug('Adding class', 'wizard', { classData });
          addClass(classData);
        });
      } else if (!trialId) {
        logger.warn('No trial ID mapping found for wizard trial', 'wizard', { trialName: wizardTrial.name });
      } else {
        logger.debug('Wizard trial has no classes', 'wizard', { trialName: wizardTrial.name });
      }
    });
  }, [trials, addClass, judgeDetails, editMode, existingTrials]);
  
  // Listen for panel close events to prevent wizard close confirmation
  useEffect(() => {
    const handlePanelResult = (_panelId: string, result: EntityCreationResult) => {
      // Only set flag for cancel actions (not for successful saves)
      if (result.action === 'cancel') {
        setIsClosingPanel(true);
        
        // Reset flag after a short delay to allow any dialog close events to propagate
        setTimeout(() => {
          setIsClosingPanel(false);
        }, 50); // Reduced timeout for more precise control
      }
    };

    panelManager.onPanelResult(handlePanelResult);
    
    // Cleanup function will automatically remove the listener due to how the panel manager works
    return () => {
      setIsClosingPanel(false);
    };
  }, [panelManager]);
  
  // Helper function to convert Show to ShowInput
  const showToShowInput = useCallback((show: Show): ShowInput => ({
    name: show.name,
    type: show.type,
    startDate: show.startDate,
    endDate: show.endDate,
    location: show.location,
    status: show.status,
    events: show.events,
    source: show.source,
    entryOpenDate: show.entryOpenDate,
    entryCloseDate: show.entryCloseDate,
    preEntryFee: show.preEntryFee,
    dayOfShowFee: show.dayOfShowFee,
    clubId: show.clubId,
    clubName: show.clubName,
    clubAddress: show.clubAddress,
    clubEmail: show.clubEmail,
    chairman: show.chairman,
    secretary: show.secretary,
    chiefSteward: show.chiefSteward,
    assignedJudges: show.assignedJudges,
    trials: show.trials
  }), []);
  
  // Helper function to transform wizard data to Show format
  const transformWizardDataToShow = useCallback((status: 'draft' | 'unpublished' | 'published'): Show => {
    // Use existing ID in edit mode, or generate new ID for new shows
    const showId = editMode ? editMode.showId : (() => {
      const timestamp = Date.now();
      const randomSuffix = Math.floor(Math.random() * 1000);
      return `wizard-${timestamp}-${randomSuffix}`;
    })();
    
    
    // Look up club information
    const selectedClub = clubs.find(club => club.id === show.clubId);
    
    // Transform judge assignments
    const assignedJudges = show.judgeIds.map(judgeId => {
      const judge = judgeDetails[judgeId];
      return {
        judgeId,
        judgeName: judge?.name || 'Unknown Judge',
        assignedDate: new Date().toISOString().split('T')[0],
        email: judge?.email,
        phone: judge?.phone,
      };
    });
    
    // Transform trials
    const showTrials = trials.map(trial => ({
      id: trial.id,
      name: trial.name,
      date: trial.dateTime, // Now uses the combined dateTime field
      trialNumber: `${trials.indexOf(trial) + 1}`,
      status: 'Upcoming',
    }));
    
    return {
      id: showId,
      name: show.name,
      type: show.type,
      startDate: show.startDate,
      endDate: show.endDate,
      location: show.location,
      status: status,
      events: [], // Will be populated based on trials/classes
      source: 'myK9Show' as const,
      entryOpenDate: show.entryOpenDate,
      entryCloseDate: show.entryCloseDate,
      preEntryFee: show.preEntryFee.toString(),
      dayOfShowFee: show.dayOfShowFee.toString(),
      clubId: show.clubId,
      clubName: selectedClub?.name || 'Unknown Club',
      clubAddress: selectedClub ? [
        selectedClub.address.street,
        selectedClub.address.city,
        selectedClub.address.state,
        selectedClub.address.zipCode,
        selectedClub.address.country
      ].filter(Boolean).join(', ') : '',
      clubEmail: selectedClub?.email || '',
      chairman: show.chairman,
      secretary: show.secretary,
      chiefSteward: '',
      assignedJudges,
      stats: [], // Will be calculated based on entries
      trials: showTrials,
    };
  }, [show, trials, judgeDetails, clubs, editMode]);

  // Handle wizard close
  const handleClose = useCallback((event?: Event | React.SyntheticEvent) => {
    // If we're in the middle of closing a panel, ignore this close event
    if (isClosingPanel) {
      // Stop event propagation to prevent cascading closes
      event?.stopPropagation?.();
      return;
    }
    
    // More robust panel detection: check if the event comes from any panel
    if (event && 'target' in event) {
      const target = event.target as Element;
      
      // Check if the event came from within a panel by looking for panel-specific elements
      const isFromPanel = target?.closest('[data-panel-stack]') !== null ||
                         target?.closest('.slide-over-panel') !== null ||
                         (target?.closest('[role="dialog"]') && 
                          !target?.closest('.wizard-dialog')) ||
                         target?.closest('[aria-labelledby="panel-title"]') !== null;
      
      if (isFromPanel) {
        logger.debug('Ignoring close event from panel element', 'wizard');
        event.stopPropagation?.();
        event.preventDefault?.();
        return;
      }
    }
    
    if (isDirty) {
      setShowConfirmDialog(true);
      return;
    }
    onOpenChange(false);
  }, [isDirty, onOpenChange, isClosingPanel]);

  // Handle confirmation dialog result
  const handleConfirmClose = useCallback(() => {
    resetWizard();
    onOpenChange(false);
    setShowConfirmDialog(false);
  }, [resetWizard, onOpenChange]);

  // Show creation handlers
  const handleSaveDraftClick = useCallback(async () => {
    try {
      setIsLoading(true);
      logger.debug('Saving draft', 'wizard');
      
      // Transform wizard data to Show format with draft status
      const newShow = transformWizardDataToShow('draft');
      
      // Save to show store (add or update based on mode)
      if (editMode && editMode.showId) {
        updateShow(editMode.showId, showToShowInput(newShow));
      } else {
        addShow(showToShowInput(newShow));
      }
      
      // Create trials in trial store - only create NEW trials in edit mode
      if (editMode) {
        // In edit mode, only add trials that don't already exist
        const existingTrialIds = existingTrials
          .filter(t => t.showId === newShow.id)
          .map(t => t.id);
        
        const newTrialsToAdd = trials.filter(wizardTrial => 
          !existingTrialIds.includes(wizardTrial.id)
        );
        
        
        newTrialsToAdd.forEach(wizardTrial => {
          const trialName = wizardTrial.name || `Trial ${trials.indexOf(wizardTrial) + 1}`;
          const newTrial: TrialInput = {
            showId: newShow.id,
            showName: newShow.name,
            name: trialName,
            trialDate: wizardTrial.dateTime,
            trialNumber: trialName,
            status: 'Upcoming',
            eventNumber: wizardTrial.eventNumber || '',
            type: trialName,
            trialType: newShow.type,
            plannedStartTime: wizardTrial.dateTime ? format(new Date(wizardTrial.dateTime), 'h:mm a') : '09:00 AM',
            order: String(trials.indexOf(wizardTrial) + 1),
          };
          addTrialToStore(newTrial);
        });
      } else {
        // New show - create all trials
        trials.forEach(wizardTrial => {
          const trialName = wizardTrial.name || `Trial ${trials.indexOf(wizardTrial) + 1}`;
          const newTrial: TrialInput = {
            showId: newShow.id,
            showName: newShow.name,
            name: trialName,
            trialDate: wizardTrial.dateTime,
            trialNumber: trialName,
            status: 'Upcoming',
            eventNumber: wizardTrial.eventNumber || '',
            type: trialName,
            trialType: newShow.type,
            plannedStartTime: wizardTrial.dateTime ? format(new Date(wizardTrial.dateTime), 'h:mm a') : '09:00 AM',
            order: String(trials.indexOf(wizardTrial) + 1),
          };
          addTrialToStore(newTrial);
        });
      }
      
      // Create classes for trials (after trials are created)
      // Build trial ID mapping
      const trialIdMap = buildTrialIdMapping(trials, newShow.id);
      
      setTimeout(() => {
        createClassesWithTrialMapping(newShow.id, trialIdMap);
      }, 1000); // Wait 1 second to ensure trials are saved first
      
      // Save progress to wizard store as well
      saveProgress();
      
      // Close wizard without resetting (keep draft data for future editing)
      onOpenChange(false);
      
      // Small delay to ensure show is persisted before navigation
      setTimeout(() => {
        navigate(`/shows/${newShow.id}`);
      }, 500);

      logger.info('Draft saved successfully', 'wizard', { showId: newShow.id, showName: newShow.name });
    } catch (error) {
      logger.error('Error saving draft', 'wizard', {}, error as Error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [transformWizardDataToShow, addShow, addTrialToStore, trials, saveProgress, onOpenChange, navigate, setIsLoading, editMode, existingTrials, createClassesWithTrialMapping, buildTrialIdMapping, updateShow, showToShowInput]);

  const handleCreateShowClick = useCallback(async () => {
    try {
      setIsLoading(true);
      logger.debug('Creating show (unpublished)', 'wizard');
      
      // Transform wizard data to Show format
      const newShow = transformWizardDataToShow('unpublished');
      
      // Save to show store (add or update based on mode)
      if (editMode && editMode.showId) {
        updateShow(editMode.showId, showToShowInput(newShow));
      } else {
        addShow(showToShowInput(newShow));
      }
      
      // Create trials in trial store - only create NEW trials in edit mode
      if (editMode) {
        // In edit mode, only add trials that don't already exist
        const existingTrialIds = existingTrials
          .filter(t => t.showId === newShow.id)
          .map(t => t.id);
        
        const newTrialsToAdd = trials.filter(wizardTrial => 
          !existingTrialIds.includes(wizardTrial.id)
        );
        
        
        newTrialsToAdd.forEach(wizardTrial => {
          const trialName = wizardTrial.name || `Trial ${trials.indexOf(wizardTrial) + 1}`;
          const newTrial: TrialInput = {
            showId: newShow.id,
            showName: newShow.name,
            name: trialName,
            trialDate: wizardTrial.dateTime,
            trialNumber: trialName,
            status: 'Upcoming',
            eventNumber: wizardTrial.eventNumber || '',
            type: trialName,
            trialType: newShow.type,
            plannedStartTime: wizardTrial.dateTime ? format(new Date(wizardTrial.dateTime), 'h:mm a') : '09:00 AM',
            order: String(trials.indexOf(wizardTrial) + 1),
          };
          addTrialToStore(newTrial);
        });
      } else {
        // New show - create all trials
        trials.forEach(wizardTrial => {
          const trialName = wizardTrial.name || `Trial ${trials.indexOf(wizardTrial) + 1}`;
          const newTrial: TrialInput = {
            showId: newShow.id,
            showName: newShow.name,
            name: trialName,
            trialDate: wizardTrial.dateTime,
            trialNumber: trialName,
            status: 'Upcoming',
            eventNumber: wizardTrial.eventNumber || '',
            type: trialName,
            trialType: newShow.type,
            plannedStartTime: wizardTrial.dateTime ? format(new Date(wizardTrial.dateTime), 'h:mm a') : '09:00 AM',
            order: String(trials.indexOf(wizardTrial) + 1),
          };
          addTrialToStore(newTrial);
        });
      }
      
      // Create classes for trials (after trials are created)
      // Build trial ID mapping
      const trialIdMap = buildTrialIdMapping(trials, newShow.id);
      
      setTimeout(() => {
        createClassesWithTrialMapping(newShow.id, trialIdMap);
      }, 1000); // Wait 1 second to ensure trials are saved first
      
      // Reset wizard and close
      resetWizard();
      onOpenChange(false);
      
      // Small delay to ensure show is persisted before navigation
      setTimeout(() => {
        navigate(`/shows/${newShow.id}`);
        logger.info('Show created successfully (unpublished)', 'wizard', { showId: newShow.id, showName: newShow.name });
      }, 100);
    } catch (error) {
      logger.error('Error creating show', 'wizard', {}, error as Error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [transformWizardDataToShow, addShow, addTrialToStore, trials, resetWizard, onOpenChange, navigate, setIsLoading, editMode, existingTrials, createClassesWithTrialMapping, buildTrialIdMapping, updateShow, showToShowInput]);

  const handleCreateAndPublishClick = useCallback(async () => {
    try {
      setIsLoading(true);
      logger.debug('Creating and publishing show', 'wizard');
      
      // Transform wizard data to Show format with published status
      const newShow = transformWizardDataToShow('published');
      
      // Save to show store (add or update based on mode)
      if (editMode && editMode.showId) {
        updateShow(editMode.showId, showToShowInput(newShow));
      } else {
        addShow(showToShowInput(newShow));
      }
      
      // Create trials in trial store - only create NEW trials in edit mode
      if (editMode) {
        // In edit mode, only add trials that don't already exist
        const existingTrialIds = existingTrials
          .filter(t => t.showId === newShow.id)
          .map(t => t.id);
        
        const newTrialsToAdd = trials.filter(wizardTrial => 
          !existingTrialIds.includes(wizardTrial.id)
        );
        
        
        newTrialsToAdd.forEach(wizardTrial => {
          const trialName = wizardTrial.name || `Trial ${trials.indexOf(wizardTrial) + 1}`;
          const newTrial: TrialInput = {
            showId: newShow.id,
            showName: newShow.name,
            name: trialName,
            trialDate: wizardTrial.dateTime,
            trialNumber: trialName,
            status: 'Upcoming',
            eventNumber: wizardTrial.eventNumber || '',
            type: trialName,
            trialType: newShow.type,
            plannedStartTime: wizardTrial.dateTime ? format(new Date(wizardTrial.dateTime), 'h:mm a') : '09:00 AM',
            order: String(trials.indexOf(wizardTrial) + 1),
          };
          addTrialToStore(newTrial);
        });
      } else {
        // New show - create all trials
        trials.forEach(wizardTrial => {
          const trialName = wizardTrial.name || `Trial ${trials.indexOf(wizardTrial) + 1}`;
          const newTrial: TrialInput = {
            showId: newShow.id,
            showName: newShow.name,
            name: trialName,
            trialDate: wizardTrial.dateTime,
            trialNumber: trialName,
            status: 'Upcoming',
            eventNumber: wizardTrial.eventNumber || '',
            type: trialName,
            trialType: newShow.type,
            plannedStartTime: wizardTrial.dateTime ? format(new Date(wizardTrial.dateTime), 'h:mm a') : '09:00 AM',
            order: String(trials.indexOf(wizardTrial) + 1),
          };
          addTrialToStore(newTrial);
        });
      }
      
      // Create classes for trials (after trials are created)
      // Build trial ID mapping
      const trialIdMap = buildTrialIdMapping(trials, newShow.id);
      
      setTimeout(() => {
        createClassesWithTrialMapping(newShow.id, trialIdMap);
      }, 1000); // Wait 1 second to ensure trials are saved first
      
      // Reset wizard and close
      resetWizard();
      onOpenChange(false);
      
      // Small delay to ensure show is persisted before navigation
      setTimeout(() => {
        logger.info('Show created and published successfully', 'wizard', { showId: newShow.id, showName: newShow.name });
        navigate(`/shows/${newShow.id}`);
      }, 500);
    } catch (error) {
      logger.error('Error creating and publishing show', 'wizard', {}, error as Error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [transformWizardDataToShow, addShow, addTrialToStore, trials, resetWizard, onOpenChange, navigate, setIsLoading, editMode, existingTrials, createClassesWithTrialMapping, buildTrialIdMapping, updateShow, showToShowInput]);

  // Navigation handlers
  const handleBack = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    } else {
      // Cancel from first step - close wizard
      handleClose();
    }
  }, [currentStep, setCurrentStep, handleClose]);

  const handleNext = useCallback(async () => {
    setIsLoading(true);
    
    try {
      // Mark current step as completed
      markStepCompleted(currentStep);
      
      if (currentStep < WIZARD_STEPS.length - 1) {
        // Move to next step
        setCurrentStep(currentStep + 1);
      }
      // Final step handled by ReviewStep buttons
    } catch (error) {
      logger.error('Error in wizard navigation', 'wizard', {}, error as Error);
      // TODO: Show error message to user
    } finally {
      setIsLoading(false);
    }
  }, [currentStep, markStepCompleted, setCurrentStep]);

  const handleSaveDraft = useCallback(async () => {
    setIsLoading(true);
    try {
      saveProgress();
      // TODO: Show success message
      logger.debug('Draft saved successfully', 'wizard');
    } catch (error) {
      logger.error('Error saving draft', 'wizard', {}, error as Error);
      // TODO: Show error message
    } finally {
      setIsLoading(false);
    }
  }, [saveProgress]);

  // Validate current step
  const isCurrentStepValid = useCallback((): boolean => {
    switch (currentStep) {
      case 0: // Show Details Step
        return completedSteps.includes(0); // Step marks itself complete when valid
      case 1: // Trial Configuration Step
        return completedSteps.includes(1); // Step marks itself complete when valid
      case 2: // Class Selection Step
        return completedSteps.includes(2); // Step marks itself complete when valid
      case 3: // Review Step
        return completedSteps.includes(3); // Step marks itself complete when valid
      default:
        return false;
    }
  }, [currentStep, completedSteps]);

  // Enhanced handleNext with validation
  const handleNextWithValidation = useCallback(async () => {
    // Check if current step is valid before proceeding
    if (!isCurrentStepValid()) {
      setShowValidationErrors(true);
      return;
    }
    
    // Clear validation errors on successful navigation
    setShowValidationErrors(false);
    
    // Proceed with normal next logic
    await handleNext();
  }, [isCurrentStepValid, handleNext]);

  // Step navigation validation
  const canGoBack = !isLoading; // Always can go back or cancel
  const canGoNext = !isLoading && isCurrentStepValid();

  // Get validation messages for current step
  const getValidationMessages = useCallback((): string[] => {
    const messages: string[] = [];
    
    switch (currentStep) {
      case 0: // Show Details Step
        if (!show.name?.trim()) messages.push('Show name is required');
        if (!show.type) messages.push('Show type is required');
        if (!show.startDate) messages.push('Start date is required');
        if (!show.endDate) messages.push('End date is required');
        if (!show.location?.trim()) messages.push('Location is required');
        if (!show.clubId) messages.push('Club selection is required');
        if (!show.chairman?.trim()) messages.push('Show chairman is required');
        if (!show.secretary?.trim()) messages.push('Show secretary is required');
        if (!show.entryOpenDate) messages.push('Entry open date is required');
        if (!show.entryCloseDate) messages.push('Entry close date is required');
        break;
        
      case 1: // Trial Configuration Step
        if (trials.length === 0) {
          messages.push('At least one trial is required');
        } else {
          trials.forEach((trial, index) => {
            if (!trial.name?.trim()) messages.push(`Trial ${index + 1} name is required`);
            if (!trial.dateTime) messages.push(`Trial ${index + 1} date and time is required`);
            if (!trial.eventNumber?.trim()) messages.push(`Trial ${index + 1} event number is required`);
          });
        }
        break;
        
      case 2: { // Class Selection Step
        const totalClasses = trials.reduce((sum, trial) => sum + trial.classes.length, 0);
        if (totalClasses === 0) {
          messages.push('At least one class must be added to the trials');
        }
        break;
      }
        
      case 3: // Review Step
        // Review step shows its own validation
        break;
    }
    
    return messages;
  }, [currentStep, show, trials]);

  // Render current step content
  const renderStepContent = () => {
    const stepProps = { className: "p-6" };
    
    switch (currentStep) {
      case 0:
        return <ShowDetailsStep {...stepProps} />;
      case 1:
        return <TrialConfigurationStep {...stepProps} />;
      case 2:
        return <ClassSelectionStep {...stepProps} />;
      case 3:
        return (
          <ReviewStep 
            {...stepProps}
            onSaveDraft={handleSaveDraftClick}
            onCreateShow={handleCreateShowClick}
            onCreateAndPublish={handleCreateAndPublishClick}
            onBack={handleBack}
          />
        );
      default:
        return <ShowDetailsStep {...stepProps} />;
    }
  };

  // Reset wizard when closing
  useEffect(() => {
    if (!open) {
      // Reset to first step when reopening, but don't reset data in edit mode
      setCurrentStep(0);
      setShowValidationErrors(false); // Clear validation errors when closing
      if (!editMode) {
        resetWizard();
      }
    }
  }, [open, setCurrentStep, editMode, resetWizard]);

  // Clear validation errors when form data changes (user is addressing the issues)
  useEffect(() => {
    if (showValidationErrors && isCurrentStepValid()) {
      setShowValidationErrors(false);
    }
  }, [show, trials, showValidationErrors, isCurrentStepValid]);

  // Calculate validation messages for rendering
  const validationMessages = getValidationMessages();

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(open) => {
          if (!open) {
            handleClose();
          }
        }}
      >
        <DialogContent className="max-w-5xl wizard-dialog p-0">
          <DialogHeader className="px-6 pt-6 pb-0">
            <DialogTitle>
              {editMode
                ? `${editMode.mode === 'add-trials' ? 'Add Trials' :
                     editMode.mode === 'add-classes' ? 'Add Classes' : 'Edit Show'}`
                : 'Create New Show'
              }
            </DialogTitle>
          </DialogHeader>
        <div className="flex flex-col h-[80vh] max-h-[800px] min-h-[600px]">
          {/* Progress Indicator - Fixed height */}
          <div className="flex-shrink-0">
            <ProgressIndicator
              steps={WIZARD_STEPS}
              currentStep={currentStep}
              completedSteps={completedSteps}
              onStepClick={goToStep}
              className="border-b py-4"
            />
          </div>

          {/* Validation Banner - Only shown when user tries to proceed with invalid data */}
          {showValidationErrors && validationMessages.length > 0 && (
            <div className="flex-shrink-0 px-6 py-3 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800/50">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <h4 className="font-medium text-amber-800 dark:text-amber-200 text-sm mb-1">
                    Please complete the following to continue:
                  </h4>
                  <ul className="text-sm text-amber-700 dark:text-amber-300 space-y-0.5">
                    {validationMessages.map((message, index) => (
                      <li key={index}>• {message}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Step Content - Scrollable area */}
          <div className="flex-1 overflow-auto min-h-0">
            {renderStepContent()}
          </div>

          {/* Navigation - Fixed at bottom, hidden on Review step since it has its own buttons */}
          {currentStep < WIZARD_STEPS.length - 1 && (
            <div className="flex-shrink-0 px-6 pb-6">
              <WizardNavigation
                currentStep={currentStep}
                totalSteps={WIZARD_STEPS.length}
                canGoBack={canGoBack}
                canGoNext={canGoNext}
                onBack={handleBack}
                onNext={handleNextWithValidation}
                onSaveDraft={isDirty ? handleSaveDraft : undefined}
                isLoading={isLoading}
              />
            </div>
          )}
        </div>
        </DialogContent>
      </Dialog>

      {/* Unsaved Changes Confirmation Dialog */}
      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved Changes</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes that will be lost. Are you sure you want to close the wizard?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Editing</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmClose} className="bg-amber-500 hover:bg-amber-600">
              Close Wizard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default ShowCreationWizard;