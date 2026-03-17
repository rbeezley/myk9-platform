import React, { useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { DateTimePicker } from '@/components/ui/date-time-picker';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Trash2, GripVertical, CalendarPlus, HelpCircle } from 'lucide-react';
import { addDays, format, isWithinInterval } from 'date-fns';
import { parseLocalDateString } from '@/utils/dateLocal';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useWizardStore } from '@/store/wizardStore';
import { useTemplates } from '@/hooks/useTemplates';
import { TrialType, getTrialTypesForOrganization } from '@/types/template.types';

/** Parse a date string safely — handles both YYYY-MM-DD and ISO datetime */
function safeParseDateString(str: string | undefined): Date | undefined {
  if (!str) return undefined;
  // YYYY-MM-DD (no time) → use parseLocalDateString to avoid UTC shift
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return parseLocalDateString(str);
  // ISO datetime with time component → new Date() is safe
  return new Date(str);
}

interface TrialConfigurationStepProps {
  className?: string;
  /** Number of existing trials already in the show (for add-trials mode info banner). */
  existingTrialCount?: number;
}

export const TrialConfigurationStep: React.FC<TrialConfigurationStepProps> = ({
  className,
  existingTrialCount = 0,
}) => {
  const { show, trials, addTrial, updateTrial, removeTrial } = useWizardStore();
  const { templates } = useTemplates();

  // Derive trial types from active templates for this org.
  // Falls back to the static mapping if no templates exist yet.
  const trialTypeOptions = useMemo(() => {
    const fromTemplates = Array.from(
      new Set(
        templates
          .filter(t => t.isActive && t.organization === show.organization)
          .map(t => t.trialType as TrialType)
      )
    );
    if (fromTemplates.length > 0) {
      return fromTemplates.includes(TrialType.OTHER)
        ? fromTemplates
        : [...fromTemplates, TrialType.OTHER];
    }
    return getTrialTypesForOrganization(show.organization);
  }, [show.organization, templates]);

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
        const trialDate = parseLocalDateString(trial.dateTime) || new Date(trial.dateTime);
        const showStart = parseLocalDateString(show.startDate) || new Date();
        const showEnd = parseLocalDateString(show.endDate) || new Date();

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
    const duplicateEvents = eventNumbers.filter(
      (num, index) => eventNumbers.indexOf(num) !== index
    );
    if (duplicateEvents.length > 0) {
      newErrors.duplicateEvents = 'Event numbers must be unique';
    }

    return newErrors;
  }, [trials, show.startDate, show.endDate]);

  const handleAddTrial = () => {
    const trialNumber = trials.length + 1;
    const trialIndex = trials.length;
    // Default 2 trials per day: trials 0-1 → startDate, 2-3 → startDate+1, etc.
    const startDate = (show.startDate && parseLocalDateString(show.startDate)) || new Date();
    const daysOffset = Math.floor(trialIndex / 2);
    let baseDate = addDays(startDate, daysOffset);
    // Cap at show end date if set
    if (show.endDate) {
      const endDate = parseLocalDateString(show.endDate) || new Date();
      if (baseDate > endDate) {
        baseDate = endDate;
      }
    }
    baseDate.setHours(8, 0, 0, 0); // Set to 8:00 AM
    const defaultDateTime = format(baseDate, "yyyy-MM-dd'T'HH:mm:ss");

    addTrial({
      name: `Trial ${trialNumber}`,
      dateTime: defaultDateTime,
      eventNumber: trialNumber.toString(),
      classes: [],
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
            <h3 className="text-lg font-semibold pl-3 border-l-2 border-primary text-primary">
              Trials ({trials.length})
            </h3>
            <Button onClick={handleAddTrial} className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Add Trial
            </Button>
          </div>

          {/* Existing trials info banner */}
          {existingTrialCount > 0 && (
            <div className="rounded-lg border border-border bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">
                {existingTrialCount} existing {existingTrialCount === 1 ? 'trial' : 'trials'}
              </span>{' '}
              — use Edit Trial on the trial detail page to make changes to them.
            </div>
          )}

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
                <h4 className="text-xl font-semibold text-foreground mb-2">Schedule Your Trials</h4>
                <p className="text-sm text-muted-foreground max-w-sm mx-auto mb-6">
                  Trials are individual competition events within your show. Add your first trial to
                  get started.
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
                <div
                  key={trial.id}
                  className="border border-border rounded-xl p-5 space-y-4 bg-card/50 hover:bg-card/80 transition-colors duration-200 shadow-sm"
                >
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

                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label>
                        Trial Name <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        value={trial.name}
                        onChange={e => updateTrial(trial.id, { name: e.target.value })}
                        placeholder="e.g., Trial 1, Novice Trial"
                        className="h-10"
                      />
                      {errors[`trial-${index}-name`] && (
                        <p className="text-sm text-destructive">{errors[`trial-${index}-name`]}</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label>Trial Type</Label>
                      <Select
                        value={trial.trialType ?? ''}
                        onValueChange={value => updateTrial(trial.id, { trialType: value })}
                      >
                        <SelectTrigger className="h-10">
                          <SelectValue placeholder="Select discipline" />
                        </SelectTrigger>
                        <SelectContent>
                          {trialTypeOptions.map(type => (
                            <SelectItem key={type} value={type}>
                              {type}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
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
                              <p>
                                A unique identifier for this trial, often assigned by the
                                sanctioning organization (e.g., "2024-001" for AKC events).
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </Label>
                      <Input
                        value={trial.eventNumber}
                        onChange={e => updateTrial(trial.id, { eventNumber: e.target.value })}
                        placeholder="e.g., 1, 2024-001"
                        className="h-10"
                      />
                      {errors[`trial-${index}-eventNumber`] && (
                        <p className="text-sm text-destructive">
                          {errors[`trial-${index}-eventNumber`]}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>
                      Trial Date & Time <span className="text-destructive">*</span>
                    </Label>
                    <DateTimePicker
                      value={safeParseDateString(trial.dateTime)}
                      onChange={date => handleTrialDateTimeChange(trial.id, date)}
                      placeholder="Pick trial date and time"
                      className="h-10"
                      minDate={safeParseDateString(show.startDate) || new Date()}
                      maxDate={safeParseDateString(show.endDate)}
                      showTime={true}
                      timeFormat="12h"
                    />
                    {errors[`trial-${index}-dateTime`] && (
                      <p className="text-sm text-destructive">
                        {errors[`trial-${index}-dateTime`]}
                      </p>
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
