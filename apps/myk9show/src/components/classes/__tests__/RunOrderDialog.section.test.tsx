/**
 * Tests for section-aware behavior in RunOrderDialog.
 * Verifies that section presets appear only when entries have multiple
 * distinct non-null sections, and are absent for single-section or
 * no-section classes.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { RunOrderDialog } from '../RunOrderDialog';
import type { RunOrderEntry } from '@/lib/runOrderUtils';

const noSectionEntries: RunOrderEntry[] = [
  { id: 'e1', armband: '1', section: null },
  { id: 'e2', armband: '2', section: null },
  { id: 'e3', armband: '3', section: null },
];

const singleSectionEntries: RunOrderEntry[] = [
  { id: 'a1', armband: '1', section: 'A' },
  { id: 'a2', armband: '2', section: 'A' },
];

const multiSectionEntries: RunOrderEntry[] = [
  { id: 'a1', armband: '1', section: 'A' },
  { id: 'a2', armband: '2', section: 'A' },
  { id: 'b1', armband: '3', section: 'B' },
  { id: 'b2', armband: '4', section: 'B' },
];

const defaultOnApply = vi.fn().mockResolvedValue(undefined);
const defaultOnOpenChange = vi.fn();

function renderDialog(entries: RunOrderEntry[], onApply = defaultOnApply) {
  return render(
    <RunOrderDialog
      open={true}
      onOpenChange={defaultOnOpenChange}
      entries={entries}
      onApply={onApply}
    />
  );
}

describe('RunOrderDialog — section-aware UI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    defaultOnApply.mockResolvedValue(undefined);
  });

  // ── No-section class ────────────────────────────────────────────────────────

  describe('no-section class (all sections null)', () => {
    it('renders the 4 basic presets', () => {
      renderDialog(noSectionEntries);
      expect(screen.getByText('Armband Low to High')).toBeInTheDocument();
      expect(screen.getByText('Armband High to Low')).toBeInTheDocument();
      expect(screen.getByText('Random Shuffle')).toBeInTheDocument();
      expect(screen.getByText('Manual Drag and Drop')).toBeInTheDocument();
    });

    it('does NOT show section preset labels', () => {
      renderDialog(noSectionEntries);
      expect(screen.queryByText(/Section A then B/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/Section B then A/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/Random Shuffle \(within sections\)/i)).not.toBeInTheDocument();
    });

    it('does NOT show the section scope picker', () => {
      renderDialog(noSectionEntries);
      expect(screen.queryByText(/All \(A/)).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Section A/ })).not.toBeInTheDocument();
    });
  });

  // ── Single-section class ────────────────────────────────────────────────────

  describe('single-section class (only A entries)', () => {
    it('renders the 4 basic presets', () => {
      renderDialog(singleSectionEntries);
      expect(screen.getByText('Armband Low to High')).toBeInTheDocument();
      expect(screen.getByText('Armband High to Low')).toBeInTheDocument();
      expect(screen.getByText('Random Shuffle')).toBeInTheDocument();
      expect(screen.getByText('Manual Drag and Drop')).toBeInTheDocument();
    });

    it('does NOT show section preset groups', () => {
      renderDialog(singleSectionEntries);
      expect(screen.queryByText(/Section A then B/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/Section B then A/i)).not.toBeInTheDocument();
    });

    it('does NOT show the section scope picker', () => {
      renderDialog(singleSectionEntries);
      expect(screen.queryByText(/All \(A/)).not.toBeInTheDocument();
    });
  });

  // ── Multi-section class ─────────────────────────────────────────────────────

  describe('multi-section class (A and B entries present)', () => {
    it("renders v3's grouped list: Combined, A then B, B then A, Other", () => {
      renderDialog(multiSectionEntries);
      expect(screen.getByText('Combined (ignore sections)')).toBeInTheDocument();
      // low-to-high / high-to-low appear once per armband group (Combined, A→B, B→A)
      expect(screen.getAllByText('Armband Low to High')).toHaveLength(3);
      expect(screen.getAllByText('Armband High to Low')).toHaveLength(3);
      expect(screen.getByText('Random Shuffle (all dogs)')).toBeInTheDocument();
      expect(screen.getByText('Manual Drag and Drop')).toBeInTheDocument();
    });

    it('shows the section scope picker with All, Section A, Section B buttons', () => {
      renderDialog(multiSectionEntries);
      expect(screen.getByText(/All \(A/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Section A' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Section B' })).toBeInTheDocument();
    });

    it('shows section preset group headings', () => {
      renderDialog(multiSectionEntries);
      expect(screen.getByText(/Section A then B/i)).toBeInTheDocument();
      expect(screen.getByText(/Section B then A/i)).toBeInTheDocument();
      expect(screen.getByText('Combined (ignore sections)')).toBeInTheDocument();
      expect(screen.getByText('Other')).toBeInTheDocument();
    });

    it('shows the random-sections preset option', () => {
      renderDialog(multiSectionEntries);
      expect(screen.getByText('Random Shuffle (within sections)')).toBeInTheDocument();
    });

    it('applies an all-scope section preset (a-then-b-asc)', async () => {
      const onApply = vi.fn().mockResolvedValue(undefined);
      const { user } = renderDialog(multiSectionEntries, onApply);

      // Groups render in order Combined, A then B, B then A: index 1 = a-then-b-asc.
      await user.click(screen.getAllByText('Armband Low to High')[1]);

      const applyBtn = screen.getByRole('button', { name: 'Apply' });
      expect(applyBtn).toBeEnabled();
      await user.click(applyBtn);

      expect(onApply).toHaveBeenCalledWith('a-then-b-asc', 'all');
    });

    it.each([
      ['Armband Low to High', 0, 'combined-asc'],
      ['Armband High to Low', 0, 'combined-desc'],
      ['Armband High to Low', 1, 'a-then-b-desc'],
      ['Armband Low to High', 2, 'b-then-a-asc'],
      ['Armband High to Low', 2, 'b-then-a-desc'],
      ['Random Shuffle (all dogs)', 0, 'random'],
      ['Random Shuffle (within sections)', 0, 'random-sections'],
      ['Manual Drag and Drop', 0, 'manual'],
    ])('all-scope "%s" #%i applies %s', async (label, index, preset) => {
      const onApply = vi.fn().mockResolvedValue(undefined);
      const { user } = renderDialog(multiSectionEntries, onApply);
      await user.click(screen.getAllByText(label)[index]);
      await user.click(screen.getByRole('button', { name: 'Apply' }));
      expect(onApply).toHaveBeenCalledWith(preset, 'all');
    });

    it('offers Manual Drag and Drop for a single section and skips the renumber step', async () => {
      const onApply = vi.fn().mockResolvedValue(undefined);
      const { user } = renderDialog(multiSectionEntries, onApply);
      await user.click(screen.getByRole('button', { name: 'Section B' }));
      await user.click(screen.getByText('Manual Drag and Drop'));
      await user.click(screen.getByRole('button', { name: 'Apply' }));
      expect(onApply).toHaveBeenCalledWith('manual', 'B');
    });

    it('switches to Section A scope when that tab is clicked', async () => {
      const { user } = renderDialog(multiSectionEntries);
      await user.click(screen.getByRole('button', { name: 'Section A' }));

      // Section-group headings should disappear in scoped mode
      expect(screen.queryByText(/Section A then B/i)).not.toBeInTheDocument();
      // Scoped presets still present (armband-asc, armband-desc, random)
      expect(screen.getByText('Armband Low to High')).toBeInTheDocument();
    });

    it('shows Next button (not Apply) when a scoped preset is selected', async () => {
      const { user } = renderDialog(multiSectionEntries);
      await user.click(screen.getByRole('button', { name: 'Section A' }));
      await user.click(screen.getByText('Armband Low to High'));
      expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument();
    });

    it('shows the renumber step after clicking Next in scoped mode', async () => {
      const { user } = renderDialog(multiSectionEntries);
      await user.click(screen.getByRole('button', { name: 'Section A' }));
      await user.click(screen.getByText('Armband Low to High'));
      await user.click(screen.getByRole('button', { name: 'Next' }));

      expect(screen.getByText(/Preserve Section B/i)).toBeInTheDocument();
      expect(screen.getByText(/Renumber all/i)).toBeInTheDocument();
    });

    it('calls onApply with scope and renumberMode when preserve is chosen', async () => {
      const onApply = vi.fn().mockResolvedValue(undefined);
      const { user } = renderDialog(multiSectionEntries, onApply);

      await user.click(screen.getByRole('button', { name: 'Section A' }));
      await user.click(screen.getByText('Armband Low to High'));
      await user.click(screen.getByRole('button', { name: 'Next' }));
      await user.click(screen.getByText(/Preserve Section B/i));

      expect(onApply).toHaveBeenCalledWith('armband-asc', 'A', 'preserve');
    });

    it('calls onApply with renumber mode', async () => {
      const onApply = vi.fn().mockResolvedValue(undefined);
      const { user } = renderDialog(multiSectionEntries, onApply);

      await user.click(screen.getByRole('button', { name: 'Section A' }));
      await user.click(screen.getByText('Armband Low to High'));
      await user.click(screen.getByRole('button', { name: 'Next' }));
      await user.click(screen.getByText(/Renumber all/i));

      expect(onApply).toHaveBeenCalledWith('armband-asc', 'A', 'renumber');
    });

    it('Back button on renumber step returns to preset list', async () => {
      const { user } = renderDialog(multiSectionEntries);
      await user.click(screen.getByRole('button', { name: 'Section A' }));
      await user.click(screen.getByText('Armband Low to High'));
      await user.click(screen.getByRole('button', { name: 'Next' }));

      // Now on renumber step
      expect(screen.getByText(/Preserve Section B/i)).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Back' }));

      // Back to preset list
      expect(screen.getByText('Armband Low to High')).toBeInTheDocument();
      expect(screen.queryByText(/Preserve Section B/i)).not.toBeInTheDocument();
    });
  });

  // ── Entry count display ─────────────────────────────────────────────────────

  describe('entry count', () => {
    it('shows total count for all-scope', () => {
      renderDialog(multiSectionEntries);
      expect(screen.getByText(/4.*entries/)).toBeInTheDocument();
    });

    it('shows section-specific count when scoped', async () => {
      const { user } = renderDialog(multiSectionEntries);
      await user.click(screen.getByRole('button', { name: 'Section A' }));
      expect(screen.getByText(/2.*entries/)).toBeInTheDocument();
    });
  });
});
