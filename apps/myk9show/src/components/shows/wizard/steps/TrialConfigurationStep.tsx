import React, { useCallback, useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { DateTimePicker } from '@/components/ui/date-time-picker';
import { Plus, Trash2, GripVertical } from 'lucide-react';
import { format, isWithinInterval, parseISO } from 'date-fns';
import { AppleFormField, AppleFormGrid } from '@/components/ui/AppleDialog';
import { useWizardStore } from '@/store/wizardStore';

interface TrialConfigurationStepProps {
  className?: string;
}

export const TrialConfigurationStep: React.FC<TrialConfigurationStepProps> = ({ className }) => {
  const { 
    show, 
    trials, 
    addTrial, 
    updateTrial, 
    removeTrial, 
    markStepCompleted 
  } = useWizardStore();
  
  const [errors, setErrors] = useState<Record<string, string>>({});


  // Validate trials form
  const validateTrials = useCallback(() => {
    const newErrors: Record<string, string> = {};
    
    if (trials.length === 0) {
      newErrors.trials = 'At least one trial is required';
    }
    
    // Validate each trial
    trials.forEach((trial, index) => {
      const prefix = `trial-${index}`;
      
      if (!trial.name.trim()) {
        newErrors[`${prefix}-name`] = 'Trial name is required';
      }
      
      if (!trial.dateTime) {
        newErrors[`${prefix}-dateTime`] = 'Trial date and time is required';
      } else if (show.startDate && show.endDate) {
        // Check if trial date is within show date range
        const trialDate = parseISO(trial.dateTime);
        const showStart = parseISO(show.startDate);
        const showEnd = parseISO(show.endDate);
        
        if (!isWithinInterval(trialDate, { start: showStart, end: showEnd })) {
          newErrors[`${prefix}-dateTime`] = 'Trial date must be within show dates';
        }
      }
      
      if (!trial.eventNumber.trim()) {
        newErrors[`${prefix}-eventNumber`] = 'Event number is required';
      }
    });
    
    // Check for duplicate trial names
    const names = trials.map(t => t.name.trim().toLowerCase());
    const duplicateNames = names.filter((name, index) => names.indexOf(name) !== index);
    if (duplicateNames.length > 0) {
      newErrors.duplicateNames = 'Trial names must be unique';
    }
    
    // Check for duplicate event numbers
    const eventNumbers = trials.map(t => t.eventNumber.trim());
    const duplicateEvents = eventNumbers.filter((num, index) => eventNumbers.indexOf(num) !== index);
    if (duplicateEvents.length > 0) {
      newErrors.duplicateEvents = 'Event numbers must be unique';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [trials, show.startDate, show.endDate]);

  // Auto-validate and mark step complete when form is valid
  useEffect(() => {
    if (validateTrials()) {
      markStepCompleted(1);
    }
  }, [trials, markStepCompleted, validateTrials]);

  const handleAddTrial = () => {
    const trialNumber = trials.length + 1;
    const defaultDateTime = show.startDate || format(new Date(), "yyyy-MM-dd'T'08:00:00");
    
    addTrial({
      name: `Trial ${trialNumber}`,
      dateTime: defaultDateTime,
      eventNumber: trialNumber.toString(),
      classes: []
    });
  };

  const handleTrialDateTimeChange = (trialId: string, date: Date | undefined) => {
    if (date) {
      updateTrial(trialId, { dateTime: format(date, "yyyy-MM-dd'T'HH:mm:ss") });
    }
  };


  return (
    <div className={className}>
      <div className="space-y-6">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Add Trial Button */}
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-medium">Trials ({trials.length})</h3>
            <Button onClick={handleAddTrial} className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Add Trial
            </Button>
          </div>

          {/* Trial List */}
          {trials.length === 0 ? (
            <div className="rounded-lg border-2 border-dashed border-muted-foreground/25 p-8 text-center">
              <h4 className="text-lg font-medium text-muted-foreground mb-2">
                No Trials Added
              </h4>
              <p className="text-sm text-muted-foreground mb-4">
                Add at least one trial to continue
              </p>
              <Button onClick={handleAddTrial} variant="outline">
                <Plus className="h-4 w-4 mr-2" />
                Add Your First Trial
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {trials.map((trial, index) => (
                <div key={trial.id} className="border rounded-lg p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <GripVertical className="h-4 w-4 text-muted-foreground" />
                      <h4 className="font-medium">Trial {index + 1}</h4>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeTrial(trial.id)}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  <AppleFormGrid columns={2}>
                    <AppleFormField 
                      label="Trial Name" 
                      required 
                      error={errors[`trial-${index}-name`]}
                    >
                      <Input
                        value={trial.name}
                        onChange={(e) => updateTrial(trial.id, { name: e.target.value })}
                        placeholder="e.g., Trial 1, Novice Trial"
                        className="form-input h-10"
                      />
                    </AppleFormField>

                    <AppleFormField 
                      label="Event Number" 
                      required 
                      error={errors[`trial-${index}-eventNumber`]}
                    >
                      <Input
                        value={trial.eventNumber}
                        onChange={(e) => updateTrial(trial.id, { eventNumber: e.target.value })}
                        placeholder="e.g., 1, 2024-001"
                        className="form-input h-10"
                      />
                    </AppleFormField>
                  </AppleFormGrid>

                  <AppleFormGrid columns={1}>
                    <AppleFormField 
                      label="Trial Date & Time" 
                      required 
                      error={errors[`trial-${index}-dateTime`]}
                    >
                      <DateTimePicker
                        value={trial.dateTime ? new Date(trial.dateTime) : undefined}
                        onChange={(date) => handleTrialDateTimeChange(trial.id, date)}
                        placeholder="Pick trial date and time"
                        className="h-10"
                        minDate={show.startDate ? new Date(show.startDate) : new Date()}
                        maxDate={show.endDate ? new Date(show.endDate) : undefined}
                        showTime={true}
                        timeFormat="12h"
                      />
                    </AppleFormField>
                  </AppleFormGrid>
                </div>
              ))}
            </div>
          )}

          {/* Validation Summary */}
          {Object.keys(errors).length > 0 && (
            <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-4">
              <p className="text-sm font-medium text-destructive mb-2">
                Please fix the following errors to continue:
              </p>
              <ul className="text-sm text-destructive space-y-1">
                {Object.values(errors).map((error, index) => (
                  <li key={index}>• {error}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TrialConfigurationStep;