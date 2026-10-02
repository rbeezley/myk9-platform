/**
 * Validation logic for the Show Creation Wizard
 */
import type { EditMode } from './show-creation-wizard-types';
import { toLocalDateOnly } from '@/utils/date-format';
import type { WizardTrialView } from '@/utils/wizardTrialNames';
import {
  InvalidWizardClassConfigurationError,
  normalizeWizardClassSelections,
  type PersistedClassIdentity,
} from './classConfigurationValidation';
import { juniorHandlerFeeError } from './wizardJuniorHandlerFee';

interface ShowData {
  name: string;
  organization: string;
  startDate: string;
  endDate: string;
  location: string;
  clubId: string;
  entryOpenDate: string;
  entryCloseDate: string;
  juniorHandlerFee?: number | undefined;
  officials: {
    secretary: string[];
    chairman: string[];
    steward: string[];
  };
}

interface Trial {
  id: string;
  nameOverride?: string | undefined;
  dateTime: string;
  eventNumber: string;
  trialType?: string | undefined;
  classes: Array<{
    templateId: string;
    customizations: Record<string, unknown>;
    judgeId?: string | undefined;
  }>;
}

/**
 * What a wizard run must satisfy. `full` is show creation / add-trials: every requirement.
 * `class-selection` is add-classes on an EXISTING show with a FIXED trial set: only the class
 * rules apply. Basics, officials, venue, entry window, map pin and trials belong to the show
 * (already saved, unreachable here), so none of them may block adding classes.
 * Every wizard validation surface takes its scope from `getValidationScope`.
 */
export type ValidationScope = 'full' | 'class-selection';

export function getValidationScope(editMode: Pick<EditMode, 'mode'> | undefined): ValidationScope {
  return editMode?.mode === 'add-classes' ? 'class-selection' : 'full';
}

/**
 * The blocking list Review shows and Create/Save gates on. Same choke point as the step
 * validators: in `class-selection` scope only "something to save" can block.
 */
export function getReviewBlockingErrors(input: {
  show: ShowData;
  trials: readonly { classes: readonly unknown[] }[];
  /** True when the show's officials could not be READ; unknown is not absent. */
  officialsUnknown: boolean;
  scope: ValidationScope;
}): string[] {
  const { show, trials, officialsUnknown, scope } = input;
  const result: string[] = [];
  const totalClasses = trials.reduce((sum, trial) => sum + trial.classes.length, 0);

  if (scope === 'full') {
    if (!show.name.trim()) result.push('Show name is required');
    if (!show.startDate || !show.endDate) result.push('Show dates are required');
    if (!show.location?.trim()) result.push('Location is required');
    if (!show.clubId) result.push('Club selection is required');
    if (!officialsUnknown) {
      if (show.officials.chairman.length === 0) result.push('Please select a chair');
      if (show.officials.secretary.length === 0) result.push('Please select a secretary');
    }
    if (trials.length === 0) result.push('At least one trial is required');
  }
  if (totalClasses === 0) result.push('At least one class must be configured');

  return result;
}

export interface ShowDetailsValidationOptions {
  /**
   * MYK9-716: a draft may have no entry window; publishing requires one (the
   * status pill and enforce_show_publish_gate refuse a windowless publish, and
   * Review names the gap). Set when the wizard is editing a show that is
   * already live, so adding trials or classes can never clear its window.
   */
  requireEntryWindow?: boolean;
}

/**
 * Get validation messages for the Show Details step (step 0)
 */
export function getShowDetailsValidationMessages(
  show: ShowData,
  { requireEntryWindow = false }: ShowDetailsValidationOptions = {}
): string[] {
  const messages: string[] = [];

  if (!show.name?.trim()) messages.push('Show name is required');
  if (!show.organization) messages.push('Organization is required');
  if (!show.startDate) messages.push('Start date is required');
  if (!show.endDate) messages.push('End date is required');
  if (!show.location?.trim()) messages.push('Location is required');
  if (!show.clubId) messages.push('Club selection is required');
  if (show.officials.chairman.length === 0) messages.push('Please select a chair');
  if (show.officials.secretary.length === 0) messages.push('Please select a secretary');
  // Mirrors the column CHECK so the secretary sees the problem here, not as a raw database
  // error on the final save. ASCA hides the field, so its stale value is never checked.
  const juniorFeeError = juniorHandlerFeeError(show);
  if (juniorFeeError) messages.push(juniorFeeError);
  if (requireEntryWindow) {
    if (!show.entryOpenDate) messages.push('Entry open date is required');
    if (!show.entryCloseDate) messages.push('Entry close date is required');
  }

  // Normalize to YYYY-MM-DD so lexicographic comparison is date-only safe
  // regardless of whether the picker stores dates or ISO datetimes.
  //
  // F6: this used to slice the first 10 chars off the ISO string, which is the UTC
  // date. DateRangePicker defaults the entry close to 11:59 PM LOCAL and emits
  // toISOString(), so west of UTC that lands on the next calendar day
  // ("Aug 29 11:59 PM CDT" -> "2026-08-30T04:59:00Z"). Compared against a show
  // starting 8:00 AM the same day, close > start and a day-of-entry show could never
  // be saved. toLocalDateOnly resolves the calendar date the user actually picked.
  const start = toDatePart(show.startDate);
  const end = toDatePart(show.endDate);
  const open = toDatePart(show.entryOpenDate);
  const close = toDatePart(show.entryCloseDate);

  if (start && end && start > end) messages.push('End date must be on or after start date');
  if (open && close && open > close)
    messages.push('Entry close date must be on or after entry open date');
  if (close && start && close > start)
    messages.push('Entry close date must be on or before the show start date');

  return messages;
}

