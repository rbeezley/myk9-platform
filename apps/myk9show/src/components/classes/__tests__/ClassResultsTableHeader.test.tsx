/**
 * Tests for the ClassResultsTable header buttons (Requirements, Enter Scores, Add Entry).
 * Verifies button visibility is conditional on props and permissions.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ClassResultsTable } from '../ClassResultsTable';
import type { ScentWorkEntry, ScentWorkClassConfig } from '@/types/scent-work-types';
import { createUserPermissions } from '@/types/user-permissions';

// Minimal valid props for ClassResultsTable
function makeProps(overrides: Record<string, unknown> = {}) {
  const entries: ScentWorkEntry[] = [];
  const classConfig: ScentWorkClassConfig = {
    element: 'Detective',
    level: 'Unknown',
    timeLimit: '3:00',
    multiArea: false,
    warningsEnabled: true,
  };
  const userPermissions = createUserPermissions('secretary', 'user-1', 'Test User');

  return {
    entries,
    classConfig,
    userPermissions,
    onResultsSubmit: vi.fn(),
    ...overrides,
  };
}

function renderTable(props: ReturnType<typeof makeProps>) {
  return render(
    <MemoryRouter>
      <ClassResultsTable {...props} />
    </MemoryRouter>
  );
}

describe('ClassResultsTable header buttons', () => {
  it('shows Requirements button when onOpenRequirements is provided', () => {
    const onOpen = vi.fn();
    renderTable(makeProps({ onOpenRequirements: onOpen }));
    expect(screen.getByText('Requirements')).toBeInTheDocument();
  });

  it('hides Requirements button when onOpenRequirements is not provided', () => {
    renderTable(makeProps());
    expect(screen.queryByText('Requirements')).not.toBeInTheDocument();
  });

  it('calls onOpenRequirements when Requirements button is clicked', async () => {
    const onOpen = vi.fn();
    renderTable(makeProps({ onOpenRequirements: onOpen }));
    await userEvent.click(screen.getByText('Requirements'));
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it('shows Enter Scores button when classId is provided and user can edit', () => {
    renderTable(makeProps({ classId: 'class-1' }));
    expect(screen.getByText('Enter Scores')).toBeInTheDocument();
  });

  it('hides Enter Scores button when classId is not provided', () => {
    renderTable(makeProps());
    expect(screen.queryByText('Enter Scores')).not.toBeInTheDocument();
  });

  it('hides Enter Scores button when user cannot edit entries', () => {
    const readOnlyPerms = createUserPermissions('exhibitor', 'user-1', 'Test User');
    renderTable(makeProps({ classId: 'class-1', userPermissions: readOnlyPerms }));
    expect(screen.queryByText('Enter Scores')).not.toBeInTheDocument();
  });

  it('shows entry count badge in the header', () => {
    renderTable(makeProps());
    // Badge shows "0" for empty entries
    expect(screen.getByText('0')).toBeInTheDocument();
  });
});
