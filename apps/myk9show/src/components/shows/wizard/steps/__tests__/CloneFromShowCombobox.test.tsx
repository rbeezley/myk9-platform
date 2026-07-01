import { render, screen, within } from '@/test/utils/testUtils';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Show } from '@/types/show-types';

const mockUpdateShowData = vi.fn();
const mockAddJudgeToShow = vi.fn();
const mockAddTrial = vi.fn();
const mockResetWizard = vi.fn();

const mockShows: Show[] = [
  {
    id: 'show-1',
    name: 'Heartland Spring Trial',
    organization: 'UKC',
    startDate: '2026-05-15',
    endDate: '2026-05-16',
    location: 'Heartland Arena\nTulsa, OK',
    clubId: 'club-1',
    entryOpenDate: '2026-03-01',
    entryCloseDate: '2026-04-30',
    preEntryFee: '28',
    dayOfShowFee: '35',
    startingArmbandNumber: 250,
    acceptCheckPayments: true,
    acceptCashPayments: true,
    status: 'completed',
    assignedJudges: [
      { judgeId: 'judge-1', judgeName: 'Alex Judge', assignedClasses: ['class-1'] },
    ],
    trials: [
      {
        id: 'trial-1',
        name: 'Friday Trial 1',
        date: '2026-05-15',
        trialNumber: 'OLD-123',
        status: 'completed',
        trialType: 'Nosework',
        classes: [
          {
            id: 'class-1',
            name: 'Novice Containers',
            level: 'Novice',
            element: 'Containers',
            entryFee: 28,
          },
        ],
      },
    ],
  } as unknown as Show,
];

let mockShowsQueryState: { data: Show[]; isLoading: boolean; isError: boolean } = {
  data: mockShows,
  isLoading: false,
  isError: false,
};

vi.mock('@/store/wizardStore', () => ({
  useWizardStore: vi.fn(() => ({
    updateShowData: mockUpdateShowData,
    addJudgeToShow: mockAddJudgeToShow,
    addTrial: mockAddTrial,
    resetWizard: mockResetWizard,
  })),
}));

vi.mock('@/hooks/queries/useShowsDatabase', () => ({
  useShowsQuery: vi.fn(() => mockShowsQueryState),
}));

vi.mock('@/store/userStore', () => ({
  useUserStore: vi.fn(() => ({
    people: [
      {
        id: 'judge-1',
        firstName: 'Alex',
        lastName: 'Judge',
        email: 'alex@example.com',
        phone: '555-0101',
        judgeQualifications: [{ organization: 'UKC' }],
      },
    ],
  })),
}));

vi.mock('@/hooks/useUserClubIds', () => ({
  useUserClubIds: vi.fn(() => new Set(['club-1'])),
}));

vi.mock('@/hooks/useTemplates', () => ({
  useTemplates: vi.fn(() => ({
    templates: [
      {
        id: 'tmpl-nosework',
        organization: 'UKC',
        trialType: 'Nosework',
        isActive: true,
        classDefinitions: [
          {
            className: 'Novice Containers',
            element: 'Containers',
            level: 'Novice',
            displayOrder: 1,
          },
        ],
      },
    ],
  })),
}));

import { CloneFromShowCombobox } from '../CloneFromShowCombobox';

async function selectSourceShow() {
  const user = userEvent.setup();
  render(<CloneFromShowCombobox />);

  await user.click(screen.getByRole('button', { name: /select a past show to clone/i }));
  const list =
    screen.getByText('Heartland Spring Trial').closest('[data-radix-popper-content-wrapper]') ??
    document.body;
  await user.click(within(list as HTMLElement).getByText('Heartland Spring Trial'));

  return user;
}

describe('CloneFromShowCombobox', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockShowsQueryState = { data: mockShows, isLoading: false, isError: false };
  });

  it('prefills non-date show fields and leaves all date fields blank', async () => {
    await selectSourceShow();

    expect(mockResetWizard).toHaveBeenCalledTimes(1);
    expect(mockUpdateShowData).toHaveBeenCalledWith({
      name: 'Heartland Spring Trial',
      organization: 'UKC',
      location: 'Heartland Arena\nTulsa, OK',
      clubId: 'club-1',
      preEntryFee: 28,
      dayOfShowFee: 35,
      startingArmbandNumber: 250,
      acceptCheckPayments: true,
      acceptCashPayments: true,
      startDate: '',
      endDate: '',
      entryOpenDate: '',
      entryCloseDate: '',
    });
  });

  it('copies assigned judges when the person record is available', async () => {
    await selectSourceShow();

    expect(mockAddJudgeToShow).toHaveBeenCalledWith('judge-1', {
      name: 'Alex Judge',
      email: 'alex@example.com',
      phone: '555-0101',
      certifications: ['UKC'],
      notes: '',
    });
  });

  it('copies production-shaped trial and class structure while clearing trial date and event number', async () => {
    await selectSourceShow();

    expect(mockAddTrial).toHaveBeenCalledWith({
      name: 'Friday Trial 1',
      dateTime: '',
      eventNumber: '',
      trialType: 'Nosework',
      classes: [
        {
          templateId: 'tmpl-nosework',
          customizations: {
            className: 'Novice Containers',
            element: 'Containers',
            level: 'Novice',
            entryFee: 28,
          },
          judgeId: 'judge-1',
        },
      ],
    });
  });

  it('start fresh clears copied fields and selected judges', async () => {
    const user = await selectSourceShow();
    await user.click(screen.getByRole('button', { name: /start fresh/i }));

    expect(mockResetWizard).toHaveBeenCalledTimes(2);
  });

  it('renders nothing when there are no prior shows to clone', () => {
    mockShowsQueryState = { data: [], isLoading: false, isError: false };

    render(<CloneFromShowCombobox />);

    expect(screen.queryByRole('button', { name: /select a past show to clone/i })).toBeNull();
  });

  it('shows a non-blocking plain-English message when prior shows fail to load', () => {
    mockShowsQueryState = { data: [], isLoading: false, isError: true };

    render(<CloneFromShowCombobox />);

    expect(screen.getByText(/we could not load previous shows/i)).toBeVisible();
    expect(screen.getByText(/you can still enter this show manually/i)).toBeVisible();
    expect(screen.queryByRole('button', { name: /select a past show to clone/i })).toBeNull();
  });
});
