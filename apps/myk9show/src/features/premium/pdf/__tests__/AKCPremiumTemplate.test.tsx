import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AKCPremiumTemplate } from '../AKCPremiumTemplate';
import type { GeneratedPremium } from '../../../../types/premium-types';

const premium: GeneratedPremium = {
  org: 'AKC',
  style: 'monogram',
  templateId: null,
  show: {
    name: 'Spring Scent Trial',
    startDate: '2026-06-01',
    endDate: '2026-06-02',
    venue: '123 Main St, Tulsa, OK 74101',
    entryOpenDate: '2026-04-01',
    entryCloseDate: '2026-05-15',
    preEntryFee: 20,
    dayOfFee: 25,
    acceptChecks: true,
    acceptCash: false,
  },
  club: { name: 'Test Club', logoUrl: null },
  secretary: {
    name: 'Jane Smith',
    email: 'jane@test.com',
    phone: null,
    mailingAddress: '456 Oak Ave',
  },
  officials: { chairman: 'Bob Jones', steward: null },
  trials: [
    {
      name: 'Saturday Trial 1',
      date: '2026-06-01',
      startTime: '9:00 AM',
      eventNumber: 'AKC-2026-001',
      type: 'Scent Work',
      judges: [{ name: 'Alice Judge', elements: [] }],
      classes: [{ element: 'Container', level: 'Novice', section: 'A' }],
    },
  ],
  supplemental: {
    vetClinic: { name: 'Animal ER', address: '789 Vet Blvd', phone: '918-999-0000' },
    accommodations: [{ name: 'La Quinta', address: '100 Hotel Rd', phone: '918-111-2222' }],
    coverImageUrl: null,
    hospitalityNotes: 'Lunch on Saturday.',
    awardsDescription: 'Ribbons 1st–4th.',
    additionalNotes: null,
  },
  narratives: {
    showHours: 'Building opens at 8:00 AM.',
    trialInformation: 'Novice title required for Advanced.',
  },
};

describe('AKCPremiumTemplate', () => {
  it('renders the club name', () => {
    render(<AKCPremiumTemplate premium={premium} />);
    expect(screen.getAllByText('Test Club').length).toBeGreaterThan(0);
  });

  it('renders the show name', () => {
    render(<AKCPremiumTemplate premium={premium} />);
    expect(screen.getAllByText('Spring Scent Trial').length).toBeGreaterThan(0);
  });

  it('renders the pre-entry fee', () => {
    render(<AKCPremiumTemplate premium={premium} />);
    expect(screen.getByText(/\$20/)).toBeTruthy();
  });

  it('renders the judge name', () => {
    render(<AKCPremiumTemplate premium={premium} />);
    expect(screen.getByText(/Alice Judge/)).toBeTruthy();
  });

  it('renders vet clinic when present', () => {
    render(<AKCPremiumTemplate premium={premium} />);
    expect(screen.getByText(/Animal ER/)).toBeTruthy();
  });

  it('renders REQUIRED placeholder when vet clinic is null', () => {
    const p = { ...premium, supplemental: { ...premium.supplemental, vetClinic: null } };
    render(<AKCPremiumTemplate premium={p} />);
    expect(screen.getByText(/REQUIRED/)).toBeTruthy();
  });

  it('renders show hours narrative', () => {
    render(<AKCPremiumTemplate premium={premium} />);
    expect(screen.getByText(/Building opens at 8:00 AM/)).toBeTruthy();
  });
});
