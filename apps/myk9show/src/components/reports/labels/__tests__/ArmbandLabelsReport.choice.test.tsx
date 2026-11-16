import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';

import { render, screen } from '@/test/utils/testUtils';
import { buildArmbandPaperworkDescriptor } from '@/features/show-map/cockpit/paperworkPrintState';
import type { ArmbandLabelEntry } from '@/lib/labels/armbandLabelTypes';
import { ArmbandLabelsReport } from '../ArmbandLabelsReport';

const SHOW = { kind: 'show' as const, showId: 'show-1' };

function entry(id: string, over: Partial<ArmbandLabelEntry>): ArmbandLabelEntry {
  return {
    id,
    dogId: 'dog-1',
    trialId: 'trial-1',
    classId: 'class-1',
    calendarDay: '2026-12-07',
    armband: 101,
    callName: 'Juni',
    breed: 'Beagle',
    handler: 'Jane',
    trialDate: '12/7/2026',
    isDayOfShow: false,
    ...over,
  };
}

const mocks = vi.hoisted(() => ({ entries: [] as unknown[], records: [] as unknown[] }));
mocks.entries = [
  entry('e1', {}),
  entry('e2', { trialId: 'trial-2', classId: 'class-2' }),
  entry('e4', { dogId: 'dog-2', armband: 102, callName: 'Hazel' }),
  entry('e5', { dogId: 'dog-3', armband: 103, callName: 'Moss' }),
];
mocks.records = [
  {
    reportId: 'armband-labels',
    printedAt: '2026-12-07T08:00:00.000Z',
    coverage: buildArmbandPaperworkDescriptor(SHOW, [
      {
        dogId: 'dog-1',
        calendarDay: '2026-12-07',
        armband: 101,
        callName: 'Juni',
        handlerName: 'J',
      },
      {
        dogId: 'dog-2',
        calendarDay: '2026-12-07',
        armband: 102,
        callName: 'Hazel',
        handlerName: 'J',
      },
    ]).coverage,
  },
];

vi.mock('@/hooks/queries/useArmbandLabelData', () => ({
  useArmbandLabelData: () => ({
    entries: mocks.entries,
    wifiNetwork: null,
    wifiPassword: null,
    isLoading: false,
  }),
}));
vi.mock('@/features/show-map/cockpit/useShowPaperworkPrints', () => ({
  useShowPaperworkPrints: () => ({ data: mocks.records }),
}));
vi.mock('@/hooks/useLabelPreferences', () => ({
  useLabelPreferences: () => [
    {
      templateId: '18262',
      contentConfig: {
        callName: true,
        breed: true,
        trialDate: true,
        handlerName: true,
        clubLogo: false,
        showAccessCode: false,
        venueWifi: false,
      },
      skip: 0,
      pitchAdjustment: 0,
      offsetTop: 0,
      offsetLeft: 0,
    },
    vi.fn(),
  ],
}));

const trialScope = { kind: 'trial' as const, showId: 'show-1', trialId: 'trial-1' };

describe('ArmbandLabelsReport day, dog and added-since choices (MYK9-2073)', () => {
  it('prints one label per dog for a day across two trials, and only the added ones on request', async () => {
    const user = userEvent.setup();
    render(<ArmbandLabelsReport showId="show-1" scope={trialScope} />);
    // Trial 1 alone: Juni, Hazel and Moss.
    expect(screen.getByText('3 labels on 1 page')).toBeInTheDocument();

    await user.selectOptions(screen.getByRole('combobox', { name: 'Day' }), '2026-12-07');
    // Juni is in both trials that day and still gets one label.
    expect(screen.getByText('3 labels on 1 page')).toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: /added since the last print/i }));
    expect(screen.getByText('1 label on 1 page')).toBeInTheDocument();
    expect(screen.getByText(/already printed for .* are left out/i)).toBeInTheDocument();
  });

  it("opens on a dog row's dog and day, and the choice can be widened", async () => {
    const user = userEvent.setup();
    render(<ArmbandLabelsReport showId="show-1" scope={trialScope} presetEntryId="e2" />);
    expect(screen.getByRole('combobox', { name: 'Dog' })).toHaveValue('dog-1');
    expect(screen.getByText('1 label on 1 page')).toBeInTheDocument();
    expect(screen.getByText(/last printed/i)).toBeInTheDocument();

    await user.selectOptions(screen.getByRole('combobox', { name: 'Dog' }), '');
    expect(screen.getByText('3 labels on 1 page')).toBeInTheDocument();
  });
});
