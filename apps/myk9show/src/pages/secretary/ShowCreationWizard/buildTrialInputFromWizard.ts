/**
 * Builds the `TrialInput` for one wizard trial — the offline-first write path
 * used by both new-show creation (offline) and "add trials to an existing
 * show" (edit mode). Extracted from `useShowCreationWizardActions.createTrials`
 * so `timezone`/`registryId` threading (MYK9-831) has a unit under test that
 * doesn't require rendering the whole wizard hook.
 */

import { format } from 'date-fns';
import type { TrialInput } from '@/store/trialStore';
import type { WizardTrialView } from '@/utils/wizardTrialNames';

interface WizardTrialLike {
  id: string;
  dateTime: string;
  eventNumber: string;
  trialType?: string | undefined;
}

export interface BuildTrialInputParams {
  wizardTrial: WizardTrialLike;
  index: number;
  showId: string;
  showName: string;
  showOrganization: string;
  /** IANA zone selected in the wizard's Basics step (MYK9-831). */
  timezone: string;
  registryId: string;
  trialView: WizardTrialView;
}

export function buildTrialInputFromWizard({
  wizardTrial,
  index,
  showId,
  showName,
  showOrganization,
  timezone,
  registryId,
  trialView,
}: BuildTrialInputParams): TrialInput {
  const trialName = trialView.effectiveNamesByTrialId.get(wizardTrial.id) ?? `Trial ${index + 1}`;

  return {
    showId,
    showName,
    name: trialName,
    registryId,
    timezone,
    trialDate: wizardTrial.dateTime ? format(new Date(wizardTrial.dateTime), 'yyyy-MM-dd') : '',
    trialNumber: trialName,
    status: 'Upcoming',
    eventNumber: wizardTrial.eventNumber || '',
    type: trialName,
    trialType: wizardTrial.trialType || showOrganization,
    plannedStartTime: wizardTrial.dateTime
      ? format(new Date(wizardTrial.dateTime), 'h:mm a')
      : '09:00 AM',
    order: String(index + 1),
  };
}
