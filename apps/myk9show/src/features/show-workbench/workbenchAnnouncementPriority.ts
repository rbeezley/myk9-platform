import type { AnnouncementPriority } from '@/types/announcement-types';

export const WORKBENCH_IN_APP_ANNOUNCEMENT_PRIORITY = 'normal' satisfies AnnouncementPriority;

// INTENT: Workbench push alerts are opt-in and use high, not urgent. Urgent stays reserved
// for emergency announcements created from the full announcement workflow.
export const WORKBENCH_PUSH_ANNOUNCEMENT_PRIORITY = 'high' satisfies AnnouncementPriority;

export function getWorkbenchAnnouncementPriority(sendPushAlert: boolean): AnnouncementPriority {
  return sendPushAlert
    ? WORKBENCH_PUSH_ANNOUNCEMENT_PRIORITY
    : WORKBENCH_IN_APP_ANNOUNCEMENT_PRIORITY;
}
