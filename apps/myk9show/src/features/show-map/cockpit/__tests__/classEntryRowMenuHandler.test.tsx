import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { render } from '@/test/utils/testUtils';
import { ClassEntryRowMenu } from '../ClassEntryRowMenu';
import type { SecretaryCockpitClassEntry } from '../cockpitClassEntries';
import { queueFor } from './queueFixture';

const h = vi.hoisted(() => ({ online: true }));

vi.mock('@/hooks/useNetworkStatus', async importOriginal => ({
  ...(await importOriginal<typeof import('@/hooks/useNetworkStatus')>()),
  useIsOnline: () => h.online,
}));

const row: SecretaryCockpitClassEntry = {
  nodeId: 'entry:e-1',
  queue: queueFor('entry:e-1', '101', 'waiting'),
  entryId: 'e-1',
  armband: '101',
  dogName: 'Moss',
  checkIn: { value: 'at-gate', label: 'At gate', kind: 'muted' },
  checkInValue: 'at-gate',
  deskEditable: true,
  lockedReason: null,
  state: 'pending',
  counted: true,
  notCheckedIn: false,
  place: null,
  result: null,
};

function renderMenu(onChangeHandler?: (entry: SecretaryCockpitClassEntry) => void) {
  return render(
    <ClassEntryRowMenu
      entry={row}
      actions={[]}
      onCommand={vi.fn()}
      editEntryHref="/entries?edit=e-1"
      classId="class-1"
      onMarkAbsent={vi.fn()}
      onPrintLabel={vi.fn()}
      classLifecycle={null}
      onChangeHandler={onChangeHandler}
    />
  );
}

describe('Show Desk Change handler (MYK9-1940)', () => {
  beforeEach(() => {
    h.online = true;
  });

  it('opens in place with one tap, not a link to Entry Management', async () => {
    const onChangeHandler = vi.fn();
    const { user } = renderMenu(onChangeHandler);
    await user.click(screen.getByRole('button', { name: /^Actions for #101 Moss/ }));
    const item = await screen.findByRole('menuitem', { name: 'Change handler' });
    expect(item).not.toHaveAttribute('href');
    await user.click(item);
    expect(onChangeHandler).toHaveBeenCalledWith(row);
  });

  it('still links to Entry Management when the stored entry is not at hand', async () => {
    const { user } = renderMenu();
    await user.click(screen.getByRole('button', { name: /^Actions for #101 Moss/ }));
    expect(await screen.findByRole('menuitem', { name: 'Change handler' })).toHaveAttribute(
      'href',
      '/entries?edit=e-1'
    );
  });

  it('is disabled offline and says why', async () => {
    h.online = false;
    const onChangeHandler = vi.fn();
    const { user } = renderMenu(onChangeHandler);
    await user.click(screen.getByRole('button', { name: /^Actions for #101 Moss/ }));
    const item = await screen.findByRole('menuitem', { name: /Change handler/ });
    expect(item).toHaveAttribute('aria-disabled', 'true');
    await user.click(item);
    expect(onChangeHandler).not.toHaveBeenCalled();
  });
});
