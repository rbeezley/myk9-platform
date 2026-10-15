import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import DogStatusDialog from './DogStatusDialog';

describe('DogStatusDialog date of passing max', () => {
  const originalTz = process.env.TZ;

  beforeEach(() => {
    process.env.TZ = 'America/Chicago';
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-10T01:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    if (originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = originalTz;
  });

  it('caps the date at the local day, not the UTC date', () => {
    render(
      <DogStatusDialog
        open
        onOpenChange={() => {}}
        dogName="Juni"
        currentStatus="deceased"
        onSave={() => {}}
      />
    );
    expect(screen.getByLabelText(/date of passing/i)).toHaveAttribute('max', '2026-11-09');
  });
});
