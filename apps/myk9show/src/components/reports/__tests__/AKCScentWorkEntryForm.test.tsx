import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { AKCScentWorkEntryForm } from '../AKCScentWorkEntryForm';
import type { ReportProps } from '@/lib/reports/types';
import type {
  EntryFormDog,
  EntryFormSecretary,
  EntryFormTrial,
  EntryFormClass,
} from '@/lib/reports/entryFormTypes';

// vi.hoisted runs before vi.mock hoisting, so these are available in the factory
const { mockDogs, mockSecretary, mockTrials, mockClasses, mockUseEntryFormData } = vi.hoisted(
  () => {
    const dogs: EntryFormDog[] = [
      {
        dogId: 'dog-1',
        callName: 'Star',
        breed: 'Golden Retriever',
        sex: 'Female',
        dateOfBirth: '2022-03-15',
        registration: {
          registeredName: "GCH Oakwood's Rising Star",
          registrationNumber: 'DN12345678',
          organization: 'AKC',
          variety: null,
        },
        breeder: 'John Doe',
        sire: "CH Oakwood's Golden Boy",
        dam: "Oakwood's Shining Light",
        owner: {
          firstName: 'Sarah',
          lastName: 'Johnson',
          streetAddress: '456 Oak Ave',
          city: 'Dallas',
          state: 'TX',
          zipCode: '75001',
          phone: '(214) 555-0123',
          email: 'sarah@example.com',
        },
        handler: null,
        armband: 101,
        entries: [
          {
            id: 'e1',
            trialId: 'trial-1',
            classId: 'c1',
            element: 'Container',
            level: 'Excellent',
            armband: 101,
            handler: null,
            submittedAt: '2026-04-01T12:00:00Z',
          },
          {
            id: 'e2',
            trialId: 'trial-1',
            classId: 'c2',
            element: 'Interior',
            level: 'Excellent',
            armband: 101,
            handler: null,
            submittedAt: '2026-04-01T12:00:00Z',
          },
        ],
        agreementDate: '2026-04-01T12:00:00Z',
      },
    ];

    const secretary: EntryFormSecretary = {
      name: 'Jane Smith',
      streetAddress: '123 Main St',
      city: 'Anytown',
      state: 'TX',
      zipCode: '75001',
    };

    const trials: EntryFormTrial[] = [
      { id: 'trial-1', date: '2026-04-12', trialNumber: 1 },
      { id: 'trial-2', date: '2026-04-12', trialNumber: 2 },
    ];

    const classes: EntryFormClass[] = [
      { id: 'c1', trialId: 'trial-1', element: 'Container', level: 'Excellent' },
      { id: 'c2', trialId: 'trial-1', element: 'Interior', level: 'Excellent' },
    ];

    // Create the mock fn here so it's available in the factory
    const mockFn = vi.fn().mockReturnValue({
      dogs,
      secretary,
      trials,
      classes,
      isLoading: false,
      isError: false,
    });

    return {
      mockDogs: dogs,
      mockSecretary: secretary,
      mockTrials: trials,
      mockClasses: classes,
      mockUseEntryFormData: mockFn,
    };
  }
);

vi.mock('@/hooks/queries/useEntryFormData', () => ({
  useEntryFormData: mockUseEntryFormData,
}));

const baseProps: ReportProps = {
  showId: 'show-1',
  showName: 'Spring Scent Trial 2026',
  entries: [],
  sortOrder: 'armband',
  organization: 'AKC',
  clubName: 'Bay Area Nose Work Club',
  showDates: '2026-04-12 – 2026-04-13',
};

