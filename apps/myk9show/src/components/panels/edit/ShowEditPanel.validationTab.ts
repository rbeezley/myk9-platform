import type { ShowEditTab } from '@/components/shows/showEditRoutes';
import type { FieldLocation } from './usePanelValidationNavigation';

/**
 * Which Edit Show tab renders each schema field, and the DOM id to focus, so a
 * failed Save moves to the tab with the error (MYK9-931, H4). Officials has no
 * schema field: it saves on its own.
 */
const FIELD_LOCATION: Record<string, FieldLocation<ShowEditTab>> = {
  name: { tab: 'basic', elementId: 'name' },
  status: { tab: 'basic', elementId: 'status' },
  organization: { tab: 'basic', elementId: 'organization' },
  clubId: { tab: 'basic', elementId: 'clubId' },
  location: { tab: 'basic', elementId: 'location' },
  startDate: { tab: 'basic', elementId: 'show-dates' },
  endDate: { tab: 'basic', elementId: 'show-dates' },
  entryOpenDate: { tab: 'basic', elementId: 'show-entry-period' },
  entryCloseDate: { tab: 'basic', elementId: 'show-entry-period' },
  assignedJudges: { tab: 'judges', elementId: 'judges-tab-heading' },
  preEntryFee: { tab: 'fees', elementId: 'preEntryFee' },
  dayOfShowFee: { tab: 'fees', elementId: 'dayOfShowFee' },
  juniorHandlerFee: { tab: 'fees', elementId: 'juniorHandlerFee' },
  startingArmbandNumber: { tab: 'fees', elementId: 'startingArmbandNumber' },
  maxEntriesPerDog: { tab: 'fees', elementId: 'maxEntriesPerDog' },
  maxTotalEntries: { tab: 'fees', elementId: 'maxTotalEntries' },
  allowNonOwnerHandlers: { tab: 'fees', elementId: 'allowNonOwnerHandlers' },
  isNationals: { tab: 'fees', elementId: 'isNationals' },
  publishExperience: { tab: 'premium', elementId: 'premium-tab-heading' },
  generatedPremium: { tab: 'premium', elementId: 'premium-tab-heading' },
};

export const locateShowField = (field: string): FieldLocation<ShowEditTab> | undefined =>
  FIELD_LOCATION[field];
