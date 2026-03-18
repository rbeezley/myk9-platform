/**
 * Data transformation utilities for the Show Creation Wizard
 */

import type { Show } from '@/types/show-types';
import type { ShowInput } from '@/store/showStore';
import type { ClassData } from '@/components/classes/types/classTypes';
import type { JudgeDetailsMap, ShowStatus, EditMode } from './show-creation-wizard-types';

interface WizardShowData {
  name: string;
  organization: string;
  startDate: string;
  endDate: string;
  location: string;
  clubId: string;
  entryOpenDate: string;
  entryCloseDate: string;
  preEntryFee: number;
  dayOfShowFee: number;
  chairman: string;
  secretary: string;
  judgeIds: string[];
}

export interface WizardTrial {
  id: string;
  name: string;
  dateTime: string;
  eventNumber: string;
  classes: Array<{
    templateId: string;
    customizations: Record<string, unknown>;
    judgeId?: string | undefined;
  }>;
}

interface Club {
  id: string;
  name: string;
  email?: string;
  address: {
    street?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    country?: string;
  };
}

interface ExistingTrial {
  id: string;
  showId: string;
}

/**
 * Build a mapping from wizard trial IDs to actual database trial IDs
 */
export function buildTrialIdMapping(
  wizardTrials: WizardTrial[],
  showId: string,
  existingTrials: ExistingTrial[],
  editMode?: EditMode
): Record<string, string> {
  const trialIdMap: Record<string, string> = {};
  const baseId = Math.max(0, ...existingTrials.map(t => parseInt(t.id))) + 1;

  if (editMode) {
    // In edit mode, existing trials keep their IDs, only new trials get mapped
    const existingTrialIds = existingTrials.filter(t => t.showId === showId).map(t => t.id);

    let newTrialIndex = 0;
    wizardTrials.forEach(wizardTrial => {
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
}

/**
 * Create ClassData objects for trials from wizard data
 */
export function createClassDataFromWizard(
  wizardTrials: WizardTrial[],
  trialIdMap: Record<string, string>,
  judgeDetails: JudgeDetailsMap,
  showId: string,
  existingTrials: ExistingTrial[],
  editMode?: EditMode
): ClassData[] {
  const classes: ClassData[] = [];

  // In add-classes mode, process ALL trials (we're adding classes to existing trials).
  // In other edit modes, only create classes for NEW trials.
  const trialsToProcess =
    editMode && editMode.mode !== 'add-classes'
      ? (() => {
          const existingTrialIds = existingTrials.filter(t => t.showId === showId).map(t => t.id);
          return wizardTrials.filter(wizardTrial => !existingTrialIds.includes(wizardTrial.id));
        })()
      : wizardTrials;

  trialsToProcess.forEach(wizardTrial => {
    const trialId = trialIdMap[wizardTrial.id];

    if (trialId && wizardTrial.classes.length > 0) {
      wizardTrial.classes.forEach((cls, index) => {
        const className = (cls.customizations?.className as string) || `Class ${index + 1}`;
        const element = (cls.customizations?.element as string) || 'Unknown';
        const level = (cls.customizations?.level as string) || 'Unknown';

        // Generate a proper UUID for the class
        const classId = crypto.randomUUID();

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
          section: (cls.customizations?.section as string) || '',
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
          templateId: cls.templateId,
        };

        classes.push(classData);
      });
    }
  });

  return classes;
}

/**
 * Convert a Show object to ShowInput format
 */
export function showToShowInput(show: Show): ShowInput {
  return {
    name: show.name,
    organization: show.organization,
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
    trials: show.trials,
  };
}

/**
 * Transform wizard data to a Show object
 */
export function transformWizardDataToShow(
  show: WizardShowData,
  trials: WizardTrial[],
  judgeDetails: JudgeDetailsMap,
  clubs: Club[],
  status: ShowStatus,
  editMode?: EditMode
): Show {
  // Use existing ID in edit mode, or generate new ID for new shows
  const showId = editMode
    ? editMode.showId
    : (() => {
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
  const showTrials = trials.map((trial, index) => ({
    id: trial.id,
    name: trial.name,
    date: trial.dateTime,
    trialNumber: `${index + 1}`,
    status: 'Upcoming',
  }));

  return {
    id: showId,
    name: show.name,
    organization: show.organization,
    startDate: show.startDate,
    endDate: show.endDate,
    location: show.location,
    status: status,
    events: [],
    source: 'myK9Show' as const,
    entryOpenDate: show.entryOpenDate,
    entryCloseDate: show.entryCloseDate,
    preEntryFee: show.preEntryFee.toString(),
    dayOfShowFee: show.dayOfShowFee.toString(),
    clubId: show.clubId,
    clubName: selectedClub?.name || 'Unknown Club',
    clubAddress: selectedClub
      ? [
          selectedClub.address.street,
          selectedClub.address.city,
          selectedClub.address.state,
          selectedClub.address.zipCode,
          selectedClub.address.country,
        ]
          .filter(Boolean)
          .join(', ')
      : '',
    clubEmail: selectedClub?.email || '',
    logoUrl: '',
    coverImageUrl: '',
    accentColor: '',
    chairman: show.chairman,
    secretary: show.secretary,
    chiefSteward: '',
    assignedJudges,
    stats: [],
    trials: showTrials,
  };
}
