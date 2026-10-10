/**
 * MYK9-1086: the entry list's actions menu offers a way back to the main app
 * when the host supplies one.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ActionsDropdownMenu } from './entryListHeaderHelpers';

const renderMenu = (exitToApp?: { label: string; onClick: () => void }) => {
  const onClose = vi.fn();
  render(
    <ActionsDropdownMenu
      isOpen
      onToggle={vi.fn()}
      onClose={onClose}
      isRefreshing={false}
      onRefresh={vi.fn()}
      actionsMenu={{ printOptions: [], ...(exitToApp ? { exitToApp } : {}) }}
    />
  );
  return onClose;
};

describe('ActionsDropdownMenu exit to main app', () => {
  it('shows the exit item and closes the menu before leaving', () => {
    const onClick = vi.fn();
    const onClose = renderMenu({ label: 'Back to main app', onClick });
    fireEvent.click(screen.getByRole('button', { name: 'Back to main app' }));
    expect(onClose).toHaveBeenCalled();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('shows no exit item when the host supplies none', () => {
    renderMenu();
    expect(screen.queryByRole('button', { name: 'Back to main app' })).toBeNull();
  });
});
