/**
 * F34 — every id-keyed dropdown in the app displayed a raw UUID.
 *
 * Base UI resolves `<Select.Value>` to an item's label ONLY when the root is given
 * `items`: "When specified, <Select.Value> renders the label of the selected item
 * instead of the raw value" (@base-ui/react 1.7.0, SelectRoot.d.ts). The popup's
 * `<SelectItem>`s cannot supply it, because they are unmounted while the select is
 * closed — which is exactly when the trigger renders.
 *
 * 43 option sites across 34 files were keyed by an id, so all of them printed a UUID.
 * Rather than patch 43 call sites and leave the 44th to reintroduce it, the shared
 * `Select` wrapper derives `items` from the `SelectItem` children it is already
 * given. These tests pin the behaviour that makes that safe.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './index';

const ADA = '08a66fc8-51b4-484a-918a-03bdd5a8d5bf';
const GRACE = 'b0728006-4428-4b5d-8462-00015c26a35b';

function trigger() {
  return screen.getByRole('combobox', { name: 'picker' });
}

describe('Select derives item labels for the trigger (F34)', () => {
  it('shows the label, not the raw id, for a preselected value', () => {
    render(
      <Select value={ADA}>
        <SelectTrigger aria-label="picker">
          <SelectValue placeholder="Pick" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ADA}>Ada Lovelace</SelectItem>
          <SelectItem value={GRACE}>Grace Hopper</SelectItem>
        </SelectContent>
      </Select>
    );

    expect(trigger()).toHaveTextContent('Ada Lovelace');
    expect(trigger()).not.toHaveTextContent(ADA);
  });

  it('shows the label after the user picks from the open popup', async () => {
    const user = userEvent.setup();
    render(
      <Select defaultValue="">
        <SelectTrigger aria-label="picker">
          <SelectValue placeholder="Pick" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ADA}>Ada Lovelace</SelectItem>
        </SelectContent>
      </Select>
    );

    await user.click(trigger());
    await user.click(await screen.findByRole('option', { name: 'Ada Lovelace' }));

    // Before the fix this read back the UUID even though the user clicked a name.
    expect(trigger()).toHaveTextContent('Ada Lovelace');
    expect(trigger()).not.toHaveTextContent(ADA);
  });

  it('collects items rendered through .map(), the shape nearly every call site uses', () => {
    const people = [
      { id: ADA, name: 'Ada Lovelace' },
      { id: GRACE, name: 'Grace Hopper' },
    ];
    render(
      <Select value={GRACE}>
        <SelectTrigger aria-label="picker">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {people.map(p => (
            <SelectItem key={p.id} value={p.id}>
              {p.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );

    expect(trigger()).toHaveTextContent('Grace Hopper');
  });

  it('collects items nested in groups and fragments', () => {
    render(
      <Select value={GRACE}>
        <SelectTrigger aria-label="picker">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <>
              <SelectItem value={ADA}>Ada Lovelace</SelectItem>
              <SelectItem value={GRACE}>Grace Hopper</SelectItem>
            </>
          </SelectGroup>
        </SelectContent>
      </Select>
    );

    expect(trigger()).toHaveTextContent('Grace Hopper');
  });

  it('keeps a value that matches no item instead of clearing it', () => {
    // A judge can be assigned and yet filtered out of the options. The trigger must
    // not silently drop the selection, and must not print the raw id either.
    const onValueChange = vi.fn();
    render(
      <Select value={ADA} onValueChange={onValueChange}>
        <SelectTrigger aria-label="picker">
          <SelectValue placeholder="Assign judge" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={GRACE}>Grace Hopper</SelectItem>
        </SelectContent>
      </Select>
    );

    expect(onValueChange).not.toHaveBeenCalled();
    // Never the raw id; a neutral label instead, and the selection is not cleared.
    expect(trigger()).not.toHaveTextContent(ADA);
    expect(trigger()).toHaveTextContent('Unavailable');
  });

  it('does not override an explicit items prop', () => {
    render(
      <Select value={ADA} items={{ [ADA]: 'Explicit Label' }}>
        <SelectTrigger aria-label="picker">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ADA}>Child Label</SelectItem>
        </SelectContent>
      </Select>
    );

    expect(trigger()).toHaveTextContent('Explicit Label');
  });

  it('leaves the placeholder visible when nothing is selected', () => {
    render(
      <Select defaultValue="">
        <SelectTrigger aria-label="picker">
          <SelectValue placeholder="Pick someone" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ADA}>Ada Lovelace</SelectItem>
        </SelectContent>
      </Select>
    );

    expect(trigger()).toHaveTextContent('Pick someone');
  });

  it('still renders a plain human-readable value unchanged', () => {
    // The majority of call sites key options by their own label; deriving items
    // must not disturb them.
    render(
      <Select value="Novice">
        <SelectTrigger aria-label="picker">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="Novice">Novice</SelectItem>
          <SelectItem value="Advanced">Advanced</SelectItem>
        </SelectContent>
      </Select>
    );

    expect(trigger()).toHaveTextContent('Novice');
  });

  it('does NOT relabel a non-id value that is missing from the options', () => {
    // Only opaque ids are masked. A human-readable value is its own label, and a
    // status that is not among the offered options should still read as itself.
    render(
      <Select value="Withdrawn">
        <SelectTrigger aria-label="picker">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="Entered">Entered</SelectItem>
        </SelectContent>
      </Select>
    );

    expect(trigger()).toHaveTextContent('Withdrawn');
  });
});
