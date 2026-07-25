import { describe, expect, it } from 'vitest';
import {
  getOnboardingFilterLabel,
  getOnboardingStatusPresentation,
  getPayoutStatusPresentation,
  getRoleRequestFilterLabel,
  getRoleRequestStatusPresentation,
  ONBOARDING_STATUS_FILTERS,
  ROLE_REQUEST_STATUS_FILTERS,
} from './adminStatusPresentation';

describe('adminStatusPresentation', () => {
  it('keeps role-request filter labels in the same order as the page tabs', () => {
    expect(ROLE_REQUEST_STATUS_FILTERS.map(getRoleRequestFilterLabel)).toEqual([
      'All',
      'Pending',
      'Approved',
      'Denied',
    ]);
  });

  it('uses the shared admin tone vocabulary for role request statuses', () => {
    expect(getRoleRequestStatusPresentation('pending')).toMatchObject({
      label: 'Pending',
      className: expect.stringContaining('text-warning'),
    });
    expect(getRoleRequestStatusPresentation('approved')).toMatchObject({
      label: 'Approved',
      className: expect.stringContaining('text-success'),
    });
    expect(getRoleRequestStatusPresentation('denied')).toMatchObject({
      label: 'Denied',
      className: expect.stringContaining('text-destructive'),
    });
  });

  it('keeps onboarding filter labels in the same order as the page tabs', () => {
    expect(ONBOARDING_STATUS_FILTERS.map(getOnboardingFilterLabel)).toEqual([
      'All',
      'Pending',
      'Contacted',
      'Onboarded',
      'Declined',
    ]);
  });

  it('maps onboarding statuses onto the shared admin tone vocabulary', () => {
    expect(getOnboardingStatusPresentation('pending')).toMatchObject({
      label: 'Pending',
      className: expect.stringContaining('text-warning'),
    });
    expect(getOnboardingStatusPresentation('contacted')).toMatchObject({
      label: 'Contacted',
      className: expect.stringContaining('text-info'),
    });
    expect(getOnboardingStatusPresentation('onboarded')).toMatchObject({
      label: 'Onboarded',
      className: expect.stringContaining('text-success'),
    });
    expect(getOnboardingStatusPresentation('declined')).toMatchObject({
      label: 'Declined',
      className: expect.stringContaining('text-destructive'),
    });
  });

  it('uses the same admin tone vocabulary for payout statuses', () => {
    expect(getPayoutStatusPresentation('pending')).toMatchObject({
      label: 'Pending',
      className: expect.stringContaining('text-warning'),
    });
    expect(getPayoutStatusPresentation('processing')).toMatchObject({
      label: 'Processing',
      className: expect.stringContaining('text-info'),
    });
    expect(getPayoutStatusPresentation('completed')).toMatchObject({
      label: 'Paid',
      className: expect.stringContaining('text-success'),
    });
    expect(getPayoutStatusPresentation('failed')).toMatchObject({
      label: 'Failed',
      className: expect.stringContaining('text-destructive'),
    });
  });
});
