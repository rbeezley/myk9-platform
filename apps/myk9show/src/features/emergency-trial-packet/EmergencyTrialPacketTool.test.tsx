import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import type { ReportDataState } from '@/hooks/queries/useReportData';
import type { Show } from '@/types/show-types';
import { EmergencyTrialPacketTool } from './EmergencyTrialPacketTool';
import { emergencyPacketReadinessCopy } from './emergencyTrialPacketReadiness';

const mockState = vi.hoisted(() => ({
  dataState: 'ready' as ReportDataState,
  isReady: true,
  trials: [] as Array<Record<string, unknown>>,
  classes: [] as Array<Record<string, unknown>>,
  entries: [] as Array<Record<string, unknown>>,
  registrationsReadComplete: true,
}));
const buildPacketData = vi.hoisted(() => vi.fn((_input: unknown) => null));

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ user: null }),
}));

vi.mock('@/hooks/queries/useReportData', () => ({
  useReportData: () => ({
    show: { id: 'show-1', name: 'Spring Trial' },
    trials: mockState.trials as never,
    classes: mockState.classes as never,
    entries: mockState.entries as never,
    dataState: mockState.dataState,
    isReady: mockState.isReady,
    registrationsReadComplete: mockState.registrationsReadComplete,
  }),
}));

vi.mock('@/pages/secretary/ReportsPage/reportDataMapping', () => ({
  buildEmergencyPacketData: buildPacketData,
}));

vi.mock('@/pages/secretary/ReportsPage/useDeliveredPackets', () => ({
  useDeliveredPackets: () => ({ rows: [], isError: false }),
}));

vi.mock('@/pages/secretary/ReportsPage/EmergencyTrialPacketPanel', () => ({
  EmergencyTrialPacketPanel: ({ unavailableReason }: { unavailableReason?: string }) => (
    <div data-testid="packet-panel" data-reason={unavailableReason ?? ''}>
      Prepare and email packet
    </div>
  ),
}));

vi.mock('@/features/show-map/cockpit/PaperworkPrintConfirmationDialog', () => ({
  PaperworkPrintConfirmationDialog: () => null,
}));

const show = {
  id: 'show-1',
  name: 'Spring Trial',
  organization: 'AKC',
  startDate: '2026-04-12',
  endDate: '2026-04-12',
} as unknown as Show;

describe('EmergencyTrialPacketTool', () => {
  beforeEach(() => {
    mockState.dataState = 'ready';
    mockState.isReady = true;
    mockState.trials = [];
    mockState.classes = [];
    mockState.entries = [];
    mockState.registrationsReadComplete = true;
    buildPacketData.mockClear();
  });

  it('uses calm instructions while complete report data is unavailable', () => {
    expect(emergencyPacketReadinessCopy('loading')).toBe(
      'Checking the complete show data before preparing the packet.'
    );
    expect(emergencyPacketReadinessCopy('unavailable')).toMatch(/Reconnect before preparing/);
    expect(emergencyPacketReadinessCopy('stale')).toMatch(/Still loading the complete show data/);
    expect(emergencyPacketReadinessCopy('error')).toMatch(/could not be loaded/);
    expect(emergencyPacketReadinessCopy('ready')).toBeUndefined();
    expect(emergencyPacketReadinessCopy('ready', false)).toMatch(/complete packet data/);
    expect(emergencyPacketReadinessCopy('ready', true, false)).toMatch(/Registration details/);
  });

  it('does not expose the prepare action until complete rows are ready', () => {
    mockState.dataState = 'loading';
    mockState.isReady = false;

    render(<EmergencyTrialPacketTool show={show} />);

    expect(screen.getByTestId('packet-panel')).toHaveAttribute(
      'data-reason',
      'The complete packet data is unavailable. Reload Show Desk before preparing the packet.'
    );
  });

  it('does not prepare a packet when registration details are incomplete', () => {
    mockState.registrationsReadComplete = false;

    render(<EmergencyTrialPacketTool show={show} />);

    expect(screen.getByTestId('packet-panel')).toHaveAttribute(
      'data-reason',
      'Registration details are unavailable. Reconnect before preparing the packet.'
    );
    expect(buildPacketData).not.toHaveBeenCalled();
  });

  it('passes authoritative trial and class fields through unchanged', () => {
    const trials = [
      {
        id: 'trial-1',
        date: '2026-04-12',
        name: 'Trial 12',
        trial_number: '12',
        registry_id: 'UKC',
      },
    ];
    const classes = [
      {
        id: 'class-1',
        trial_id: 'trial-1',
        name: 'Buried Novice',
        element: 'Buried',
        level: 'Novice',
        section: null,
        class_number: '1',
        display_order: 1,
        judge_name: 'Judge',
        ring: null,
        ring_number: null,
        start_time: null,
        num_areas: 3,
        time_limit_seconds: 120,
        time_limit_area2_seconds: 90,
        time_limit_area3_seconds: 60,
        num_hides: 2,
        distraction_count: 1,
      },
    ];
    mockState.trials = trials;
    mockState.classes = classes;

    render(<EmergencyTrialPacketTool show={show} />);

    expect(buildPacketData).toHaveBeenCalledWith(
      expect.objectContaining({ trials, classes, entries: mockState.entries })
    );
  });

  it('accepts the replication-shaped class row used by normal authenticated reads', () => {
    mockState.trials = [
      {
        id: 'trial-1',
        date: '2026-04-12',
        name: 'Trial 12',
        trial_number: '12',
        registry_id: 'UKC',
      },
    ];
    mockState.classes = [
      {
        id: 'class-1',
        trial_id: 'trial-1',
        name: 'Buried Novice',
        element: 'Buried',
        level: 'Novice',
        section: null,
        display_order: 1,
        start_time: '09:00:00',
        time_limit_seconds: 120,
        time_limit_area2_seconds: null,
        time_limit_area3_seconds: null,
        num_areas: 3,
      },
    ];

    render(<EmergencyTrialPacketTool show={show} />);

    expect(buildPacketData).toHaveBeenCalledWith(
      expect.objectContaining({ classes: mockState.classes })
    );
  });
});
