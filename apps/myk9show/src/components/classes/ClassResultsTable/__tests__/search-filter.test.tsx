import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { ClassResultsTable } from '../index';
import type { ClassResultsTableProps } from '../types';
import { makeRawRow, makeScentEntry } from './rowFixture';

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    isExhibitor: false,
    isSecretary: true,
    isJudge: false,
    isAdmin: false,
    user: { id: 'u1' },
  }),
}));

vi.mock('@/hooks/useVisibleResultFields', () => ({
  useVisibleResultFields: () => ({
    showPlacement: true,
    showQualification: true,
    showTime: true,
    showFaults: true,
    selfCheckinEnabled: false,
  }),
  deriveClassState: () => 'in-progress',
}));

const defaultProps: ClassResultsTableProps = {
  entries: [
    makeScentEntry('e1', '101', 'Rex', 'Alice Smith'),
    makeScentEntry('e2', '202', 'Buddy', 'Bob Jones'),
    makeScentEntry('e3', '303', 'Max', 'Carol Davis'),
  ],
  // Buddy is scored, so the default Pending tab leaves him out.
  rawEntries: [
    makeRawRow('e1'),
    makeRawRow('e2', { is_scored: true, result_status: 'qualified', final_placement: 1 }),
    makeRawRow('e3'),
  ],
  classId: 'cls-1',
  showId: 'show-1',
  trialId: 'trial-1',
};

function renderTable(overrides: Partial<ClassResultsTableProps> = {}) {
  return render(<ClassResultsTable {...defaultProps} {...overrides} />);
}

// --- Tests ---

describe('ClassResultsTable search/filter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the search input', () => {
    renderTable();
    expect(screen.getByLabelText('Search by dog, handler, or armband...')).toBeInTheDocument();
  });

  it('has exactly one search box (the table brings none of its own)', () => {
    renderTable();
    expect(screen.getAllByPlaceholderText(/search/i)).toHaveLength(1);
  });

  it('shows placeholder text in the search input', () => {
    renderTable();
    const input = screen.getByLabelText('Search by dog, handler, or armband...');
    expect(input).toHaveAttribute('placeholder', 'Search by dog, handler, or armband...');
  });

  it('filters entries by dog name', async () => {
    const { user } = renderTable();
    // Switch to All tab so all entries are visible
    await user.click(screen.getByRole('combobox', { name: 'View: Result views' }));
    await user.click(await screen.findByRole('option', { name: /^All/ }));

    const searchInput = screen.getByLabelText('Search by dog, handler, or armband...');
    await user.type(searchInput, 'Rex');

    // Rex should remain, Buddy and Max should be filtered out
    expect(screen.getByText('Rex')).toBeInTheDocument();
    expect(screen.queryByText('Buddy')).not.toBeInTheDocument();
    expect(screen.queryByText('Max')).not.toBeInTheDocument();
  });

  it('filters entries by handler name', async () => {
    const { user } = renderTable();
    await user.click(screen.getByRole('combobox', { name: 'View: Result views' }));
    await user.click(await screen.findByRole('option', { name: /^All/ }));

    const searchInput = screen.getByLabelText('Search by dog, handler, or armband...');
    await user.type(searchInput, 'Bob');

    expect(screen.getByText('Bob Jones')).toBeInTheDocument();
    expect(screen.queryByText('Alice Smith')).not.toBeInTheDocument();
  });

  it('filters entries by armband number', async () => {
    const { user } = renderTable();
    await user.click(screen.getByRole('combobox', { name: 'View: Result views' }));
    await user.click(await screen.findByRole('option', { name: /^All/ }));

    const searchInput = screen.getByLabelText('Search by dog, handler, or armband...');
    await user.type(searchInput, '202');

    expect(screen.getByText('Buddy')).toBeInTheDocument();
    expect(screen.queryByText('Rex')).not.toBeInTheDocument();
  });

  it('search is case-insensitive', async () => {
    const { user } = renderTable();
    await user.click(screen.getByRole('combobox', { name: 'View: Result views' }));
    await user.click(await screen.findByRole('option', { name: /^All/ }));

    const searchInput = screen.getByLabelText('Search by dog, handler, or armband...');
    await user.type(searchInput, 'rex');

    expect(screen.getByText('Rex')).toBeInTheDocument();
  });

  it('shows clear button when search has text', async () => {
    const { user } = renderTable();
    const searchInput = screen.getByLabelText('Search by dog, handler, or armband...');
    await user.type(searchInput, 'Rex');

    expect(screen.getByLabelText('Clear search')).toBeInTheDocument();
  });

  it('does not show clear button when search is empty', () => {
    renderTable();
    expect(screen.queryByLabelText('Clear search')).not.toBeInTheDocument();
  });

  it('clears search when clear button is clicked', async () => {
    const { user } = renderTable();
    await user.click(screen.getByRole('combobox', { name: 'View: Result views' }));
    await user.click(await screen.findByRole('option', { name: /^All/ }));

    const searchInput = screen.getByLabelText('Search by dog, handler, or armband...');
    await user.type(searchInput, 'Rex');

    // Only Rex visible
    expect(screen.queryByText('Buddy')).not.toBeInTheDocument();

    // Clear
    await user.click(screen.getByLabelText('Clear search'));

    // All entries visible again
    expect(screen.getByText('Rex')).toBeInTheDocument();
    expect(screen.getByText('Buddy')).toBeInTheDocument();
    expect(screen.getByText('Max')).toBeInTheDocument();
  });

  it('filters within the active tab only', async () => {
    const { user } = renderTable();

    // On Pending tab by default — Buddy is scored so not shown
    expect(screen.queryByText('Buddy')).not.toBeInTheDocument();
    expect(screen.getByText('Rex')).toBeInTheDocument();
    expect(screen.getByText('Max')).toBeInTheDocument();

    // Search for Max on Pending tab
    const searchInput = screen.getByLabelText('Search by dog, handler, or armband...');
    await user.type(searchInput, 'Max');

    expect(screen.getByText('Max')).toBeInTheDocument();
    expect(screen.queryByText('Rex')).not.toBeInTheDocument();
    // Buddy is still not shown (it's completed, not pending)
    expect(screen.queryByText('Buddy')).not.toBeInTheDocument();
  });

  it('returns no results when search has no matches', async () => {
    const { user } = renderTable();
    await user.click(screen.getByRole('combobox', { name: 'View: Result views' }));
    await user.click(await screen.findByRole('option', { name: /^All/ }));

    const searchInput = screen.getByLabelText('Search by dog, handler, or armband...');
    await user.type(searchInput, 'zzzznonexistent');

    expect(screen.queryByText('Rex')).not.toBeInTheDocument();
    expect(screen.queryByText('Buddy')).not.toBeInTheDocument();
    expect(screen.queryByText('Max')).not.toBeInTheDocument();
  });

  it('states the view and search in a sentence and "Show all entries" resets both', async () => {
    const { user } = renderTable();
    await user.type(screen.getByLabelText('Search by dog, handler, or armband...'), 'Max');

    expect(screen.getByRole('status')).toHaveTextContent('Showing 1 of 3 entries.');
    await user.click(screen.getByRole('button', { name: 'Show all entries' }));

    expect(screen.getByLabelText('Search by dog, handler, or armband...')).toHaveValue('');
    expect(screen.getByText('Rex')).toBeInTheDocument();
    expect(screen.getByText('Buddy')).toBeInTheDocument();
  });
});