function toDatePart(value: string | undefined | null): string {
  return value ? toLocalDateOnly(value) : '';
}

/**
 * Get validation messages for the Trial Configuration step (step 1)
 */
export function getTrialValidationMessages(
  trials: Trial[],
  trialView: WizardTrialView,
  organization?: string
): string[] {
  const messages: string[] = [];
  const requiresEventNumber = organization === 'AKC';
  if (trials.length === 0) {
    messages.push('At least one trial is required');
  } else {
    trials.forEach((trial, index) => {
      const trialName = trialView.effectiveNamesByTrialId.get(trial.id) ?? `Trial ${index + 1}`;
      if (!trialView.effectiveNamesByTrialId.get(trial.id)?.trim())
        messages.push(`${trialName} name is required`);
      if (!trial.trialType) messages.push(`${trialName} type is required`);
      if (!trial.dateTime) messages.push(`${trialName} date and time is required`);
      if (requiresEventNumber && !trial.eventNumber?.trim())
        messages.push(`${trialName} event number is required for AKC events`);
    });
  }

  return messages;
}

/**
 * Get validation messages for the Class Selection step (step 2)
 */
export function getClassValidationMessages(
  trials: Trial[],
  trialView: WizardTrialView,
  organization: string,
  persistedClasses: readonly PersistedClassIdentity[] = [],
  /**
   * `class-selection` scope (add-classes): the trial set is fixed to the show's existing
   * trials, so a trial she did not touch (e.g. one whose last class was deleted) must not
   * block Next. Only the "something to save" and registry checks apply.
   */
  scope: ValidationScope = 'full'
): string[] {
  const messages: string[] = [];

  const totalClasses = trials.reduce((sum, trial) => sum + trial.classes.length, 0);
  if (totalClasses === 0) {
    messages.push('At least one class must be added to the trials');
  } else if (scope === 'full') {
    // Ensure every trial has at least one class
    trials.forEach(trial => {
      if (trial.classes.length === 0) {
        messages.push(
          `${trialView.effectiveNamesByTrialId.get(trial.id) || 'A trial'} needs at least one class`
        );
      }
    });
  }

  if (totalClasses > 0) {
    try {
      normalizeWizardClassSelections(organization, trials, persistedClasses);
    } catch (error) {
      if (!(error instanceof InvalidWizardClassConfigurationError)) throw error;
      messages.push(error.message);
    }
  }

  return messages;
}

/**
 * Get all validation messages for a given step
 */
export function getValidationMessagesForStep(
  step: number,
  show: ShowData,
  trials: Trial[],
  trialView: WizardTrialView,
  /** Add-classes mode: the show's stored classes, retained rather than re-validated. */
  persistedClasses: readonly PersistedClassIdentity[] = [],
  showDetailsOptions: ShowDetailsValidationOptions = {},
  scope: ValidationScope = 'full'
): string[] {
  // The single choke point for add-classes: show-creation steps (Basics, Trials) and Review
  // are out of scope, so only the class step evaluates anything.
  if (scope === 'class-selection' && step !== 2) return [];
  switch (step) {
    case 0:
      return getShowDetailsValidationMessages(show, showDetailsOptions);
    case 1:
      return getTrialValidationMessages(trials, trialView, show.organization);
    case 2:
      return getClassValidationMessages(
        trials,
        trialView,
        show.organization,
        persistedClasses,
        scope
      );
    case 3:
      // Review step shows its own validation
      return [];
    default:
      return [];
  }
}
