import { screen, fireEvent } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { type ColumnDef } from '@tanstack/react-table';
import { DataTable } from '../index';
import { EditableCell } from '../data-table-editable-cell';
import type { EditComponentProps } from '../types';

// Mock notifications
vi.mock('@/lib/notifications', () => ({
  notifications: {
    error: vi.fn(),
  },
}));

import { notifications } from '@/lib/notifications';

interface TestRow {
  id: string;
  name: string;
  score: string;
  status: string;
}

const testData: TestRow[] = [
  { id: '1', name: 'Alice', score: '95', status: 'pass' },
  { id: '2', name: 'Bob', score: '80', status: 'fail' },
];

// Helper to make a minimal EditableCell outside of a table
function renderEditableCell(overrides?: Partial<React.ComponentProps<typeof EditableCell>>) {
  const defaultProps: React.ComponentProps<typeof EditableCell> = {
    value: 'hello',
    editType: 'text',
    row: {} as never,
    column: { id: 'name' } as never,
    children: <span data-testid="display">hello</span>,
    ...overrides,
  };
  return render(<EditableCell {...defaultProps} />);
}

describe('EditableCell', () => {
  it('renders display content (children) when not editing', () => {
    renderEditableCell({ children: <span data-testid="display">hello</span> });
    expect(screen.getByTestId('display')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('enters edit mode on click', async () => {
    const { user } = renderEditableCell({
      value: 'hello',
      editType: 'text',
      children: <span data-testid="display">hello</span>,
    });
    const cell = screen.getByTestId('display').closest('[data-editable-cell]')!;
    await user.click(cell);
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('shows text input for editType text', async () => {
    const { user } = renderEditableCell({ editType: 'text', value: 'foo' });
    const cell = screen.getByTestId('display').closest('[data-editable-cell]')!;
    await user.click(cell);
    const input = screen.getByRole('textbox');
    expect(input).toBeInTheDocument();
    expect(input.tagName).toBe('INPUT');
    expect((input as HTMLInputElement).type).toBe('text');
  });

  it('shows number input for editType number', async () => {
    const { user } = renderEditableCell({ editType: 'number', value: '42' });
    const cell = screen.getByTestId('display').closest('[data-editable-cell]')!;
    await user.click(cell);
    // number input doesn't get role=spinbutton in jsdom for some cases; query by type
    const input = document.querySelector('input[type="number"]') as HTMLInputElement;
    expect(input).toBeInTheDocument();
  });

  it('shows select for editType select with options', async () => {
    const options = [
      { label: 'Pass', value: 'pass' },
      { label: 'Fail', value: 'fail' },
    ];
    const { user } = renderEditableCell({
      editType: 'select',
      value: 'pass',
      editOptions: options,
    });
    const cell = screen.getByTestId('display').closest('[data-editable-cell]')!;
    await user.click(cell);
    const select = screen.getByRole('combobox');
    expect(select).toBeInTheDocument();
    expect(screen.getByText('Pass')).toBeInTheDocument();
    expect(screen.getByText('Fail')).toBeInTheDocument();
  });

  it('cancels edit on Escape and reverts value', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { user } = renderEditableCell({
      value: 'original',
      editType: 'text',
      onSave,
      children: <span data-testid="display">original</span>,
    });
    const cell = screen.getByTestId('display').closest('[data-editable-cell]')!;
    await user.click(cell);

    const input = screen.getByRole('textbox');
    await user.clear(input);
    await user.type(input, 'changed');
    await user.keyboard('{Escape}');

    // Should exit edit mode without saving
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('shows validation error when validate returns an error string', async () => {
    const validate = (v: unknown) => (String(v).length < 3 ? 'Too short' : null);
    const { user } = renderEditableCell({
      value: 'ok',
      editType: 'text',
      validate,
    });
    const cell = screen.getByTestId('display').closest('[data-editable-cell]')!;
    await user.click(cell);

    const input = screen.getByRole('textbox');
    await user.clear(input);
    await user.type(input, 'ab');
    // Trigger commit via blur
    fireEvent.blur(input);

    expect(screen.getByText('Too short')).toBeInTheDocument();
  });

  it('shows dirty indicator when value has changed', async () => {
    const { user } = renderEditableCell({
      value: 'original',
      editType: 'text',
    });
    const cell = screen.getByTestId('display').closest('[data-editable-cell]')!;
    await user.click(cell);

    const input = screen.getByRole('textbox');
    await user.clear(input);
    await user.type(input, 'changed');

    // The wrapper should have dirty indicator class
    expect(cell).toHaveClass('border-l-2');
  });

  it('click on editable cell stops propagation', async () => {
    const outerClick = vi.fn();
    const { user } = render(
      <div onClick={outerClick}>
        <EditableCell
          value="test"
          editType="text"
          row={{} as never}
          column={{ id: 'name' } as never}
        >
          <span data-testid="display">test</span>
        </EditableCell>
      </div>
    );
    const cell = screen.getByTestId('display').closest('[data-editable-cell]')!;
    await user.click(cell);
    expect(outerClick).not.toHaveBeenCalled();
  });

  it('calls onSave when value is committed via blur', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { user } = renderEditableCell({
      value: 'original',
      editType: 'text',
      onSave,
    });
    const cell = screen.getByTestId('display').closest('[data-editable-cell]')!;
    await user.click(cell);

    const input = screen.getByRole('textbox');
    await user.clear(input);
    await user.type(input, 'newvalue');
    fireEvent.blur(input);

    expect(onSave).toHaveBeenCalledWith('newvalue');
  });

  it('shows toast error and reverts when onSave rejects', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('Server error'));
    const { user } = renderEditableCell({
      value: 'original',
      editType: 'text',
      onSave,
      children: <span data-testid="display">original</span>,
    });
    const cell = screen.getByTestId('display').closest('[data-editable-cell]')!;
    await user.click(cell);

    const input = screen.getByRole('textbox');
    await user.clear(input);
    await user.type(input, 'newvalue');
    fireEvent.blur(input);

    // Wait for the async save to fail
    await new Promise(r => setTimeout(r, 50));

    expect(notifications.error).toHaveBeenCalledWith('Server error');
    // Should exit edit mode (reverted)
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('renders custom editor for editType custom', async () => {
    const CustomEditor = ({ onChange, onCommit }: EditComponentProps<unknown>) => (
      <input
        data-testid="custom-editor"
        onChange={e => onChange(e.target.value)}
        onBlur={onCommit}
      />
    );
    const { user } = renderEditableCell({
      editType: 'custom',
      editComponent: CustomEditor,
      value: 'foo',
    });
    const cell = screen.getByTestId('display').closest('[data-editable-cell]')!;
    await user.click(cell);
    expect(screen.getByTestId('custom-editor')).toBeInTheDocument();
  });
});

// Keyboard navigation tests require a real table context with multiple editable cells
describe('EditableCell keyboard navigation', () => {
  function buildColumns(): ColumnDef<TestRow>[] {
    return [
      {
        accessorKey: 'name',
        header: 'Name',
        cell: ({ getValue, row, column }) => (
          <EditableCell
            value={getValue()}
            editType="text"
            row={row as never}
            column={column as never}
          >
            <span>{String(getValue())}</span>
          </EditableCell>
        ),
        meta: { editable: true },
      },
      {
        accessorKey: 'score',
        header: 'Score',
        cell: ({ getValue, row, column }) => (
          <EditableCell
            value={getValue()}
            editType="text"
            row={row as never}
            column={column as never}
          >
            <span>{String(getValue())}</span>
          </EditableCell>
        ),
        meta: { editable: true },
      },
    ];
  }

  it('Tab advances focus to the next editable cell', async () => {
    const { user } = render(<DataTable columns={buildColumns()} data={testData} />);

    // Click on first editable cell (Alice / name)
    const aliceNameCell = screen.getAllByText('Alice')[0].closest('[data-editable-cell]')!;
    await user.click(aliceNameCell);
    expect(screen.getByRole('textbox')).toBeInTheDocument();

    // Press Tab — should move to the next data-editable-cell
    await user.keyboard('{Tab}');

    // There should still be exactly one input visible (new cell active)
    expect(screen.getByRole('textbox')).toBeInTheDocument();
    // The previously-active cell's input was committed and closed
    // The new active input should be in the score column (95)
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('95');
  });

  it('Enter advances focus to the same column in the next row', async () => {
    const { user } = render(<DataTable columns={buildColumns()} data={testData} />);

    // Click Alice's name cell
    const aliceNameCell = screen.getAllByText('Alice')[0].closest('[data-editable-cell]')!;
    await user.click(aliceNameCell);
    expect(screen.getByRole('textbox')).toBeInTheDocument();

    // Press Enter — should move to same column, next row (Bob's name)
    await user.keyboard('{Enter}');

    expect(screen.getByRole('textbox')).toBeInTheDocument();
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('Bob');
  });
});
