import { render, screen, waitFor, fireEvent } from '@/test/utils/testUtils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const navigateMock = vi.fn();
const createRoleMock = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useParams: () => ({ roleId: 'role-1' }), useNavigate: () => navigateMock };
});

const source = vi.hoisted(() => ({
  id: 'role-1',
  name: 'steward',
  description: null,
  is_system: false,
  permissions: null,
  created_at: null,
  display_name: 'Steward',
}));

vi.mock('@/services/rbac/RBACService', () => ({
  rbacService: {
    getAllPermissions: vi.fn().mockResolvedValue([]),
    getAllRoles: vi
      .fn()
      .mockResolvedValue([{ ...source, id: 'role-9', name: 'taken_name', display_name: 'Taken' }]),
    getRole: vi.fn().mockResolvedValue(source),
    getRolePermissions: vi.fn().mockResolvedValue([]),
    createRole: (...a: unknown[]) => createRoleMock(...a),
    clearAllCache: vi.fn(),
  },
}));

describe('role forms: field callouts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Clone: callouts under display name, role name and the permissions group', async () => {
    const { default: CloneRolePage } = await import('../CloneRolePage');
    render(<CloneRolePage />);
    const display = await screen.findByLabelText(/display name/i);
    fireEvent.change(display, { target: { value: '' } });
    fireEvent.change(screen.getByLabelText(/^role name/i), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /create cloned role/i }));

    expect(createRoleMock).not.toHaveBeenCalled();
    expect(screen.getByText('Enter a display name.')).toBeInTheDocument();
    expect(screen.getByText('Enter a role name.')).toBeInTheDocument();
    expect(screen.getByText('Select at least one permission.')).toBeInTheDocument();
    expect(display).toHaveAttribute('aria-invalid', 'true');
    expect(display).toHaveAttribute('aria-describedby', 'display-name-error');
    expect(display).toHaveFocus();
    const group = screen.getByRole('group', { name: 'Permissions' });
    expect(group).toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByText(/is required/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/must be selected/i)).not.toBeInTheDocument();

    fireEvent.change(display, { target: { value: 'Senior' } });
    expect(screen.queryByText('Enter a display name.')).not.toBeInTheDocument();
  });

  it('Create: a duplicate name sends you back to that field with the callout', async () => {
    const { default: CreateRolePage } = await import('../CreateRolePage');
    render(<CreateRolePage />);
    await waitFor(() => expect(screen.getByLabelText(/display name/i)).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/display name/i), { target: { value: 'Taken' } });
    fireEvent.change(screen.getByLabelText(/^role name/i), { target: { value: 'TAKEN_NAME' } });
    fireEvent.click(screen.getByRole('button', { name: /next: permissions/i }));
    fireEvent.click(screen.getByRole('button', { name: /next: review/i }));
    fireEvent.click(screen.getByRole('button', { name: /create role/i }));

    expect(createRoleMock).not.toHaveBeenCalled();
    const name = await screen.findByLabelText(/^role name/i);
    expect(screen.getByText('A role with this name already exists.')).toBeInTheDocument();
    expect(name).toHaveAttribute('aria-invalid', 'true');
    await waitFor(() => expect(name).toHaveFocus());
  });

  it('Create: no permissions returns to the permissions step with the callout focused', async () => {
    const { default: CreateRolePage } = await import('../CreateRolePage');
    render(<CreateRolePage />);
    await waitFor(() => expect(screen.getByLabelText(/display name/i)).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/display name/i), { target: { value: 'New' } });
    fireEvent.change(screen.getByLabelText(/^role name/i), { target: { value: 'new_one' } });
    fireEvent.click(screen.getByRole('button', { name: /next: permissions/i }));
    fireEvent.click(screen.getByRole('button', { name: /next: review/i }));
    fireEvent.click(screen.getByRole('button', { name: /create role/i }));

    const group = await screen.findByRole('group', { name: 'Permissions' });
    expect(screen.getByText('Select at least one permission.')).toBeInTheDocument();
    expect(group).toHaveAttribute('aria-describedby', 'role-permissions-error');
    await waitFor(() => expect(group).toHaveFocus());
    expect(screen.queryByText(/must be selected/i)).not.toBeInTheDocument();
  });
});
