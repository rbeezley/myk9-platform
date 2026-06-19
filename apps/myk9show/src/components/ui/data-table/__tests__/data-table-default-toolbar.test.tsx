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

const pagedData: TestRow[] = Array.from({ length: 30 }, (_, index) => ({
  id: String(index + 1),
  name: `Row ${index + 1}`,
  value: index + 1,
}));

describe('DataTable default toolbar', () => {
  beforeEach(() => localStorage.clear());

  it('renders the standard toolbar controls when tableId is provided and no toolbar prop', () => {
    render(<DataTable tableId="test" columns={columns} data={data} />);
    expect(screen.getByPlaceholderText('Search...')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /toggle columns/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /export csv/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /compact density/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reset table view/i })).toBeInTheDocument();
  });

  it('hides the search box but keeps the column toggle when showSearch is false', () => {
    render(<DataTable tableId="test" columns={columns} data={data} showSearch={false} />);
    expect(screen.queryByPlaceholderText('Search...')).not.toBeInTheDocument();
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

  it('resets sorting, filters, density, page size, and column visibility', async () => {
    const { user } = render(<DataTable tableId="test-reset" columns={columns} data={pagedData} />);

    await user.click(screen.getByRole('button', { name: /toggle columns/i }));
    const labels = screen.getAllByText('Value');
    const toggleLabel = labels.find(el => el.closest('label'));
    if (toggleLabel) {
      await user.click(toggleLabel);
    }

    await user.click(screen.getByRole('button', { name: /compact density/i }));
    await user.selectOptions(screen.getByLabelText('Rows per page'), '50');

    expect(localStorage.getItem('datatable-density-test-reset')).toBe('compact');
    expect(localStorage.getItem('datatable-page-size-test-reset')).toBe('50');

    await user.click(screen.getByRole('button', { name: /reset table view/i }));

    expect(JSON.parse(localStorage.getItem('datatable-cols-test-reset')!)).toEqual({});
    expect(localStorage.getItem('datatable-density-test-reset')).toBe('comfortable');
    expect(localStorage.getItem('datatable-page-size-test-reset')).toBe('25');
    expect(screen.getByRole('columnheader', { name: /value/i })).toBeInTheDocument();
  });

  it('persists page size per table', async () => {
    const { user } = render(
      <DataTable tableId="test-page-size" columns={columns} data={pagedData} />
    );

    await user.selectOptions(screen.getByLabelText('Rows per page'), '50');

    expect(localStorage.getItem('datatable-page-size-test-page-size')).toBe('50');
  });

  it('exports visible filtered rows as CSV', async () => {
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const createObjectUrl = vi.fn(() => 'blob:table-export');
    const revokeObjectUrl = vi.fn();
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: createObjectUrl,
      revokeObjectURL: revokeObjectUrl,
    });

    const { user } = render(<DataTable tableId="test-export" columns={columns} data={data} />);

    await user.click(screen.getByRole('button', { name: /export csv/i }));

    expect(createObjectUrl).toHaveBeenCalledWith(expect.any(Blob));
    expect(clickSpy).toHaveBeenCalled();

    clickSpy.mockRestore();
    vi.unstubAllGlobals();
  });
});
