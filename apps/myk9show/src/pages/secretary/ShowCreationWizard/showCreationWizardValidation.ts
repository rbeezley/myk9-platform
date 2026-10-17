import { trialStartTimeIssues, trialStartTimeMessage } from '@/components/trials/trialDateTime';
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
import { SHOW_FIELD, trialClassesFieldId, trialFieldId } from './wizardFieldIds';

/**
 * One thing blocking a step. `field` is the id of the control it belongs to, so it can be
 * shown beside that control; `null` marks an issue that belongs to no single field (it is
 * the only kind the top banner lists).
 */
export interface WizardIssue {
  field: string | null;
  message: string;
}

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
  trialDate: string;
  eventNumber: string;
  trialType?: string | undefined;
  classes: Array<{
    templateId: string;
    customizations: Record<string, unknown>;
    judgeId?: string | undefined;
  }>;
  /** The start-time box as typed (see wizardStore). */
  startTimeDraft?: string | undefined;
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
  trials: readonly {
    id?: string;
    trialDate?: string;
    startTimeDraft?: string | undefined;
    classes: readonly unknown[];
  }[];
  /** Names a trial in its messages. */
  trialNameOf?: (trialId: string) => string;
  /** True when the show's officials could not be READ; unknown is not absent. */
  officialsUnknown: boolean;
  scope: ValidationScope;
}): string[] {
  const { show, trials, officialsUnknown, scope, trialNameOf } = input;
  const result: string[] = [];
  const totalClasses = trials.reduce((sum, trial) => sum + trial.classes.length, 0);

  if (scope === 'full') {
    if (!show.name.trim()) result.push('Please enter a show name');
    if (!show.startDate || !show.endDate) result.push('Please select the show dates');
    if (!show.location?.trim()) result.push('Please enter a location');
    if (!show.clubId) result.push('Please select a hosting club');
    if (!officialsUnknown) {
      if (show.officials.chairman.length === 0) result.push('Please select a chair');
      if (show.officials.secretary.length === 0) result.push('Please select a secretary');
    }
    if (trials.length === 0) result.push('Please add at least one trial');
    // The typed start time is what is validated: a cleared or invalid box blocks Review too.
    trials.forEach((trial, index) => {
      const name = (trial.id ? trialNameOf?.(trial.id) : undefined) || `Trial ${index + 1}`;
      if (!trial.trialDate) result.push(`Please select a date for ${name}`);
      const issue = trialStartTimeIssues(trial);
      if (issue) result.push(trialStartTimeMessage(issue, name));
    });
  }
  if (totalClasses === 0) result.push('Please add at least one class');

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
 * Get validation issues for the Show Details step (step 0)
 */
export function getShowDetailsValidationIssues(
  show: ShowData,
  { requireEntryWindow = false }: ShowDetailsValidationOptions = {}
): WizardIssue[] {
  const issues: WizardIssue[] = [];
  const add = (field: string | null, message: string) => issues.push({ field, message });

  if (!show.name?.trim()) add(SHOW_FIELD.name, 'Please enter a show name');
  if (!show.organization) add(SHOW_FIELD.organization, 'Please select an organization');
  if (!show.startDate) add(SHOW_FIELD.dates, 'Please select a start date');
  if (!show.endDate) add(SHOW_FIELD.dates, 'Please select an end date');
  if (!show.location?.trim()) add(SHOW_FIELD.location, 'Please enter a location');
  if (!show.clubId) add(SHOW_FIELD.hostClub, 'Please select a hosting club');
  if (show.officials.chairman.length === 0) add(SHOW_FIELD.chair, 'Please select a chair');
  if (show.officials.secretary.length === 0) add(SHOW_FIELD.secretary, 'Please select a secretary');
  // Mirrors the column CHECK so the secretary sees the problem here, not as a raw database
  // error on the final save. ASCA hides the field, so its stale value is never checked.
  const juniorFeeError = juniorHandlerFeeError(show);
  if (juniorFeeError) add(SHOW_FIELD.juniorHandlerFee, juniorFeeError);
  if (requireEntryWindow) {
    if (!show.entryOpenDate) add(SHOW_FIELD.entryPeriod, 'Please select an entry open date');
    if (!show.entryCloseDate) add(SHOW_FIELD.entryPeriod, 'Please select an entry close date');
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

  if (start && end && start > end) add(SHOW_FIELD.dates, 'End date must be on or after start date');
  if (open && close && open > close)
    add(SHOW_FIELD.entryPeriod, 'Entry close date must be on or after entry open date');
  if (close && start && close > start)
    add(SHOW_FIELD.entryPeriod, 'Entry close date must be on or before the show start date');

  return issues;
}

/**
 * Get validation messages for the Show Details step (step 0)
 */
export function getShowDetailsValidationMessages(
  show: ShowData,
  options: ShowDetailsValidationOptions = {}
): string[] {
  return getShowDetailsValidationIssues(show, options).map(issue => issue.message);
}

function toDatePart(value: string | undefined | null): string {
  return value ? toLocalDateOnly(value) : '';
}

/**
 * Get validation issues for the Trial Configuration step (step 1)
 */
export function getTrialValidationIssues(
  trials: Trial[],
  trialView: WizardTrialView,
  organization?: string
): WizardIssue[] {
  const issues: WizardIssue[] = [];
  const requiresEventNumber = organization === 'AKC';
  if (trials.length === 0) {
    issues.push({ field: null, message: 'Please add at least one trial' });
  } else {
    trials.forEach((trial, index) => {
      const trialName = trialView.effectiveNamesByTrialId.get(trial.id) ?? `Trial ${index + 1}`;
      const add = (field: Parameters<typeof trialFieldId>[1], message: string) =>
        issues.push({ field: trialFieldId(trial.id, field), message });
      if (!trialView.effectiveNamesByTrialId.get(trial.id)?.trim())
        add('name', `Please enter a name for ${trialName}`);
      if (!trial.trialType) add('trialType', `Please select a type for ${trialName}`);
      if (!trial.trialDate) add('dateTime', `Please select a date for ${trialName}`);
      const startTimeIssue = trialStartTimeIssues(trial);
      if (startTimeIssue) add('startTime', trialStartTimeMessage(startTimeIssue, trialName));
      if (requiresEventNumber && !trial.eventNumber?.trim())
        add(
          'eventNumber',
          `Please enter an event number for ${trialName} (required for AKC events)`
        );
    });
  }

  return issues;
}

/**
 * Get validation messages for the Trial Configuration step (step 1)
 */
export function getTrialValidationMessages(
  trials: Trial[],
  trialView: WizardTrialView,
  organization?: string
): string[] {
  return getTrialValidationIssues(trials, trialView, organization).map(issue => issue.message);
}

/**
 * Get validation issues for the Class Selection step (step 2). A trial's missing classes
 * belong to that trial's tab; "pick something to save" and registry-rule errors belong to
 * no single field.
 */
export function getClassValidationIssues(
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
): WizardIssue[] {
  const issues: WizardIssue[] = [];

  const totalClasses = trials.reduce((sum, trial) => sum + trial.classes.length, 0);
  if (totalClasses === 0) {
    // With trials to fill (full scope) the gap sits on the first trial's tab; otherwise it is
    // a whole-show rule with no field.
    const first = scope === 'full' ? trials[0] : undefined;
    issues.push({
      field: first ? trialClassesFieldId(first.id) : null,
      message: 'Please add at least one class to the trials',
    });
  } else if (scope === 'full') {
    // Ensure every trial has at least one class
    trials.forEach(trial => {
      if (trial.classes.length === 0) {
        issues.push({
          field: trialClassesFieldId(trial.id),
          message: `${trialView.effectiveNamesByTrialId.get(trial.id) || 'A trial'} needs at least one class`,
        });
      }
    });
  }

  if (totalClasses > 0) {
    try {
      normalizeWizardClassSelections(organization, trials, persistedClasses);
    } catch (error) {
      if (!(error instanceof InvalidWizardClassConfigurationError)) throw error;
      issues.push({ field: null, message: error.message });
    }
  }

  return issues;
}

/**
 * Get validation messages for the Class Selection step (step 2)
 */
export function getClassValidationMessages(
  ...args: Parameters<typeof getClassValidationIssues>
): string[] {
  return getClassValidationIssues(...args).map(issue => issue.message);
}

/**
 * Get all validation issues for a given step
 */
export function getValidationIssuesForStep(
  step: number,
  show: ShowData,
  trials: Trial[],
  trialView: WizardTrialView,
  /** Add-classes mode: the show's stored classes, retained rather than re-validated. */
  persistedClasses: readonly PersistedClassIdentity[] = [],
  showDetailsOptions: ShowDetailsValidationOptions = {},
  scope: ValidationScope = 'full'
): WizardIssue[] {
  // The single choke point for add-classes: show-creation steps (Basics, Trials) and Review
  // are out of scope, so only the class step evaluates anything.
  if (scope === 'class-selection' && step !== 2) return [];
  switch (step) {
    case 0:
      return getShowDetailsValidationIssues(show, showDetailsOptions);
    case 1:
      return getTrialValidationIssues(trials, trialView, show.organization);
    case 2:
      return getClassValidationIssues(
        trials,
        trialView,
        show.organization,
        persistedClasses,
        scope
      );
    default:
      // Review (step 3) shows its own validation
      return [];
  }
}

/**
 * Get all validation messages for a given step
 */
export function getValidationMessagesForStep(
  ...args: Parameters<typeof getValidationIssuesForStep>
): string[] {
  return getValidationIssuesForStep(...args).map(issue => issue.message);
}

/**
 * The errors to show beside their fields: field id to message, every message for a field on
 * its own line. Issues with no field have no place beside a control.
 */
export function fieldErrorsFromIssues(issues: readonly WizardIssue[]): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const { field, message } of issues) {
    if (field === null) continue;
    errors[field] = field in errors ? `${errors[field]}\n${message}` : message;
  }
  return errors;
}

/**
 * What the top banner must list: issues with no field, and issues whose field has no callout
 * on screen (its control is hidden or not mounted), so nothing blocking is ever silent.
 */
export function bannerIssues(
  issues: readonly WizardIssue[],
  registeredFields: readonly string[]
): WizardIssue[] {
  return issues.filter(issue => issue.field === null || !registeredFields.includes(issue.field));
}
