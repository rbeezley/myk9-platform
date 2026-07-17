import { normalizeSecretaryDashboardClassStatus } from './SecretaryClassDashboard.status';

describe('normalizeSecretaryDashboardClassStatus', () => {
  it.each([
    ['Scheduled', 'pending'],
    ['Upcoming', 'pending'],
    ['In Progress', 'in-progress'],
    ['Completed', 'completed'],
    ['Cancelled', 'cancelled'],
  ] as const)('maps %s to %s', (stored, expected) => {
    expect(normalizeSecretaryDashboardClassStatus(stored)).toBe(expected);
  });
});
