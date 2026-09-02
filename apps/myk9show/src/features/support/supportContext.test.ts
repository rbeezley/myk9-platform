import { UserRole } from '@/types/auth-types';

import { extractSupportRouteContext, shouldPrioritizeSupportTicket } from './supportContext';

const SHOW_ID = '123e4567-e89b-12d3-a456-426614174000';

describe('support route context', () => {
  it('recognizes the secretary Day-of-Show route as show-day context', () => {
    const context = extractSupportRouteContext(`/secretary/day-of/${SHOW_ID}`);

    expect(context.isShowDayContext).toBe(true);
    expect(context.showId).toBeNull();
    expect(shouldPrioritizeSupportTicket(context, [UserRole.SECRETARY])).toBe(true);
  });
});
