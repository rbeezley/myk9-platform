import { describe, expect, it } from 'vitest';
import {
  getWorkbenchAnnouncementPriority,
  WORKBENCH_IN_APP_ANNOUNCEMENT_PRIORITY,
  WORKBENCH_PUSH_ANNOUNCEMENT_PRIORITY,
} from '../workbenchAnnouncementPriority';

describe('workbenchAnnouncementPriority', () => {
  it('keeps regular workbench announcements in-app only', () => {
    expect(WORKBENCH_IN_APP_ANNOUNCEMENT_PRIORITY).toBe('normal');
    expect(getWorkbenchAnnouncementPriority(false)).toBe('normal');
  });

  it('uses high priority for explicit push alerts', () => {
    expect(WORKBENCH_PUSH_ANNOUNCEMENT_PRIORITY).toBe('high');
    expect(getWorkbenchAnnouncementPriority(true)).toBe('high');
  });
});
