import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen } from '@/test/utils/testUtils';
import type { ClassTemplate } from '@/types/template.types';
import { FieldOverrideForm } from './FieldOverrideForm';

const template = {
  fieldSpecifications: [
    {
      fieldName: 'entryFee',
      displayName: 'Entry fee',
      fieldSource: 'admin-set',
      dataType: 'number',
      required: false,
      editable: true,
      defaultValue: 25,
    },
    {
      fieldName: 'secretaryNote',
      displayName: 'Secretary note',
      fieldSource: 'admin-set',
      dataType: 'text',
      required: false,
      editable: true,
      defaultValue: '',
    },
  ],
} as ClassTemplate;

const props = {
  template,
  selectedClasses: [],
  fieldOverrides: {},
  onOverrideChange: vi.fn(),
  onResetField: vi.fn(),
  onResetAll: vi.fn(),
};

/**
 * MYK9-425: every tab must carry a stable, descriptive accessible name and keep
 * its visible wording, at every viewport width. Each row pairs the tab with a
 * marker that appears only inside that tab's own panel.
 */
const TAB_CASES = [
  ['Basic overrides', 'Basic', 'Field Overrides'],
  ['Financial overrides', 'Financial', 'Entry fee'],
  ['Timing overrides', 'Timing', 'No editable timing fields in this template'],
  ['Personnel overrides', 'Personnel', 'No editable personnel fields in this template'],
  ['Rules overrides', 'Rules', 'No editable rule fields in this template'],
  ['Other overrides', 'Other', 'Secretary note'],
] as const;

describe('FieldOverrideForm', () => {
  it.each(TAB_CASES)(
    'gives the %s tab a stable name and selects its own panel',
    async (accessibleName, visibleLabel, panelMarker) => {
      const user = userEvent.setup();
      render(<FieldOverrideForm {...props} />);

      const tab = screen.getByRole('tab', { name: accessibleName });
      // The visible wording stays inside the tab, and the accessible name
      // contains it, so speech input still matches what a secretary reads
      // (WCAG 2.5.3 label in name).
      expect(tab).toHaveTextContent(visibleLabel);
      expect(accessibleName).toContain(visibleLabel);

      await user.click(tab);

      expect(tab).toHaveAttribute('aria-selected', 'true');
      for (const other of screen.getAllByRole('tab')) {
        if (other !== tab) {
          expect(other).toHaveAttribute('aria-selected', 'false');
        }
      }

      const panel = screen.getByRole('tabpanel');
      expect(panel.id).toBe(tab.getAttribute('aria-controls'));
      if (panelMarker === 'Field Overrides') {
        // The Basic group is empty for this template, so the only proof the
        // Basic panel is mounted is that it is the one aria-controls names.
        expect(panel).toBeInTheDocument();
      } else {
        expect(panel).toHaveTextContent(panelMarker);
      }
    }
  );

  it('gives every tab a non-empty accessible name that no stylesheet can remove', () => {
    render(<FieldOverrideForm {...props} />);

    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(TAB_CASES.length);
    for (const tab of tabs) {
      // The responsive label hiding that made these tabs anonymous at 390px
      // wide cannot reach an aria-label (MYK9-425).
      expect(tab.getAttribute('aria-label')?.trim()).toBeTruthy();
      // ...and the visible wording is still rendered next to the icon.
      expect(tab.textContent?.trim()).toBeTruthy();
    }
  });

  it('shows financial fields when the Financial tab is selected', async () => {
    const user = userEvent.setup();
    render(<FieldOverrideForm {...props} />);

    await user.click(screen.getByRole('tab', { name: /financial/i }));

    expect(screen.getByRole('spinbutton')).toHaveValue(25);
  });

  it('makes fields outside the known groups reachable from Other', async () => {
    const user = userEvent.setup();
    render(<FieldOverrideForm {...props} />);

    await user.click(screen.getByRole('tab', { name: /other/i }));

    expect(screen.getByPlaceholderText('Enter secretary note')).toBeVisible();
  });
});
