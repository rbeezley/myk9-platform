import { describe, expect, it, vi } from 'vitest';
import { fromPartial } from '@total-typescript/shoehorn';
import userEvent from '@testing-library/user-event';
import { render, screen } from '@/test/utils/testUtils';

import { ClassChecklistSection } from './ClassChecklistSection';
import { SHOW_MAP_WRAP_UP_STATUS } from '../showMapTypes';
import type { SecretaryCockpitClass } from './secretaryCockpitTypes';

describe('ClassChecklistSection judge sign-off undo (MYK9-1030)', () => {
  it('offers Undo initials as a full-size touch target that runs the undo command', async () => {
    const onCommand = vi.fn();
    render(
      <ClassChecklistSection
        sourceClass={fromPartial<SecretaryCockpitClass>({
          id: 'c1',
          lifecycle: 'complete',
          entryCount: 2,
          scoredCount: 2,
          wrapUpStatus: SHOW_MAP_WRAP_UP_STATUS.SIGNED_BY_JUDGE,
          registryId: 'AKC',
          judgeSignOffUndoCommandId: 'clear-judge-sign-off:class:c1',
        })}
        paperwork={[]}
        timeZone="America/New_York"
        onCommand={onCommand}
      />
    );

    const undo = screen.getByRole('button', { name: /undo initials/i });
    expect(undo).toHaveClass('min-h-11');
    await userEvent.click(undo);
    expect(onCommand).toHaveBeenCalledWith('clear-judge-sign-off:class:c1');
  });
});
