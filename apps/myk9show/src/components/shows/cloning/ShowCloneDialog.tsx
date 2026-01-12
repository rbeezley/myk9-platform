import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppleDialog } from '@/components/ui/AppleDialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { logger } from '@/services/LoggingService';
import {
  Copy,
  ArrowRight,
  Search,
  CheckCircle
} from 'lucide-react';
import { ShowSelector } from './ShowSelector';
import { CloneReviewStep } from './CloneReviewStep';
import { useShowStore } from '@/store/showStore';
import { useWizardStore } from '@/store/wizardStore';
import { format, addYears } from 'date-fns';

// Wizard trial type for proper typing
type WizardTrial = {
  id: string;
  name: string;
  dateTime: string; // Changed to match new dateTime field
  eventNumber: string;
  classes: Array<{
    templateId: string;
    customizations: Record<string, unknown>;
    judgeId?: string;
  }>;
};

// Show selector type that matches the ShowSelector interface expectations
interface ShowSelectorShow {
  id: string;
  name: string;
  type: string;
  startDate: string;
  endDate: string;
  location: string;
  clubId?: string;
  entryDeadline?: string;
  entryCloseDate?: string;
  entryFee?: number;
  preEntryFee?: string;
  status: 'upcoming' | 'active' | 'completed' | 'cancelled';
  trials?: WizardTrial[];
  classes?: { id: string; name: string }[];
  judgeIds?: string[];
}

// Cloneable show type matching CloneReviewStep expectations
interface CloneableShow {
  id: string;
  name: string;
  type: string;
  startDate: string;
  endDate: string;
  location: string;
  entryFee: number; // Legacy field for compatibility
  entryDeadline: string; // Alias for entryCloseDate for backward compatibility
  entryCloseDate: string;
  clubId?: string;
  trials?: WizardTrial[];
  classes?: { id: string; name: string }[];
  judgeIds?: string[];
}

interface ShowCloneDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type CloneStep = 'select' | 'review' | 'complete';

interface CloneTransformation {
  dateShift: number; // years to shift
  updateJudges: boolean;
  updateFees: boolean;
  updateLocation: boolean;
  newName?: string;
  newLocation?: string;
  newEntryFee?: number;
}

