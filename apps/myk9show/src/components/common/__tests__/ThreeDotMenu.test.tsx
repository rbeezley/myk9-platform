import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { render } from '@/test/utils/testUtils';
import ThreeDotMenu from '../ThreeDotMenu';

describe('ThreeDotMenu', () => {
  it('renders View / Edit / Delete with default labels', async () => {
    const { user } = render(<ThreeDotMenu onView={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /more actions/i }));
    await screen.findByRole('menu');

    expect(screen.getByRole('menuitem', { name: /^view$/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /edit profile/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /delete/i })).toBeInTheDocument();
  });

  it('honors custom view/edit labels', async () => {
    const { user } = render(
      <ThreeDotMenu
        onView={vi.fn()}
        onEdit={vi.fn()}
        viewLabel="View Person"
        editLabel="Edit Person"
      />
    );
    await user.click(screen.getByRole('button', { name: /more actions/i }));
    await screen.findByRole('menu');

    expect(screen.getByRole('menuitem', { name: /view person/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /edit person/i })).toBeInTheDocument();
    expect(screen.queryByText('Edit User')).not.toBeInTheDocument();
  });

  it('hides Edit when hideEdit is set', async () => {
    const { user } = render(<ThreeDotMenu onView={vi.fn()} onEdit={vi.fn()} hideEdit />);
    await user.click(screen.getByRole('button', { name: /more actions/i }));
    await screen.findByRole('menu');

    expect(screen.queryByRole('menuitem', { name: /edit/i })).not.toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /^view$/i })).toBeInTheDocument();
  });

  it('shows Manage Qualifications only when enabled', async () => {
    const onManageQualifications = vi.fn();
    const { user } = render(
      <ThreeDotMenu
        onView={vi.fn()}
        showManageQualifications
        onManageQualifications={onManageQualifications}
      />
    );
    await user.click(screen.getByRole('button', { name: /more actions/i }));
    await user.click(await screen.findByRole('menuitem', { name: /manage qualifications/i }));
    expect(onManageQualifications).toHaveBeenCalledTimes(1);
  });

  it('renders the account lifecycle action with its disabled reason', async () => {
    const { user } = render(
      <ThreeDotMenu
        onChangeStatus={vi.fn()}
        changeStatusLabel="Suspend account"
        changeStatusDisabled
        changeStatusDescription="You cannot suspend your own account"
      />
    );

    await user.click(screen.getByRole('button', { name: /more actions/i }));
    const statusItem = await screen.findByRole('menuitem', { name: /suspend account/i });

    expect(statusItem).toHaveAttribute('data-disabled');
    expect(statusItem).toHaveTextContent('You cannot suspend your own account');
  });

  it('invokes the matching callback and styles Delete with the destructive token', async () => {
    const onDelete = vi.fn();
    const { user } = render(<ThreeDotMenu onView={vi.fn()} onDelete={onDelete} />);
    await user.click(screen.getByRole('button', { name: /more actions/i }));

    const deleteItem = await screen.findByRole('menuitem', { name: /delete/i });
    expect(deleteItem).toHaveClass('text-destructive');
    expect(deleteItem.className).not.toContain('text-red-600');

    await user.click(deleteItem);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});
