import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { UKCPremiumTemplate } from '../UKCPremiumTemplate';
import type { GeneratedPremium } from '../../../../types/premium-types';

vi.mock('@react-pdf/renderer', () => ({
  Document: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="pdf-document">{children}</div>
  ),
  Page: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="pdf-page">{children}</div>
  ),
  View: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Text: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  Image: () => null,
  StyleSheet: { create: (s: unknown) => s },
  Font: { register: vi.fn() },
}));

const premium: GeneratedPremium = {
  org: 'UKC',
  style: 'modern',
  templateId: null,
  show: {
    name: 'Fall Scent Trial',
    startDate: '2026-09-15',
    endDate: '2026-09-15',
    venue: '200 Park Ave, Tulsa, OK 74102',
    entryOpenDate: '2026-07-01',
    entryCloseDate: '2026-08-30',
    preEntryFee: 18,
    dayOfFee: 22,
    acceptChecks: true,
    acceptCash: true,
  },
  club: { name: 'UKC Test Club', logoUrl: null },
  secretary: {
    name: 'Mary Secretary',
    email: 'mary@test.com',
    phone: '918-555-1234',
    mailingAddress: '789 Elm St',
  },
  officials: { chairman: 'Tom Chairman', steward: null },
  trials: [
    {
      name: 'Fall Trial 1',
      date: '2026-09-15',
      startTime: '8:00 AM',
      eventNumber: 'UKC-2026-101',
      type: 'Scent Work',
      judges: [{ name: 'Carol Judge', elements: ['Container', 'Interior'] }],
      classes: [{ element: 'Container', level: 'Novice', section: null }],
    },
  ],
  supplemental: {
    vetClinic: { name: 'City Animal Hospital', address: '500 Vet Lane', phone: '918-777-0000' },
    accommodations: [],
    hospitalityNotes: null,
    awardsDescription: 'Placements 1st–4th.',
    additionalNotes: null,
  },
  narratives: {
    showHours: 'Gates open at 7:30 AM.',
    trialInformation: 'UKC registration required.',
  },
};

describe('UKCPremiumTemplate', () => {
  it('renders the club name', () => {
    render(<UKCPremiumTemplate premium={premium} />);
    expect(screen.getAllByText('UKC Test Club').length).toBeGreaterThan(0);
  });

  it('renders the pre-entry fee', () => {
    render(<UKCPremiumTemplate premium={premium} />);
    expect(screen.getByText(/\$18/)).toBeTruthy();
  });

  it('renders vet clinic when present', () => {
    render(<UKCPremiumTemplate premium={premium} />);
    expect(screen.getByText(/City Animal Hospital/)).toBeTruthy();
  });

  it('renders REQUIRED placeholder when vet clinic is null', () => {
    const p = { ...premium, supplemental: { ...premium.supplemental, vetClinic: null } };
    render(<UKCPremiumTemplate premium={p} />);
    expect(screen.getAllByText(/REQUIRED/).length).toBeGreaterThan(0);
  });
});
