import React, { useEffect, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { DateTimePicker } from '@/components/ui/date-time-picker';
import { Plus, Trash2, GripVertical, CalendarPlus, HelpCircle } from 'lucide-react';
import { format, isWithinInterval, parseISO } from 'date-fns';
import { Label } from '@/components/ui/label';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
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

  // Derive errors using useMemo instead of useState + effect
  const errors = useMemo(() => {
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

    return newErrors;
  }, [trials, show.startDate, show.endDate]);

  // Derive validity from errors
  const isValid = Object.keys(errors).length === 0;

  // Mark step complete when form is valid
  useEffect(() => {
    if (isValid) {
      markStepCompleted(1);
    }
  }, [isValid, markStepCompleted]);

  const handleAddTrial = () => {
    const trialNumber = trials.length + 1;
    // Default to 8:00 AM on the show start date, or today at 8:00 AM
    const baseDate = show.startDate ? new Date(show.startDate) : new Date();
    baseDate.setHours(8, 0, 0, 0); // Set to 8:00 AM
    const defaultDateTime = format(baseDate, "yyyy-MM-dd'T'HH:mm:ss");

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
            <h3 className="text-lg font-semibold pl-3 border-l-2 border-primary text-primary">Trials ({trials.length})</h3>
            <Button onClick={handleAddTrial} className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Add Trial
            </Button>
          </div>

          {/* Trial List */}
          {trials.length === 0 ? (
            <div className="relative rounded-2xl border-2 border-dashed border-primary/20 bg-gradient-to-br from-primary/5 to-transparent p-12 text-center overflow-hidden">
              {/* Background decoration */}
              <div className="absolute inset-0 opacity-5">
                <div className="absolute top-4 left-4 w-24 h-24 rounded-full bg-primary" />
                <div className="absolute bottom-4 right-4 w-32 h-32 rounded-full bg-primary" />
              </div>

              <div className="relative">
                <div className="mx-auto w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-5 shadow-sm">
                  <CalendarPlus className="h-8 w-8 text-primary" />
                </div>
                <h4 className="text-xl font-semibold text-foreground mb-2">
                  Schedule Your Trials
                </h4>
                <p className="text-sm text-muted-foreground max-w-sm mx-auto mb-6">
                  Trials are individual competition events within your show. Add your first trial to get started.
                </p>
                <Button onClick={handleAddTrial} size="lg" className="shadow-md">
                  <Plus className="h-4 w-4 mr-2" />
                  Add First Trial
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {trials.map((trial, index) => (
                <div key={trial.id} className="border border-border rounded-xl p-5 space-y-4 bg-card/50 hover:bg-card/80 transition-colors duration-200 shadow-sm">
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

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Trial Name <span className="text-destructive">*</span></Label>
                      <Input
                        value={trial.name}
                        onChange={(e) => updateTrial(trial.id, { name: e.target.value })}
                        placeholder="e.g., Trial 1, Novice Trial"
                        className="h-10"
                      />
                      {errors[`trial-${index}-name`] && (
                        <p className="text-sm text-destructive">{errors[`trial-${index}-name`]}</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label className="flex items-center gap-1.5">
                        Event Number <span className="text-destructive">*</span>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-xs">
                              <p>A unique identifier for this trial, often assigned by the sanctioning organization (e.g., "2024-001" for AKC events).</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </Label>
                      <Input
                        value={trial.eventNumber}
                        onChange={(e) => updateTrial(trial.id, { eventNumber: e.target.value })}
                        placeholder="e.g., 1, 2024-001"
                        className="h-10"
                      />
                      {errors[`trial-${index}-eventNumber`] && (
                        <p className="text-sm text-destructive">{errors[`trial-${index}-eventNumber`]}</p>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Trial Date & Time <span className="text-destructive">*</span></Label>
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
                    {errors[`trial-${index}-dateTime`] && (
                      <p className="text-sm text-destructive">{errors[`trial-${index}-dateTime`]}</p>
                    )}
                  </div>
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