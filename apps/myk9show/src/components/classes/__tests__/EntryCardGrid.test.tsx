import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { EntryCardGrid } from '../ClassResultsTable/EntryCardGrid';
import type { ScentWorkEntry } from '@/types/scent-work-types';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

function makeScentWorkEntry(overrides: Partial<ScentWorkEntry> = {}): ScentWorkEntry {
  return {
    id: 'entry-1',
    status: 'registered',
    displayInfo: {
      armband: '107',
      dogName: 'Laila',
      dogBreed: 'Scottish Terrier',
      handlerName: 'Kathy Gray',
      dogId: 'dog-1',
      handlerId: 'handler-1',
    },
    classConfig: {
      element: 'Container',
      level: 'Advanced',
      timeLimit: 150000,
      multiArea: false,
      warningsEnabled: true,
    },
    ...overrides,
  } as ScentWorkEntry;
}

function renderGrid(entries: ScentWorkEntry[] = [], useSecretaryRoute = true) {
  return render(
    <MemoryRouter>
      <EntryCardGrid entries={entries} classId="class-1" useSecretaryRoute={useSecretaryRoute} />
    </MemoryRouter>
  );
}

describe('EntryCardGrid', () => {
  it('renders one card per entry', () => {
    const entries = [
      makeScentWorkEntry({
        id: 'e1',
        displayInfo: {
          armband: '107',
          dogName: 'Laila',
          dogBreed: 'Scottish Terrier',
          handlerName: 'Kathy Gray',
          dogId: 'd1',
          handlerId: 'h1',
        },
      }),
      makeScentWorkEntry({
        id: 'e2',
        displayInfo: {
          armband: '143',
          dogName: 'Allen',
          dogBreed: 'Dalmatian',
          handlerName: 'Lynda Brownson',
          dogId: 'd2',
          handlerId: 'h2',
        },
      }),
      makeScentWorkEntry({
        id: 'e3',
        displayInfo: {
          armband: '146',
          dogName: 'Cow',
          dogBreed: 'French Bulldog',
          handlerName: 'Michelle Shields',
          dogId: 'd3',
          handlerId: 'h3',
        },
      }),
    ];
    renderGrid(entries);

    expect(screen.getByText('Laila')).toBeInTheDocument();
    expect(screen.getByText('Allen')).toBeInTheDocument();
    expect(screen.getByText('Cow')).toBeInTheDocument();
  });

  it('renders empty state when no entries', () => {
    renderGrid([]);
    expect(screen.getByText(/no entries/i)).toBeInTheDocument();
  });

  it('builds secretary scoring route when useSecretaryRoute is true', () => {
    const entries = [makeScentWorkEntry({ id: 'entry-1' })];
    renderGrid(entries, true);
    expect(screen.getByText('Laila')).toBeInTheDocument();
  });

  it('builds judge scoring route when useSecretaryRoute is false', () => {
    const entries = [makeScentWorkEntry({ id: 'entry-1' })];
    renderGrid(entries, false);
    expect(screen.getByText('Laila')).toBeInTheDocument();
  });

  it('passes armband, breed, and handler from displayInfo', () => {
    const entries = [makeScentWorkEntry()];
    renderGrid(entries);

    expect(screen.getByText('107')).toBeInTheDocument();
    expect(screen.getByText('Scottish Terrier')).toBeInTheDocument();
    expect(screen.getByText(/Kathy Gray/)).toBeInTheDocument();
  });
});