describe('AKCScentWorkEntryForm', () => {
  it('renders the form title', () => {
    render(<AKCScentWorkEntryForm {...baseProps} />);
    expect(screen.getByText('OFFICIAL ENTRY FORM')).toBeInTheDocument();
  });

  it('renders published experience notes when available', () => {
    mockUseEntryFormData.mockReturnValue({
      dogs: mockDogs,
      secretary: mockSecretary,
      trials: mockTrials,
      classes: mockClasses,
      show: {
        experienceIsPublished: true,
        experiencePublishedContent: {
          style: 'heritage',
          generatedAt: '2026-05-09T14:00:00.000Z',
          narratives: { showHours: 'Hours', trialInformation: 'Info' },
          supplemental: {
            vetClinic: null,
            accommodations: [],
            coverImageUrl: null,
            hospitalityNotes: 'Coffee in the morning.',
            awardsDescription: null,
            additionalNotes: null,
          },
          outputs: { premiumUrl: null },
        },
      },
      isLoading: false,
      isError: false,
    });

    render(<AKCScentWorkEntryForm {...baseProps} />);

    expect(screen.getByText(/On the Day/i)).toBeInTheDocument();
    expect(screen.getByText(/Coffee in the morning/i)).toBeInTheDocument();
  });

  it('renders the secretary address in the header', () => {
    render(<AKCScentWorkEntryForm {...baseProps} />);
    expect(screen.getByText(/Jane Smith/)).toBeInTheDocument();
    expect(screen.getByText(/123 Main St/)).toBeInTheDocument();
  });

  it('renders the dog registered name', () => {
    render(<AKCScentWorkEntryForm {...baseProps} />);
    expect(screen.getByText(/GCH Oakwood's Rising Star/)).toBeInTheDocument();
  });

  it('renders the registration number', () => {
    render(<AKCScentWorkEntryForm {...baseProps} />);
    expect(screen.getByText(/DN12345678/)).toBeInTheDocument();
  });

  it('renders the owner name and address', () => {
    render(<AKCScentWorkEntryForm {...baseProps} />);
    expect(screen.getByText(/Sarah Johnson/)).toBeInTheDocument();
    expect(screen.getByText(/456 Oak Ave/)).toBeInTheDocument();
  });

  it('renders breeder, sire, and dam when available', () => {
    render(<AKCScentWorkEntryForm {...baseProps} />);
    expect(screen.getByText(/John Doe/)).toBeInTheDocument();
    expect(screen.getByText(/CH Oakwood's Golden Boy/)).toBeInTheDocument();
    expect(screen.getByText(/Oakwood's Shining Light/)).toBeInTheDocument();
  });

  it('renders the agreement text', () => {
    render(<AKCScentWorkEntryForm {...baseProps} />);
    expect(screen.getAllByText(/AGREEMENT/).length).toBeGreaterThan(0);
    expect(screen.getByText(/I certify that I am the actual owner/)).toBeInTheDocument();
  });

  it('renders the digital consent note with date', () => {
    render(<AKCScentWorkEntryForm {...baseProps} />);
    expect(screen.getByText(/Entered via myK9Show/)).toBeInTheDocument();
    expect(screen.getByText(/4\/1\/2026/)).toBeInTheDocument();
  });

  it('renders element column headers', () => {
    render(<AKCScentWorkEntryForm {...baseProps} />);
    expect(screen.getByText('Cont.')).toBeInTheDocument();
    expect(screen.getByText('Int.')).toBeInTheDocument();
    expect(screen.getByText('Ext.')).toBeInTheDocument();
    expect(screen.getByText('Buried')).toBeInTheDocument();
  });

  it('shows error state when showId is missing', () => {
    render(<AKCScentWorkEntryForm {...baseProps} showId={undefined} />);
    expect(screen.getByText(/Show ID is required/)).toBeInTheDocument();
  });

  it('renders gracefully when dog has no registration data', () => {
    mockUseEntryFormData.mockReturnValue({
      dogs: [{ ...mockDogs[0], registration: null }],
      secretary: mockSecretary,
      trials: mockTrials,
      classes: mockClasses,
      isLoading: false,
      isError: false,
    });
    render(<AKCScentWorkEntryForm {...baseProps} />);
    expect(screen.getAllByText(/Star/).length).toBeGreaterThan(0);
    expect(screen.getByText('OFFICIAL ENTRY FORM')).toBeInTheDocument();
  });

  it('renders handler when different from owner', () => {
    mockUseEntryFormData.mockReturnValue({
      dogs: [{ ...mockDogs[0], handler: 'Bob Handler' }],
      secretary: mockSecretary,
      trials: mockTrials,
      classes: mockClasses,
      isLoading: false,
      isError: false,
    });
    render(<AKCScentWorkEntryForm {...baseProps} />);
    expect(screen.getByText(/Bob Handler/)).toBeInTheDocument();
  });

  it('renders empty state when no dogs found', () => {
    mockUseEntryFormData.mockReturnValue({
      dogs: [],
      secretary: mockSecretary,
      trials: mockTrials,
      classes: mockClasses,
      isLoading: false,
      isError: false,
    });
    render(<AKCScentWorkEntryForm {...baseProps} />);
    expect(screen.getByText(/No entries found/)).toBeInTheDocument();
  });
});
