import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { logger } from '@/services/LoggingService';
import { format } from 'date-fns';
import { AlertTriangle, ArrowLeft, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
import { useWizardStore } from '@/store/wizardStore';
import { useShowStore, type ShowInput } from '@/store/showStore';
import { useClubStore } from '@/store/clubStore';
import { useTrialStore, type TrialInput } from '@/store/trialStore';
import { useClassStoreCompat } from '@/hooks/useClassStoreCompat';
import { useUserStore } from '@/store/userStore';
import type { Show } from '@/types/show-types';
import type { ClassData } from '@/components/classes/types/classTypes';
import VerticalProgressIndicator from '@/components/shows/wizard/components/VerticalProgressIndicator';
import WizardNavigation from '@/components/shows/wizard/components/WizardNavigation';
import ShowDetailsStep from '@/components/shows/wizard/steps/ShowDetailsStep';
import TrialConfigurationStep from '@/components/shows/wizard/steps/TrialConfigurationStep';
import ClassSelectionStep from '@/components/shows/wizard/steps/ClassSelectionStep';
import ReviewStep from '@/components/shows/wizard/steps/ReviewStep';
import { PanelProvider, PanelStack } from '@/components/panels';

const WIZARD_STEPS = [
  { id: 0, label: 'Show Details', description: 'Basic information' },
  { id: 1, label: 'Trials', description: 'Configure trials' },
  { id: 2, label: 'Classes', description: 'Select from templates' },
  { id: 3, label: 'Review', description: 'Final confirmation' },
];

const ShowCreationWizardPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [isLoading, setIsLoading] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [validationExpanded, setValidationExpanded] = useState(false);
  const stepContentRef = useRef<HTMLDivElement>(null);

  // Extract edit mode from URL params
  const editMode = (() => {
    const showId = searchParams.get('showId');
    const mode = searchParams.get('mode') as 'add-trials' | 'add-classes' | 'edit-show' | null;
    return showId && mode ? { showId, mode } : undefined;
  })();
  
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
  const { clubs, loadClubs } = useClubStore();
  const { addTrial: addTrialToStore, trials: existingTrials } = useTrialStore();
  const { addClass, classes: existingClasses } = useClassStoreCompat();
  const { people, loadPeople } = useUserStore();

  // Load required data when page mounts
  useEffect(() => {
    loadClubs();
    loadPeople();
  }, [loadClubs, loadPeople]);

  // Keyboard navigation handler - Escape to prompt save draft
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isDirty) {
        e.preventDefault();
        setShowConfirmDialog(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDirty]);

  // Focus first input when step changes
  useEffect(() => {
    const timer = setTimeout(() => {
      if (stepContentRef.current) {
        const firstInput = stepContentRef.current.querySelector<HTMLInputElement>(
          'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])'
        );
        if (firstInput && typeof firstInput.focus === 'function') {
          firstInput.focus();
        }
      }
    }, 350); // Wait for animation to complete

    return () => clearTimeout(timer);
  }, [currentStep]);

  // Initialize wizard with existing show data in edit mode
  useEffect(() => {
    if (editMode) {
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
  }, [editMode, shows, existingTrials, loadDraft, people, existingClasses]);
  
  // Helper function to build trial ID mapping
  const buildTrialIdMapping = useCallback((wizardTrials: typeof trials, showId: string): Record<string, string> => {
    const trialIdMap: Record<string, string> = {};
    const baseId = Math.max(0, ...existingTrials.map(t => parseInt(t.id))) + 1;
    
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
          
          logger.debug('Adding class', 'wizard', { classId: classData.id, className: classData.className });
          addClass(classData);
        });
      } else if (!trialId) {
        logger.warn('No trial ID mapping found for wizard trial', 'wizard', { trialName: wizardTrial.name });
      } else {
        logger.debug('Wizard trial has no classes', 'wizard', { trialName: wizardTrial.name });
      }
    });
  }, [trials, addClass, judgeDetails, editMode, existingTrials]);
  
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
  const handleClose = useCallback(() => {
    if (isDirty) {
      setShowConfirmDialog(true);
      return;
    }
    navigate('/secretary/shows');
  }, [isDirty, navigate]);

  // Handle confirmation dialog result
  const handleConfirmClose = useCallback(() => {
    resetWizard();
    navigate('/secretary/shows');
    setShowConfirmDialog(false);
  }, [resetWizard, navigate]);

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
      
      // Navigate to the new draft show
      navigate(`/shows/${newShow.id}`);
      
      logger.info('Draft saved successfully', 'wizard', { showId: newShow.id, showName: newShow.name });
    } catch (error) {
      logger.error('Error saving draft', 'wizard', {}, error as Error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [transformWizardDataToShow, addShow, addTrialToStore, trials, saveProgress, navigate, setIsLoading, editMode, existingTrials, createClassesWithTrialMapping, buildTrialIdMapping, updateShow, showToShowInput]);

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
      
      // Navigate to the new show
      navigate(`/shows/${newShow.id}`);
      
      logger.info('Show created successfully (unpublished)', 'wizard', { showId: newShow.id, showName: newShow.name });
    } catch (error) {
      logger.error('Error creating show', 'wizard', {}, error as Error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [transformWizardDataToShow, addShow, addTrialToStore, trials, resetWizard, navigate, setIsLoading, editMode, existingTrials, createClassesWithTrialMapping, buildTrialIdMapping, updateShow, showToShowInput]);

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
      
      // Navigate to the new show
      navigate(`/shows/${newShow.id}`);
      
      logger.info('Show created and published successfully', 'wizard', { showId: newShow.id, showName: newShow.name });
    } catch (error) {
      logger.error('Error creating and publishing show', 'wizard', {}, error as Error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [transformWizardDataToShow, addShow, addTrialToStore, trials, resetWizard, navigate, setIsLoading, editMode, existingTrials, createClassesWithTrialMapping, buildTrialIdMapping, updateShow, showToShowInput]);

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

  // Step navigation validation
  const canGoBack = !isLoading; // Always can go back or cancel
  const canGoNext = !isLoading && isCurrentStepValid();
  
  // Validate current step
  function isCurrentStepValid(): boolean {
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
  }

  // Get validation messages for current step
  function getValidationMessages(): string[] {
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
  }

  // Render current step content
  const renderStepContent = () => {
    const stepProps = { className: "" }; // Remove padding since it's now handled by wrapper
    
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

  // Reset wizard when component unmounts or navigating away
  useEffect(() => {
    return () => {
      if (!editMode) {
        resetWizard();
      }
    };
  }, [editMode, resetWizard]);

  return (
    <PanelProvider
      onEntityCreated={(entity, context) => {
        logger.debug('Entity created', 'wizard', { entityName: entity.name || entity.id, entityType: context.entityType });

        // Handle automatic selection of newly created entities
        if (context.selectionCallback) {
          context.selectionCallback(entity);
        }
      }}
      onPanelResult={(panelId, result) => {
        logger.debug('Panel result', 'wizard', { panelId, action: result.action, success: result.success });
      }}
    >
      <div className="min-h-screen bg-background">
        {/* Header with breadcrumb and back button */}
        <div className="border-b bg-card/95 backdrop-blur-xl sticky top-16 z-40">
          <div className="container mx-auto px-6 py-4 max-w-7xl">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClose}
                className="gap-2 hover:-translate-y-0.5 transition-all duration-300"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>Secretary</span>
                <span>/</span>
                <span>Create Show</span>
                <span>/</span>
                <span className="text-foreground font-medium">
                  {editMode 
                    ? `${editMode.mode === 'add-trials' ? 'Add Trials' : 
                         editMode.mode === 'add-classes' ? 'Add Classes' : 'Edit Show'}`
                    : 'Wizard'
                  }
                </span>
              </div>
            </div>
          </div>
        </div>

      <div className="container mx-auto px-4 sm:px-6 pt-20 sm:pt-24 pb-8 max-w-7xl">
        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4 sm:gap-6 lg:gap-8">
          {/* Sidebar - Progress Indicator */}
          <div className="lg:col-span-1">
            <div className="sticky top-28 lg:top-32">
              <div className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80 border border-border rounded-2xl p-6 shadow-sm backdrop-blur-xl transition-all duration-500 hover:shadow-lg">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <div className="relative">
                  <h2 className="text-xl font-semibold mb-6 text-foreground group-hover:text-primary transition-colors duration-300">
                    {editMode 
                      ? `${editMode.mode === 'add-trials' ? 'Add Trials' : 
                           editMode.mode === 'add-classes' ? 'Add Classes' : 'Edit Show'}`
                      : 'Create New Show'
                    }
                  </h2>
                  <VerticalProgressIndicator
                    steps={WIZARD_STEPS}
                    currentStep={currentStep}
                    completedSteps={completedSteps}
                    onStepClick={goToStep}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Main Content */}
          <div className="lg:col-span-1">
            <div className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80 border border-border rounded-2xl shadow-sm backdrop-blur-xl min-h-[700px] flex flex-col transition-all duration-300 hover:shadow-lg">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              {/* Collapsible Validation Banner */}
              {(() => {
                const validationMessages = getValidationMessages();
                const messageCount = validationMessages.length;

                if (messageCount === 0) return null;

                return (
                  <div className="relative border-b border-amber-200/50 dark:border-amber-700/50 rounded-t-2xl overflow-hidden">
                    {/* Collapsed Header - Always visible */}
                    <button
                      onClick={() => setValidationExpanded(!validationExpanded)}
                      className="w-full px-6 sm:px-8 py-3 bg-gradient-to-r from-amber-50/80 to-amber-100/80 dark:from-amber-900/30 dark:to-amber-800/30 backdrop-blur-sm flex items-center justify-between hover:from-amber-100/80 hover:to-amber-150/80 dark:hover:from-amber-900/40 dark:hover:to-amber-800/40 transition-colors duration-200"
                    >
                      <div className="flex items-center gap-3">
                        <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
                        <span className="text-sm font-medium text-amber-800 dark:text-amber-200">
                          {messageCount} required field{messageCount !== 1 ? 's' : ''} need{messageCount === 1 ? 's' : ''} attention
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-amber-600 dark:text-amber-400">
                          {validationExpanded ? 'Hide' : 'Show'} details
                        </span>
                        {validationExpanded ? (
                          <ChevronUp className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                        )}
                      </div>
                    </button>

                    {/* Expanded Details */}
                    <div
                      className={`overflow-hidden transition-all duration-300 ease-out ${
                        validationExpanded ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
                      }`}
                    >
                      <div className="px-6 sm:px-8 py-4 bg-gradient-to-r from-amber-50/60 to-amber-100/60 dark:from-amber-900/20 dark:to-amber-800/20">
                        <ul className="text-sm text-amber-700 dark:text-amber-300 space-y-1.5">
                          {validationMessages.map((message, index) => (
                            <li key={index} className="flex items-start gap-2">
                              <span className="block w-1.5 h-1.5 bg-amber-500 dark:bg-amber-400 rounded-full mt-1.5 flex-shrink-0" />
                              <span>{message}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Step Content with Transition */}
              <div className="relative flex-1 overflow-auto">
                <div
                  ref={stepContentRef}
                  key={currentStep}
                  className="p-6 sm:p-8 animate-in fade-in slide-in-from-right-4 duration-300"
                  role="region"
                  aria-label={`Step ${currentStep + 1}: ${WIZARD_STEPS[currentStep]?.label}`}
                >
                  {renderStepContent()}
                </div>
              </div>

              {/* Navigation - Fixed at bottom, hidden on Review step since it has its own buttons */}
              {currentStep < WIZARD_STEPS.length - 1 && (
                <div className="relative border-t bg-gradient-to-r from-muted/10 to-muted/5 backdrop-blur-sm p-4 sm:p-6 rounded-b-2xl">
                  <WizardNavigation
                    currentStep={currentStep}
                    totalSteps={WIZARD_STEPS.length}
                    canGoBack={canGoBack}
                    canGoNext={canGoNext}
                    onBack={handleBack}
                    onNext={handleNext}
                    onSaveDraft={isDirty ? handleSaveDraft : undefined}
                    isLoading={isLoading}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      </div>

      {/* Panel Stack for slide-over panels */}
      <PanelStack maxPanels={3} />

      {/* Unsaved Changes Confirmation Dialog */}
      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved Changes</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes that will be lost. Are you sure you want to leave the wizard?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Editing</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmClose} className="bg-amber-500 hover:bg-amber-600">
              Leave Wizard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PanelProvider>
  );
};

export default ShowCreationWizardPage;