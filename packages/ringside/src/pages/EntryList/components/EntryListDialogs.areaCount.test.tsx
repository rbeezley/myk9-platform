/**
 * MYK9-1625: the area count picker prompts, it does not block. Dismissing it leaves
 * the list where it is (it used to navigate back), and the class options dialog is
 * offered a way to reopen it only for a manager of a flexible-area class.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { AreaCountSelectionDialogProps, ClassOptionsDialogProps } from '../dialogSlots';
import type { EntryListPermission } from '../permissions';
import { EntryListDialogs } from './EntryListDialogs';

const navigate = vi.hoisted(() => vi.fn());
vi.mock('react-router-dom', async importOriginal => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
}));

const spy: {
  area?: AreaCountSelectionDialogProps;
  options?: ClassOptionsDialogProps;
} = {};
const Null = () => null;
const AreaStub = (props: AreaCountSelectionDialogProps) => {
  spy.area = props;
  return null;
};
const OptionsStub = (props: ClassOptionsDialogProps) => {
  spy.options = props;
  return null;
};

function setup(over: { canManage?: boolean; requirements?: boolean; combined?: boolean } = {}) {
  const { canManage = true, requirements = true, combined = false } = over;
  const setAreaCountDialogOpen = vi.fn();
  const setClassOptionsDialogOpen = vi.fn();
  const refresh = vi.fn();
  const props = {
    classId: 'c1',
    ...(combined ? { combined: { a: 'c1', b: 'c2' } } : {}),
    classInfo: {
      className: 'Interior Master',
      element: 'Interior',
      level: 'Master',
      totalEntries: 0,
      completedEntries: 0,
    },
    localEntries: [],
    hasPermission: (permission: EntryListPermission) =>
      permission === 'canManageClasses' ? canManage : true,
    hideMaxTimeOption: false,
    hideSettingsOption: false,
    setClassOptionsDialogOpen,
    setAreaCountDialogOpen,
    areaCountDialogOpen: true,
    areaCountRequirements: requirements ? { min: 2, max: 3, maxTotalSeconds: 0 } : null,
    refresh,
    classOptionsDialogOpen: true,
    resetConfirmDialog: { show: false, entry: null },
    CheckinStatusDialog: Null,
    RunOrderDialog: Null,
    ClassOptionsDialog: OptionsStub,
    ClassRequirementsDialog: Null,
    MaxTimeDialog: Null,
    ClassSettingsDialog: Null,
    NoStatsDialog: Null,
    ClassStatusDialog: Null,
    AreaCountSelectionDialog: AreaStub,
  } as unknown as React.ComponentProps<typeof EntryListDialogs>;
  render(
    <MemoryRouter>
      <EntryListDialogs {...props} />
    </MemoryRouter>
  );
  return { setAreaCountDialogOpen, setClassOptionsDialogOpen, refresh };
}

describe('EntryListDialogs area count (MYK9-1625)', () => {
  beforeEach(() => {
    navigate.mockReset();
    delete spy.area;
    delete spy.options;
  });

  it('dismissing the picker closes it and does not leave the list', () => {
    const { setAreaCountDialogOpen } = setup();
    spy.area?.onClose();
    expect(setAreaCountDialogOpen).toHaveBeenCalledWith(false);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('saving closes the picker and refreshes the list', () => {
    const { setAreaCountDialogOpen, refresh } = setup();
    spy.area?.onSave(3);
    expect(setAreaCountDialogOpen).toHaveBeenCalledWith(false);
    expect(refresh).toHaveBeenCalled();
  });

  it('the class menu reopens the picker for a manager', () => {
    const { setAreaCountDialogOpen, setClassOptionsDialogOpen } = setup();
    spy.options?.onAreaCount?.();
    expect(setClassOptionsDialogOpen).toHaveBeenCalledWith(false);
    expect(setAreaCountDialogOpen).toHaveBeenCalledWith(true);
  });

  it.each([
    ['someone who cannot manage classes', { canManage: false }],
    ['a class whose area count is not a choice', { requirements: false }],
    ['a combined A/B list', { combined: true }],
  ])('offers no way to reopen the picker to %s', (_name, over) => {
    setup(over);
    expect(spy.options?.onAreaCount).toBeUndefined();
  });
});