export const ShowCloneDialog: React.FC<ShowCloneDialogProps> = ({
  open,
  onOpenChange,
}) => {
  const navigate = useNavigate();
  const { shows } = useShowStore();
  const { resetWizard, updateShowData, addTrial } = useWizardStore();
  
  const [currentStep, setCurrentStep] = useState<CloneStep>('select');
  const [selectedShow, setSelectedShow] = useState<CloneableShow | null>(null);
  const [transformation, setTransformation] = useState<CloneTransformation>({
    dateShift: 1,
    updateJudges: false,
    updateFees: true,
    updateLocation: false
  });
  const [isCloning, setIsCloning] = useState(false);

  // Handle show selection
  const handleShowSelected = useCallback((show: ShowSelectorShow) => {
    // Convert ShowSelectorShow to CloneableShow
    const cloneableShow: CloneableShow = {
      ...show,
      entryFee: show.entryFee || 0,
      entryDeadline: show.entryCloseDate || show.startDate, // For backward compatibility
      entryCloseDate: show.entryCloseDate || show.startDate
    };
    setSelectedShow(cloneableShow);
    
    // Auto-generate transformation defaults
    const currentYear = new Date().getFullYear();
    const showYear = new Date(cloneableShow.startDate).getFullYear();
    const yearDiff = currentYear - showYear + 1;
    
    setTransformation(prev => ({
      ...prev,
      dateShift: yearDiff,
      newName: `${cloneableShow.name} ${currentYear + 1}`,
      newEntryFee: cloneableShow.entryFee * 1.05 // 5% increase
    }));
    
    setCurrentStep('review');
  }, []);

  // Handle transformation updates
  const handleTransformationChange = useCallback((updates: Partial<CloneTransformation>) => {
    setTransformation(prev => ({ ...prev, ...updates }));
  }, []);

  // Clone the show
  const handleCloneShow = useCallback(async () => {
    if (!selectedShow) return;
    
    setIsCloning(true);
    
    try {
      // Reset wizard state
      resetWizard();
      
      // Transform show data
      const originalStartDate = new Date(selectedShow.startDate);
      const originalEndDate = new Date(selectedShow.endDate);
      const originalDeadline = new Date(selectedShow.entryDeadline || selectedShow.startDate);
      
      const newStartDate = addYears(originalStartDate, transformation.dateShift);
      const newEndDate = addYears(originalEndDate, transformation.dateShift);
      const newDeadline = addYears(originalDeadline, transformation.dateShift);
      
      // Update show data in wizard
      updateShowData({
        name: transformation.newName || selectedShow.name,
        type: selectedShow.type as 'AKC' | 'UKC' | 'Other',
        startDate: format(newStartDate, 'yyyy-MM-dd'),
        endDate: format(newEndDate, 'yyyy-MM-dd'),
        location: transformation.newLocation || selectedShow.location,
        clubId: selectedShow.clubId || '',
        entryCloseDate: format(newDeadline, 'yyyy-MM-dd'),
        preEntryFee: transformation.newEntryFee || selectedShow.entryFee,
        judgeIds: transformation.updateJudges ? [] : selectedShow.judgeIds || []
      });
      
      // Clone trials
      if (selectedShow.trials) {
        selectedShow.trials.forEach((trial: WizardTrial) => {
          const trialDate = addYears(new Date(trial.dateTime), transformation.dateShift);
          
          addTrial({
            name: trial.name,
            dateTime: format(trialDate, "yyyy-MM-dd'T'08:00:00"), // Default to 8:00 AM
            eventNumber: trial.eventNumber,
            classes: transformation.updateJudges 
              ? trial.classes.map((cls) => ({ ...cls, judgeId: undefined }))
              : trial.classes || []
          });
        });
      }
      
      setCurrentStep('complete');
      
      // Small delay for user feedback
      setTimeout(() => {
        onOpenChange(false);
        
        // Open the wizard with pre-populated data
        // This would typically trigger the ShowCreationWizard to open
        // For now, we'll navigate to shows page
        navigate('/shows');
      }, 2000);
      
    } catch (error) {
      logger.error('Error cloning show:', 'shows', {}, error as Error);
    } finally {
      setIsCloning(false);
    }
  }, [selectedShow, transformation, resetWizard, updateShowData, addTrial, navigate, onOpenChange]);

  // Handle dialog close
  const handleClose = useCallback(() => {
    setCurrentStep('select');
    setSelectedShow(null);
    setTransformation({
      dateShift: 1,
      updateJudges: false,
      updateFees: true,
      updateLocation: false
    });
    onOpenChange(false);
  }, [onOpenChange]);

  // Handle back navigation
  const handleBack = useCallback(() => {
    if (currentStep === 'review') {
      setCurrentStep('select');
    }
  }, [currentStep]);

  // Render step content
  const renderStepContent = () => {
    switch (currentStep) {
      case 'select':
        return (
          <ShowSelector
            shows={shows.map(show => {
              const validStatuses = ['upcoming', 'active', 'completed', 'cancelled'] as const;
              type ValidStatus = typeof validStatuses[number];
              const isValidStatus = (status: string): status is ValidStatus => 
                validStatuses.includes(status as ValidStatus);
              
              const mappedShow: ShowSelectorShow = {
                ...show,
                status: isValidStatus(show.status) ? show.status : 'upcoming',
                entryCloseDate: show.entryCloseDate,
                entryFee: parseFloat(show.preEntryFee) || 0,
                trials: undefined // Exclude trials as they have different structure
              };
              return mappedShow;
            })}
            onShowSelected={handleShowSelected}
            className="min-h-[500px]"
          />
        );
        
      case 'review':
        return (
          <CloneReviewStep
            originalShow={selectedShow!}
            transformation={transformation}
            onTransformationChange={handleTransformationChange}
            className="min-h-[500px]"
          />
        );
        
      case 'complete':
        return (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="p-4 bg-green-100 rounded-full mb-6">
              <CheckCircle className="h-12 w-12 text-green-600" />
            </div>
            <h3 className="text-2xl font-bold mb-2">Show Cloned Successfully!</h3>
            <p className="text-muted-foreground mb-4">
              "{transformation.newName || selectedShow?.name}" has been created from the cloned data.
            </p>
            <p className="text-sm text-muted-foreground">
              You can now continue editing in the Show Creation Wizard or view it in your shows list.
            </p>
          </div>
        );
        
      default:
        return null;
    }
  };

  // Get dialog title
  const getDialogTitle = () => {
    switch (currentStep) {
      case 'select':
        return 'Clone Existing Show';
      case 'review':
        return 'Review Cloned Show';
      case 'complete':
        return 'Cloning Complete';
      default:
        return 'Clone Show';
    }
  };

  return (
    <AppleDialog
      open={open}
      onOpenChange={handleClose}
      title={getDialogTitle()}
      maxWidth="5xl"
      showFooter={false}
    >
      <div className="flex h-full max-h-[80vh] flex-col">
        {/* Progress indicator */}
        {currentStep !== 'complete' && (
          <div className="border-b bg-muted/30 px-6 py-4">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-4">
                <div className={`flex items-center gap-2 ${
                  currentStep === 'select' ? 'text-primary font-medium' : 'text-muted-foreground'
                }`}>
                  <div className={`rounded-full p-1 ${
                    currentStep === 'select' ? 'bg-primary text-primary-foreground' : 'bg-muted'
                  }`}>
                    <Search className="h-3 w-3" />
                  </div>
                  Select Show
                </div>
                
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
                
                <div className={`flex items-center gap-2 ${
                  currentStep === 'review' ? 'text-primary font-medium' : 'text-muted-foreground'
                }`}>
                  <div className={`rounded-full p-1 ${
                    currentStep === 'review' ? 'bg-primary text-primary-foreground' : 'bg-muted'
                  }`}>
                    <Copy className="h-3 w-3" />
                  </div>
                  Review & Clone
                </div>
              </div>
              
              {selectedShow && (
                <Badge variant="outline" className="text-xs">
                  Cloning: {selectedShow.name}
                </Badge>
              )}
            </div>
          </div>
        )}

        {/* Step content */}
        <div className="flex-1 overflow-auto p-6">
          {renderStepContent()}
        </div>

        {/* Navigation */}
        {currentStep !== 'complete' && (
          <div className="border-t bg-background px-6 py-4">
            <div className="flex items-center justify-between">
              <Button
                variant="outline"
                onClick={currentStep === 'review' ? handleBack : handleClose}
              >
                {currentStep === 'review' ? 'Back' : 'Cancel'}
              </Button>

              <div className="flex items-center gap-3">
                {currentStep === 'select' && (
                  <p className="text-sm text-muted-foreground">
                    Select a show to clone and customize
                  </p>
                )}
                
                {currentStep === 'review' && (
                  <Button
                    onClick={handleCloneShow}
                    disabled={isCloning}
                  >
                    {isCloning ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                        Cloning...
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4 mr-2" />
                        Clone Show
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </AppleDialog>
  );
};

export default ShowCloneDialog;