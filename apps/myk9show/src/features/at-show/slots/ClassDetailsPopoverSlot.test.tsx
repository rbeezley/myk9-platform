import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ClassDetailsPopover } from './ClassDetailsPopoverSlot';

describe('ClassDetailsPopover', () => {
  it('keeps the raw class id out of the default details workflow', () => {
    const rawClassId = 'dec1a55e-0000-0000-0000-000000000033';

    render(
      <ClassDetailsPopover
        isOpen
        onClose={() => undefined}
        anchorRef={createRef<HTMLElement>()}
        data={{
          classId: rawClassId,
          status: 'in_progress',
          totalEntries: 65,
          completedEntries: 0,
          judgeName: 'Test Judge',
          timeLimitSeconds: 180,
          areaCount: 1,
          visibilityPreset: 'open',
          selfCheckinEnabled: true,
        }}
      />
    );

    expect(screen.getByRole('dialog', { name: 'Class details' })).toBeInTheDocument();
    expect(screen.getByText('Test Judge')).toBeInTheDocument();
    expect(screen.queryByText(rawClassId)).not.toBeInTheDocument();
    expect(screen.queryByText('Class ID')).not.toBeInTheDocument();
  });
});
