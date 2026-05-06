import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AtAGlancePanel } from '../AtAGlancePanel';
import { resolveTokens } from '../pdfStyles';
import type { GeneratedPremium } from '../../../../types/premium-types';

vi.mock('@react-pdf/renderer', () => ({
  View: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Text: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  StyleSheet: { create: (s: unknown) => s },
  Font: { register: vi.fn() },
}));

const fullData: GeneratedPremium = {
  org: 'AKC',
  style: 'magazine',
  templateId: null,
  show: {
    name: 'Spring Trial',
    startDate: '2026-06-01',
    endDate: '2026-06-02',
    venue: 'Tulsa, OK',
    entryOpenDate: '2026-04-01',
    entryCloseDate: '2026-05-15',
    preEntryFee: 20,
    dayOfFee: 25,
    acceptChecks: true,
    acceptCash: false,
  },
  club: { name: 'Test Club', logoUrl: null },
  secretary: { name: 'Jane', email: null, phone: null, mailingAddress: null },
  officials: { chairman: null, steward: null },
  trials: [
    {
      name: 'Trial 1',
      date: '2026-06-01',
      startTime: null,
      eventNumber: null,
      type: 'Scent Work',
      judges: [{ name: 'Alice', elements: [] }],
      classes: [
        { element: 'Container', level: 'Novice', section: null },
        { element: 'Interior', level: 'Advanced', section: null },
      ],
    },
    {
      name: 'Trial 2',
      date: '2026-06-02',
      startTime: null,
      eventNumber: null,
      type: 'Scent Work',
      judges: [{ name: 'Bob', elements: [] }],
      classes: [{ element: 'Buried', level: 'Master', section: null }],
    },
  ],
  supplemental: {
    vetClinic: null,
    accommodations: [],
    hospitalityNotes: null,
    awardsDescription: null,
    additionalNotes: null,
  },
  narratives: { showHours: '', trialInformation: '' },
};

const tokens = resolveTokens('magazine');

describe('AtAGlancePanel', () => {
  it('renders all five info rows when data is full', () => {
    render(<AtAGlancePanel data={fullData} tokens={tokens} />);
    expect(screen.getByText('Trials')).toBeTruthy();
    expect(screen.getByText('Elements')).toBeTruthy();
    expect(screen.getByText('Levels')).toBeTruthy();
    expect(screen.getByText('Sanctioning')).toBeTruthy();
    expect(screen.getByText('Entries Close')).toBeTruthy();
  });

  it('hides the Elements row when no class elements are present', () => {
    const data: GeneratedPremium = {
      ...fullData,
      trials: fullData.trials.map(t => ({ ...t, classes: [] })),
    };
    render(<AtAGlancePanel data={data} tokens={tokens} />);
    expect(screen.queryByText('Elements')).toBeNull();
    expect(screen.queryByText('Levels')).toBeNull();
    expect(screen.getByText('Trials')).toBeTruthy();
  });

  it('hides the Entries Close row when entryCloseDate is null', () => {
    const data: GeneratedPremium = {
      ...fullData,
      show: { ...fullData.show, entryCloseDate: null },
    };
    render(<AtAGlancePanel data={data} tokens={tokens} />);
    expect(screen.queryByText('Entries Close')).toBeNull();
  });

  it('falls back to "Details coming soon" when no substantive rows render', () => {
    // Org alone is never enough to make the panel useful — the fallback fires
    // when trials/elements/levels are all empty, regardless of org.
    const data: GeneratedPremium = {
      ...fullData,
      trials: [],
      show: { ...fullData.show, entryCloseDate: null },
    };
    render(<AtAGlancePanel data={data} tokens={tokens} />);
    expect(screen.getByText(/Details coming soon/)).toBeTruthy();
  });
});
