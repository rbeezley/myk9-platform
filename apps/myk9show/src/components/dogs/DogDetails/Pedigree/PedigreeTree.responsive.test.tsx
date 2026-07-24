import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import PedigreeTree from './PedigreeTree';
import type { PedigreeAncestor } from '@/types/pedigree-types';

// Source guard: the wide-tree vs narrow-grouped switch must be driven by the
// measured content-container width (useElementWidth), not viewport media
// queries. Mocking this hook is the only way to force each layout in jsdom.
const useElementWidthMock = vi.fn();
vi.mock('@/hooks/useElementWidth', () => ({
  useElementWidth: () => useElementWidthMock(),
}));

const sire: PedigreeAncestor = {
  id: 'sire-1',
  dog_id: 'dog-1',
  owner_id: 'owner-1',
  position: 'sire',
  linked_dog_id: null,
  registered_name: 'Champion Rex',
  call_name: 'Rex',
  titles: null,
  breed: null,
  color: null,
  sex: 'male',
  date_of_birth: null,
  photo_url: null,
  registration_numbers: {},
  health_info: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const ancestors: PedigreeAncestor[] = [sire];

const handlers = () => ({
  onAdd: vi.fn(),
  onView: vi.fn(),
  onEdit: vi.fn(),
  onDelete: vi.fn(),
});

describe('PedigreeTree container-aware layout', () => {
  beforeEach(() => {
    useElementWidthMock.mockReset();
  });

  it('renders the visual tree when the container fits it', () => {
    useElementWidthMock.mockReturnValue({ ref: { current: null }, width: 900 });
    render(<PedigreeTree ancestors={ancestors} {...handlers()} />);

    expect(screen.getByTestId('pedigree-tree-layout')).toBeInTheDocument();
    expect(screen.queryByTestId('pedigree-grouped-layout')).not.toBeInTheDocument();
    // Filled slot (Sire) exposes its actions menu; empty slots expose Add.
    expect(screen.getByText('Rex')).toBeInTheDocument();
    expect(screen.getAllByText(/^Add /)).toHaveLength(5); // dam + 4 grandparents
  });

  it('renders ordered Parents-then-Grandparents relationship groups when the container is narrow', () => {
    useElementWidthMock.mockReturnValue({ ref: { current: null }, width: 400 });
    render(<PedigreeTree ancestors={ancestors} {...handlers()} />);

    const grouped = screen.getByTestId('pedigree-grouped-layout');
    expect(grouped).toBeInTheDocument();
    expect(screen.queryByTestId('pedigree-tree-layout')).not.toBeInTheDocument();

    const headings = within(grouped).getAllByRole('heading', { level: 3 });
    expect(headings.map(h => h.textContent)).toEqual(['Parents', 'Grandparents']);

    // Explicit relationship labels, in fixed order.
    expect(within(grouped).getAllByText('Sire').length).toBeGreaterThan(0);
    expect(within(grouped).getAllByText('Dam').length).toBeGreaterThan(0);
    expect(within(grouped).getByText("Sire's Sire")).toBeInTheDocument();
    expect(within(grouped).getByText("Sire's Dam")).toBeInTheDocument();
    expect(within(grouped).getByText("Dam's Sire")).toBeInTheDocument();
    expect(within(grouped).getByText("Dam's Dam")).toBeInTheDocument();
  });

  it('keeps the grouped layout in the 640-799px window where the tree row cannot fit', () => {
    // The grandparent row needs ~784px (4 × 180px cards + gaps); a
    // two-column Dog Details container at audited widths lands in this
    // range, so the visual tree must NOT be selected here (codex P1).
    useElementWidthMock.mockReturnValue({ ref: { current: null }, width: 700 });
    render(<PedigreeTree ancestors={ancestors} {...handlers()} />);
    expect(screen.getByTestId('pedigree-grouped-layout')).toBeInTheDocument();
    expect(screen.queryByTestId('pedigree-tree-layout')).not.toBeInTheDocument();
  });

  it('defaults to the grouped layout before the container width is measured', () => {
    useElementWidthMock.mockReturnValue({ ref: { current: null }, width: null });
    render(<PedigreeTree ancestors={ancestors} {...handlers()} />);

    expect(screen.getByTestId('pedigree-grouped-layout')).toBeInTheDocument();
  });

  it('exposes the same add/view/edit/delete actions in the narrow grouped layout as the wide tree', async () => {
    useElementWidthMock.mockReturnValue({ ref: { current: null }, width: 400 });
    const { user } = render(<PedigreeTree ancestors={ancestors} {...handlers()} />);

    // Filled slot (Sire): open its three-dot menu and confirm View/Edit/Delete.
    const menuButtons = screen.getAllByRole('button', { name: /more/i });
    await user.click(menuButtons[0]);
    await screen.findByRole('menu');
    expect(screen.getByRole('menuitem', { name: /^view$/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /^edit$/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /^delete$/i })).toBeInTheDocument();

    // Empty slots (Dam + 4 grandparents) each expose an Add affordance.
    expect(screen.getAllByText(/^Add /)).toHaveLength(5);
  });
});
