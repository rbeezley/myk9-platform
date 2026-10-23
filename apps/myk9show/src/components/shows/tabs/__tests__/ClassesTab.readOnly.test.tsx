import { render, screen } from '@/test/utils/testUtils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClassesTab, type ClassInfo } from '../ClassesTab';

// MYK9-1337: the Classes tab is the exhibitor / public list. A manager lands on the show home,
// whose schedule manages classes (Select classes, MYK9-1324), so the tab carries none of the old
// Setup controls. The scope hook is mocked to say "can manage" and the judge read is spied on:
// the tab must ignore both, so a manage control can never come back through either door.
vi.mock('@/hooks/useShowManageScope', () => ({
  useShowManageScope: () => ({ status: 'resolved', canManage: true, canOperate: true }),
}));
const judgesQuery = vi.hoisted(() => vi.fn(() => ({ data: [] })));
vi.mock('@/hooks/queries/useJudgesWithQualifications', () => ({
  useJudgesWithQualifications: judgesQuery,
}));

function makeClass(id: string, patch: Partial<ClassInfo> = {}): ClassInfo {
  return {
    id,
    name: `Class ${id}`,
    element: 'Containers',
    level: 'Novice',
    section: '',
    judgeName: 'Jane Judge',
    trialId: 't1',
    trialDate: '2026-08-01',
    trialNumber: '1',
    time: '9:00 AM',
    ring: 1,
    status: 'Scheduled',
    entryCount: 3,
    userHasEntry: false,
    classOrder: 2,
    ...patch,
  };
}

const classes = [
  makeClass('c1'),
  makeClass('c2', { element: 'Exterior', trialId: 't2', trialNumber: '2', classOrder: 1 }),
];

const renderTab = () => render(<ClassesTab classes={classes} showId="s1" userHasEntries={false} />);

function expectNoManageControls() {
  expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
  expect(screen.queryByRole('combobox', { name: /^Judge for/ })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /^Class actions for/ })).not.toBeInTheDocument();
  expect(screen.queryByRole('toolbar', { name: 'Bulk actions' })).not.toBeInTheDocument();
  expect(screen.queryByRole('combobox', { name: 'Trial' })).not.toBeInTheDocument();
  expect(screen.queryByRole('combobox', { name: 'Element' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Add Classes' })).not.toBeInTheDocument();
  expect(screen.queryByText(/^Order:/)).not.toBeInTheDocument();
}

describe('ClassesTab is read-only (MYK9-1337)', () => {
  beforeEach(() => {
    localStorage.clear();
    judgesQuery.mockClear();
  });

  it('cards: every trial listed, the judge as text, no manage control', () => {
    renderTab();

    // Positive control: the classes and their judge are on screen, so absence means something.
    expect(screen.getByText('Containers')).toBeInTheDocument();
    expect(screen.getByText('Exterior')).toBeInTheDocument();
    expect(screen.getAllByText('Judge: Jane Judge')).toHaveLength(2);
    expectNoManageControls();
  });

  it('table: one search, the judge as text, no manage control', () => {
    localStorage.setItem('view-pref-classes', 'table');
    const { container } = renderTab();

    expect(container.querySelector('table')).not.toBeNull();
    expect(screen.getAllByText('Jane Judge')).toHaveLength(2);
    expect(screen.getAllByPlaceholderText(/search/i)).toHaveLength(1);
    expectNoManageControls();
  });

  it('never reads the judge list, which only the removed picker needed', () => {
    renderTab();
    expect(judgesQuery).not.toHaveBeenCalled();
  });
});
