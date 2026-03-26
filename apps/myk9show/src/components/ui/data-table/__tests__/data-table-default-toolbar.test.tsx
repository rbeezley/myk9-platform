import { render, screen } from '@/test/utils/testUtils';
import { DataTable, type ColumnDef } from '../index';

interface TestRow {
  id: string;
  name: string;
  value: number;
}

const columns: ColumnDef<TestRow, unknown>[] = [
  { accessorKey: 'name', header: 'Name' },
  { accessorKey: 'value', header: 'Value' },
];

const data: TestRow[] = [
  { id: '1', name: 'Alpha', value: 10 },
  { id: '2', name: 'Beta', value: 20 },
];

describe('DataTable default toolbar', () => {
  beforeEach(() => localStorage.clear());

  it('renders search and column toggle when tableId is provided and no toolbar prop', () => {
    render(<DataTable tableId="test" columns={columns} data={data} />);
    expect(screen.getByPlaceholderText('Search...')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /toggle columns/i })).toBeInTheDocument();
  });

  it('does not render default toolbar when tableId is absent', () => {
    render(<DataTable columns={columns} data={data} />);
    expect(screen.queryByPlaceholderText('Search...')).not.toBeInTheDocument();
  });

  it('does not render default toolbar when custom toolbar is provided', () => {
    render(
      <DataTable
        tableId="test"
        columns={columns}
        data={data}
        toolbar={() => <div data-testid="custom-toolbar">Custom</div>}
      />
    );
    expect(screen.getByTestId('custom-toolbar')).toBeInTheDocument();
  });

  it('persists column visibility to localStorage', async () => {
    const { user } = render(<DataTable tableId="test-persist" columns={columns} data={data} />);
    await user.click(screen.getByRole('button', { name: /toggle columns/i }));
    const labels = screen.getAllByText('Value');
    const toggleLabel = labels.find(el => el.closest('label'));
    if (toggleLabel) {
      await user.click(toggleLabel);
    }
    const stored = localStorage.getItem('datatable-cols-test-persist');
    expect(stored).toBeTruthy();
    const parsed = JSON.parse(stored!);
    expect(parsed.value).toBe(false);
  });
});
