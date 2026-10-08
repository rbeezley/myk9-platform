import { useState } from 'react';
import { afterAll, beforeAll, describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, userEvent } from '@/test/utils/testUtils';
import { ListFilterMenu } from '../ListFilterMenu';
import type { ListFilterMenuField } from '../types';

const CLASSES = [
  { value: 'c1', label: 'Interior Novice B', count: 4 },
  { value: 'c2', label: 'Exterior Excellent', count: 7 },
  { value: 'c3', label: 'Containers Advanced', count: 1 },
];

/** A page's state around the menu, so a pick re-renders the way it does in the app. */
function Harness({
  onClassChange = vi.fn(),
  initial = [],
  loading = false,
}: {
  onClassChange?: (values: string[]) => void;
  initial?: string[];
  loading?: boolean;
}) {
  const [classes, setClasses] = useState<string[]>(initial);
  const [trial, setTrial] = useState<string | null>(null);
  const fields: ListFilterMenuField[] = [
    {
      kind: 'options',
      key: 'trial',
      label: 'Trial',
      value: trial,
      onChange: setTrial,
      options: [
        { value: 't1', label: 'Trial 1', count: 6 },
        { value: 't2', label: 'Trial 2', count: 6 },
      ],
    },
    {
      kind: 'multiOptions',
      key: 'class',
      label: 'Class',
      values: classes,
      loading,
      onChange: values => {
        setClasses(values);
        onClassChange(values);
      },
      options: CLASSES,
    },
  ];
  return <ListFilterMenu fields={fields} />;
}

async function openMenu() {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: /^Filter/ }));
  return user;
}

