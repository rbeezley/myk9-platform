import { makePaymentResolution } from '@/test/utils/paymentResolution';
import type { ReactElement, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@/test/utils/testUtils';
import type { WorkflowConfig } from '../RegistrationWorkflow.types';
import type { EntrySubmissionOutcome } from '@/services/database/entries';

const {
  mockUseShowStore,
  mockUseTrialStore,
  mockUseDogStoreCompat,
  mockUseClassStoreCompat,
  mockUseUserStore,
  mockPdf,
  mockSaveAs,
} = vi.hoisted(() => ({
  mockUseShowStore: vi.fn(),
  mockUseTrialStore: vi.fn(),
  mockUseDogStoreCompat: vi.fn(),
  mockUseClassStoreCompat: vi.fn(),
  mockUseUserStore: vi.fn(),
  mockPdf: vi.fn(),
  mockSaveAs: vi.fn(),
}));

vi.mock('@/store/showStore', () => ({ useShowStore: mockUseShowStore }));
vi.mock('@/store/trialStore', () => ({ useTrialStore: mockUseTrialStore }));
vi.mock('@/hooks/useDogStoreCompat', () => ({ useDogStoreCompat: mockUseDogStoreCompat }));
vi.mock('@/hooks/useClassStoreCompat', () => ({ useClassStoreCompat: mockUseClassStoreCompat }));
vi.mock('@/store/userStore', () => ({ useUserStore: mockUseUserStore }));

vi.mock('@react-pdf/renderer', () => ({
  Document: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Page: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  View: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Text: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  Image: () => null,
  StyleSheet: { create: (styles: unknown) => styles },
  Font: { register: vi.fn(), registerHyphenationCallback: vi.fn() },
}));
vi.mock('@/features/_shared/loadReactPdf', () => ({
  loadReactPdf: () => Promise.resolve({ pdf: mockPdf }),
}));
vi.mock('file-saver', () => ({ saveAs: mockSaveAs }));

const emailHook = vi.hoisted(() => vi.fn());
vi.mock('@/features/lifecycle-emails', async importOriginal => ({
  ...(await importOriginal<typeof import('@/features/lifecycle-emails')>()),
  useRegistrationNumberNeededEmail: emailHook,
}));

import { WorkflowStepContent } from '../WorkflowStepContent';

const workflowConfig: WorkflowConfig = {
  steps: ['dog-selection', 'class-selection', 'handler-assignment', 'payment', 'confirmation'],
  features: {
    bulkSelection: true,
    createNew: true,
    advancedSearch: true,
    handlerAssignment: true,
    paymentOverride: true,
    statusManagement: true,
  },
  smartDefaults: {
    autoAssignHandler: false,
    autoCalculateFees: true,
    delayRegistrationCreation: false,
  },
};

const show = {
  id: 'show-1',
  name: 'Summer Scent Work',
  organization: 'AKC',
  startDate: '2026-08-08',
  endDate: '2026-08-09',
  entryCloseDate: '2026-07-30',
  preEntryFee: '25',
  clubName: 'Prairie Dog Club',
  clubEmail: 'secretary@prairie.example',
  style: 'heritage',
  brand_color: null,
};

const trials = [
  {
    id: 'trial-1',
    showId: 'show-1',
    trialDate: '2026-08-08',
    trialNumber: 'I',
    order: '1',
    registryId: 'AKC',
    timezone: 'America/Chicago',
    confirmationDate: '2026-08-01',
  },
];

const classes = [
  {
    id: 'class-1',
    trialId: 'trial-1',
    className: 'Novice Containers',
    element: 'Containers',
    level: 'Novice',
    section: 'A',
    judge: 'Judge One',
  },
  {
    id: 'class-2',
    trialId: 'trial-1',
    className: 'Advanced Exterior',
    element: 'Exterior',
    level: 'Advanced',
    section: 'B',
    judge: 'Judge Two',
  },
];

const people = [
  {
    id: 'handler-2',
    firstName: 'Jamie',
    lastName: 'Smith',
    email: 'jamie@example.com',
  },
];

let dogs: Array<Record<string, unknown>>;

beforeEach(() => {
  dogs = [
    {
      id: 'dog-1',
      name: 'First Dog',
      callName: 'First',
      ownerId: 'owner-1',
      registrations: [
        {
          id: 'reg-1',
          organization: 'AKC',
          registrationNumber: 'AKC-FIRST',
          registeredName: 'First Registered Dog',
          breed: 'Beagle',
          createdAt: '2025-01-01T00:00:00Z',
          status: 'Active',
        },
      ],
    },
    {
      id: 'dog-2',
      name: 'Tera',
      callName: 'Tera',
      ownerId: 'owner-2',
      registrations: [
        {
          id: 'reg-2',
          organization: 'AKC',
          registrationNumber: 'AKC-SECOND',
          registeredName: 'Maia TeraByte Van Neerland',
          breed: 'Belgian Tervuren',
          createdAt: '2025-02-01T00:00:00Z',
          status: 'Active',
        },
      ],
    },
  ];

  mockUseShowStore.mockImplementation(
    (selector: (state: { shows: Array<typeof show> }) => unknown) => selector({ shows: [show] })
  );
  mockUseTrialStore.mockImplementation((selector: (state: { trials: typeof trials }) => unknown) =>
    selector({ trials })
  );
  mockUseDogStoreCompat.mockImplementation(() => ({ dogs }));
  mockUseClassStoreCompat.mockImplementation(() => ({ classes }));
  mockUseUserStore.mockImplementation((selector: (state: { people: typeof people }) => unknown) =>
    selector({ people })
  );
  mockPdf.mockReset();
  mockPdf.mockReturnValue({ toBlob: () => Promise.resolve(new Blob(['%PDF'])) });
  mockSaveAs.mockReset();
});

function createdOutcome(dogId: string, classId: string, entryId: string): EntrySubmissionOutcome {
  return {
    dogId,
    classId,
    outcome: 'created',
    entryId,
    waitlistEntryId: null,
    feeCents: 2_500,
    capacityOverride: false,
  };
}

function renderConfirmation(
  outcomes: EntrySubmissionOutcome[] | undefined,
  createdEntryOutcomes?: EntrySubmissionOutcome[]
) {
  const selections = [
    { dogId: 'dog-1', trialId: 'trial-1', selectedClasses: [{ classId: 'class-1' }] },
    { dogId: 'dog-2', trialId: 'trial-1', selectedClasses: [{ classId: 'class-2' }] },
  ];

  return render(
    <WorkflowStepContent
      paymentResolution={makePaymentResolution()}
      currentStepId="confirmation"
      currentWorkflowConfig={workflowConfig}
      currentWorkflowMode="secretary_new"
      registrationData={{
        selectedDogs: ['dog-1', 'dog-2'],
        entries: [],
        documents: [],
        paymentMethod: 'credit_card',
      }}
      optimisticState={{
        formData: {
          selectedDogs: ['dog-1', 'dog-2'],
          entries: [],
          documents: [],
          paymentMethod: 'credit_card',
        },
        classSelections: selections,
        handlerAssignments: {
          'dog-2|class-2': {
            handlerId: 'handler-2',
            handlerName: 'Jamie Smith',
            isOwner: false,
          },
        },
        paymentStatus: 'paid_online' as never,
        entryStatus: 'pending' as never,
      }}
      showId="show-1"
      registrationId="registration-1"
      registrationNumber="CONF-100"
      currentRegistrationTotalFees={50}
      entryOutcomes={outcomes}
      createdEntryOutcomes={createdEntryOutcomes}
      onDogSelectionChange={vi.fn()}
      onClassSelectionChange={vi.fn()}
      onHandlerAssignmentChange={vi.fn()}
      onPaymentMethodChange={vi.fn()}
      onPaymentStatusChange={vi.fn()}
      onEntryStatusChange={vi.fn()}
      setPaymentStatus={vi.fn()}
      setEntryStatus={vi.fn()}
    />
  );
}

describe('WorkflowStepContent registration number email', () => {
  it('sends nothing and mounts nothing after a secretary save: the Exceptions list is the one place', () => {
    renderConfirmation([createdOutcome('dog-2', 'class-2', 'entry-2')]);

    expect(emailHook).not.toHaveBeenCalled();
  });
});

describe('WorkflowStepContent entry blanks', () => {
  it('shows the missing-registration warning before mounting PDF generation', async () => {
    dogs[1] = { ...dogs[1], registrations: [] };

    const { user } = renderConfirmation([createdOutcome('dog-2', 'class-2', 'entry-2')]);

    expect(
      screen
        .getByText('This dog has no registration for this trial’s organization.')
        .closest('[role="alert"]')
    ).toBeInTheDocument();
    expect(mockPdf).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole('button', {
        name: 'Generate partly filled form for Tera — Advanced Exterior',
      })
    );

    await waitFor(() => expect(mockPdf).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mockSaveAs).toHaveBeenCalledTimes(1));
  });

  // MYK9-1518: an ordinary submission surfaces no entryOutcomes at all.
  it('offers a download per created entry when the submission surfaced no outcomes', () => {
    renderConfirmation(undefined, [
      createdOutcome('dog-1', 'class-1', 'entry-1'),
      createdOutcome('dog-2', 'class-2', 'entry-2'),
    ]);

    expect(
      screen.getByRole('button', { name: 'Download First — Novice Containers' })
    ).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Download Tera — Advanced Exterior' })).toBeEnabled();
    expect(screen.queryByText('Entry summary')).not.toBeInTheDocument();
  });

  it('builds one action per created entry with that entry’s exact data', async () => {
    const { user } = renderConfirmation([
      createdOutcome('dog-1', 'class-1', 'entry-1'),
      createdOutcome('dog-2', 'class-2', 'entry-2'),
    ]);

    expect(
      screen.getByRole('button', { name: 'Download First — Novice Containers' })
    ).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Download Tera — Advanced Exterior' })).toBeEnabled();
    expect(mockPdf).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Download Tera — Advanced Exterior' }));
    await waitFor(() => expect(mockPdf).toHaveBeenCalledTimes(1));

    const secondDocument = mockPdf.mock.calls[0]?.[0] as ReactElement<{
      dog: { registrationNumber: string };
      trials: Array<{ judgeName: string; checked: boolean }>;
    }>;

    expect(secondDocument.props.dog.registrationNumber).toBe('AKC-SECOND');
    expect(secondDocument.props.trials).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          judgeName: 'Judge Two',
          checked: true,
        }),
      ])
    );
  });
});
