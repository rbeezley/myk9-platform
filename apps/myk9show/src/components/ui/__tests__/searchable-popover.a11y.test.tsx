import React, { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@/test/utils/testUtils';
import { SearchablePopover } from '@/components/ui/searchable-popover';

/**
 * MYK9-422: the picker's results must be a real listbox of options, not bare
 * buttons in a dialog. These assertions go through the accessible role/name as
 * rendered by the *real* Base UI popover — the point is what assistive tech
 * receives, which a source-text check could never establish.
 */

interface Item {
  id: string;
}

const ITEMS: Item[] = [{ id: 'Beagle' }, { id: 'Golden Retriever' }, { id: 'Labrador Retriever' }];

function Harness({ onSelect = vi.fn() }: { onSelect?: (item: Item) => void }) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');
  const [selected, setSelected] = useState<string>('');
  const items = ITEMS.filter(i => i.id.toLowerCase().includes(term.trim().toLowerCase()));
  return (
    <div>
      {/* The trigger takes its accessible NAME from the associated label, the
          same way the sibling SelectTrigger does; its content carries the
          current value. */}
      <label htmlFor="picker">Registered Breed</label>
      <SearchablePopover<Item>
        id="picker"
        open={open}
        onOpenChange={next => {
          setOpen(next);
          if (!next) setTerm('');
        }}
        triggerLabel={selected || 'Select breed'}
        searchPlaceholder="Search breeds…"
        searchTerm={term}
        onSearchChange={setTerm}
        items={items}
        emptyMessage="No breeds match your search"
        listboxLabel="Breeds"
        selectedItemIds={selected ? [selected] : []}
        onSelect={item => {
          setSelected(item.id);
          setTerm('');
          onSelect(item);
        }}
        renderItem={item => <div className="p-3">{item.id}</div>}
      />
    </div>
  );
}

function getTrigger() {
  return screen.getByRole('combobox', { name: 'Registered Breed' });
}

async function openPicker(user: ReturnType<typeof userEvent.setup>) {
  const trigger = getTrigger();
  await user.click(trigger);
  await screen.findByPlaceholderText('Search breeds…');
  return trigger;
}

describe('SearchablePopover — combobox/listbox semantics', () => {
  it('gives the trigger combobox semantics wired to the listbox', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const trigger = getTrigger();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveAttribute('aria-haspopup', 'listbox');

    await openPicker(user);

    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const listbox = await screen.findByRole('listbox', { name: 'Breeds' });
    expect(trigger.getAttribute('aria-controls')).toBe(listbox.id);
    expect(trigger).toHaveAttribute('aria-activedescendant', listbox.children[0]?.id);
  });

  it('renders each result as an option and announces the selected one', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await openPicker(user);

    expect(await screen.findAllByRole('option')).toHaveLength(3);

    const labrador = screen.getByRole('option', { name: 'Labrador Retriever' });
    expect(labrador).toHaveAttribute('aria-selected', 'false');

    await user.click(labrador);

    // The combobox's VALUE is its content, the same shape the sibling
    // SelectTrigger uses — so the chosen breed is what gets announced after
    // the field's own name.
    await waitFor(() => expect(getTrigger()).toHaveTextContent('Labrador Retriever'));

    await user.click(getTrigger());
    expect(await screen.findByRole('option', { name: 'Labrador Retriever' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
  });

  it('resolves a searched result by option role (AC4)', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await openPicker(user);

    await user.type(screen.getByPlaceholderText('Search breeds…'), 'Labrador');

    expect(await screen.findByRole('option', { name: 'Labrador Retriever' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Beagle' })).toBeNull();
  });

  it('moves the active option with the arrow keys and selects it with Enter', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<Harness onSelect={onSelect} />);
    await openPicker(user);

    const search = screen.getByPlaceholderText('Search breeds…');
    await waitFor(() => expect(search).toHaveFocus());

    const optionIdFor = (name: string) => screen.getByRole('option', { name }).id;

    // Opens on the first option, then walks down and back up.
    expect(search).toHaveAttribute('aria-activedescendant', optionIdFor('Beagle'));
    await user.keyboard('{ArrowDown}');
    expect(search).toHaveAttribute('aria-activedescendant', optionIdFor('Golden Retriever'));
    await user.keyboard('{ArrowDown}');
    expect(search).toHaveAttribute('aria-activedescendant', optionIdFor('Labrador Retriever'));
    await user.keyboard('{ArrowUp}');
    expect(search).toHaveAttribute('aria-activedescendant', optionIdFor('Golden Retriever'));

    await user.keyboard('{Enter}');

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith({ id: 'Golden Retriever' });
    await waitFor(() => expect(getTrigger()).toHaveTextContent('Golden Retriever'));
  });
});
