import { render, screen } from '@testing-library/react';
import { ArmbandLabelsReport } from '../ArmbandLabelsReport';
import type { ArmbandLabelEntry } from '@/lib/labels/armbandLabelTypes';

vi.mock('@/hooks/queries/useArmbandLabelData', () => ({
  useArmbandLabelData: () => ({
    entries: [
      {
        id: '1',
        armband: 101,
        callName: 'Storm',
        handler: 'Jane',
        trialDate: '6/11/2025',
        isDayOfShow: false,
      },
      {
        id: '2',
        armband: 102,
        callName: 'Max',
        handler: 'Bob',
        trialDate: '6/11/2025',
        isDayOfShow: false,
      },
    ] as ArmbandLabelEntry[],
    wifiNetwork: null,
    wifiPassword: null,
    isLoading: false,
  }),
}));

vi.mock('@/hooks/useLabelPreferences', () => ({
  useLabelPreferences: () => [
    {
      templateId: '18262',
      contentConfig: {
        callName: true,
        trialDate: true,
        handlerName: false,
        clubLogo: false,
        showAccessCode: true,
        venueWifi: false,
      },
      skip: 0,
      pitchAdjustment: 0,
    },
    vi.fn(),
  ],
}));

vi.mock('@myk9/core', () => ({
  generatePasscodesFromShowId: () => ({ exhibitor: 'etest' }),
}));

describe('ArmbandLabelsReport', () => {
  it('renders the inline config panel', () => {
    render(<ArmbandLabelsReport showId="test-show-id" />);
    expect(screen.getByText(/Label Size/i)).toBeInTheDocument();
  });

  it('renders armband numbers from entries', () => {
    render(<ArmbandLabelsReport showId="test-show-id" />);
    expect(screen.getByText('101')).toBeInTheDocument();
    expect(screen.getByText('102')).toBeInTheDocument();
  });

  it('renders call names with default config', () => {
    render(<ArmbandLabelsReport showId="test-show-id" />);
    expect(screen.getByText('Storm')).toBeInTheDocument();
    expect(screen.getByText('Max')).toBeInTheDocument();
  });

  it('shows label count summary', () => {
    render(<ArmbandLabelsReport showId="test-show-id" />);
    expect(screen.getByText(/2 label/i)).toBeInTheDocument();
  });

  it('shows WiFi as not configured when no WiFi data', () => {
    render(<ArmbandLabelsReport showId="test-show-id" />);
    expect(screen.getByText(/not configured/i)).toBeInTheDocument();
  });
});