describe('ListFilterMenu', () => {
  // cmdk scrolls the highlighted row into view; jsdom has no layout, so no scrollIntoView.
  const originalScrollIntoView = Element.prototype.scrollIntoView;
  beforeAll(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });
  afterAll(() => {
    Element.prototype.scrollIntoView = originalScrollIntoView;
  });

  it('opens from the labelled button and lists every field with its values and counts', async () => {
    render(<Harness />);
    expect(screen.queryByRole('option')).not.toBeInTheDocument();

    await openMenu();

    expect(screen.getByText('Trial')).toBeInTheDocument();
    expect(screen.getByText('Class')).toBeInTheDocument();
    const exterior = screen.getByRole('option', { name: /Exterior Excellent/ });
    expect(exterior).toHaveTextContent('7');
  });

  it('keeps the menu open while several values are ticked, and unticks on a second pick', async () => {
    const onClassChange = vi.fn();
    render(<Harness onClassChange={onClassChange} />);
    const user = await openMenu();

    await user.click(screen.getByRole('option', { name: /Interior Novice B/ }));
    await user.click(screen.getByRole('option', { name: /Exterior Excellent/ }));
    expect(onClassChange).toHaveBeenLastCalledWith(['c1', 'c2']);
    expect(screen.getByRole('option', { name: /Containers Advanced/ })).toBeInTheDocument();

    await user.click(screen.getByRole('option', { name: /Interior Novice B/ }));
    expect(onClassChange).toHaveBeenLastCalledWith(['c2']);
  });

  it('marks ticked rows for screen readers and shows how many filters are applied', async () => {
    render(<Harness initial={['c2']} />);
    expect(screen.getByRole('button', { name: 'Filter, 1 applied' })).toBeInTheDocument();

    await openMenu();

    expect(screen.getByRole('option', { name: /Exterior Excellent/ })).toHaveTextContent(
      'Selected'
    );
    expect(screen.getByRole('option', { name: /Interior Novice B/ })).not.toHaveTextContent(
      'Selected'
    );
  });

  it('narrows the values as you type, across fields, and says so when nothing matches', async () => {
    render(<Harness />);
    const user = await openMenu();

    await user.type(screen.getByPlaceholderText('Filter by…'), 'trial 2');
    expect(screen.getByRole('option', { name: /Trial 2/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Exterior Excellent/ })).not.toBeInTheDocument();

    await user.clear(screen.getByPlaceholderText('Filter by…'));
    await user.type(screen.getByPlaceholderText('Filter by…'), 'zzz');
    expect(screen.getByText('No matches.')).toBeInTheDocument();
  });

  it('lets a single-select field be picked and cleared by picking it again', async () => {
    render(<Harness />);
    const user = await openMenu();

    await user.click(screen.getByRole('option', { name: /Trial 1/ }));
    expect(screen.getByRole('option', { name: /Trial 1/ })).toHaveTextContent('Selected');

    await user.click(screen.getByRole('option', { name: /Trial 1/ }));
    expect(screen.getByRole('option', { name: /Trial 1/ })).not.toHaveTextContent('Selected');
  });

  it('says Loading while a field has no options yet, instead of listing none', async () => {
    render(<Harness loading />);
    await openMenu();

    expect(screen.getByText('Loading…')).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Interior Novice B/ })).not.toBeInTheDocument();
  });

  it('says Loading for a single-select field whose options are not known yet', async () => {
    const fields: ListFilterMenuField[] = [
      {
        kind: 'options',
        key: 'trial',
        label: 'Trial',
        value: 't1',
        options: [],
        loading: true,
        onChange: vi.fn(),
      },
    ];
    render(<ListFilterMenu fields={fields} />);
    await openMenu();

    expect(screen.getByText('Loading…')).toBeInTheDocument();
    expect(screen.queryByText('Nothing to choose yet.')).not.toBeInTheDocument();
  });

  it('keeps the Loading message when you type, and never says No matches next to it', async () => {
    const fields: ListFilterMenuField[] = [
      {
        kind: 'multiOptions',
        key: 'class',
        label: 'Class',
        values: [],
        options: [],
        loading: true,
        onChange: vi.fn(),
      },
    ];
    render(<ListFilterMenu fields={fields} />);
    const user = await openMenu();

    expect(screen.getByText('Loading…')).toBeInTheDocument();
    expect(screen.queryByText('No matches.')).not.toBeInTheDocument();

    await user.type(screen.getByPlaceholderText('Filter by…'), 'zzz');
    expect(screen.getByText('Loading…')).toBeInTheDocument();
    expect(screen.queryByText('No matches.')).not.toBeInTheDocument();
  });

  it('says there is nothing to choose, not No matches, when a field has no values', async () => {
    const fields: ListFilterMenuField[] = [
      {
        kind: 'multiOptions',
        key: 'class',
        label: 'Class',
        values: [],
        options: [],
        onChange: vi.fn(),
      },
    ];
    render(<ListFilterMenu fields={fields} />);
    await openMenu();

    expect(screen.getByText('Nothing to choose yet.')).toBeInTheDocument();
    expect(screen.queryByText('No matches.')).not.toBeInTheDocument();
  });

  it('closes on Escape', async () => {
    render(<Harness />);
    const user = await openMenu();
    expect(screen.getByRole('option', { name: /Trial 1/ })).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('option', { name: /Trial 1/ })).not.toBeInTheDocument();
  });

  describe('the F shortcut', () => {
    it('opens the menu', async () => {
      render(<Harness />);
      const user = userEvent.setup();

      await user.keyboard('f');
      expect(screen.getByRole('option', { name: /Trial 1/ })).toBeInTheDocument();
    });

    it('does nothing while typing in a text field', async () => {
      render(
        <>
          <input aria-label="Search" />
          <Harness />
        </>
      );
      const user = userEvent.setup();

      await user.click(screen.getByLabelText('Search'));
      await user.keyboard('f');

      expect(screen.getByLabelText('Search')).toHaveValue('f');
      expect(screen.queryByRole('option', { name: /Trial 1/ })).not.toBeInTheDocument();
    });

    it('only opens: pressing it again never closes the menu', () => {
      render(<Harness />);

      fireEvent.keyDown(document.body, { key: 'f' });
      fireEvent.keyDown(document.body, { key: 'f' });

      expect(screen.getByRole('option', { name: /Trial 1/ })).toBeInTheDocument();
    });

    it.each([
      ['Base UI', { 'data-open': '' }],
      ['Radix', { 'data-state': 'open' }],
    ])('does nothing while a dialog is open (%s markup)', (_kind, attributes) => {
      render(
        <>
          <div role="dialog" {...attributes} />
          <Harness />
        </>
      );

      fireEvent.keyDown(document.body, { key: 'f' });

      expect(screen.queryByRole('option', { name: /Trial 1/ })).not.toBeInTheDocument();
    });

    it('ignores key events that carry no key', () => {
      render(<Harness />);

      expect(() => fireEvent.keyDown(document.body, {})).not.toThrow();
      expect(screen.queryByRole('option', { name: /Trial 1/ })).not.toBeInTheDocument();
    });

    it('does nothing with Ctrl held', async () => {
      render(<Harness />);
      const user = userEvent.setup();

      await user.keyboard('{Control>}f{/Control}');

      expect(screen.queryByRole('option', { name: /Trial 1/ })).not.toBeInTheDocument();
    });

    it('lets the letter reach the menu search box instead of toggling the menu', async () => {
      render(<Harness />);
      const user = await openMenu();

      await user.type(screen.getByPlaceholderText('Filter by…'), 'f');

      expect(screen.getByPlaceholderText('Filter by…')).toHaveValue('f');
    });
  });
});
