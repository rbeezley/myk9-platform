import { render as customRender, screen, fireEvent } from '@/test/utils/testUtils';
import { LabelCalibrationPanel } from '../LabelCalibrationPanel';
import type { LabelPreferences } from '@/hooks/useLabelPreferences';

function makePrefs(overrides: Partial<LabelPreferences> = {}): LabelPreferences {
  return {
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
    offsetTop: 0,
    offsetLeft: 0,
    ...overrides,
  };
}

describe('LabelCalibrationPanel', () => {
  it('is collapsed by default', () => {
    customRender(<LabelCalibrationPanel prefs={makePrefs()} setPrefs={vi.fn()} />);
    expect(screen.getByText(/show advanced/i)).toBeInTheDocument();
    expect(screen.queryByText(/printer calibration/i)).not.toBeInTheDocument();
  });

  it('expands to show the three calibration sliders and hint text', () => {
    customRender(<LabelCalibrationPanel prefs={makePrefs()} setPrefs={vi.fn()} />);
    fireEvent.click(screen.getByText(/show advanced/i));

    expect(screen.getByText(/printer calibration/i)).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: /top offset/i })).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: /left offset/i })).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: /row pitch/i })).toBeInTheDocument();
    expect(screen.getByText(/never "fit to page" or "shrink to fit\."/i)).toBeInTheDocument();
    expect(screen.getByText(/saved per browser/i)).toBeInTheDocument();
  });

  it('toggles back to hidden on second click', () => {
    customRender(<LabelCalibrationPanel prefs={makePrefs()} setPrefs={vi.fn()} />);
    fireEvent.click(screen.getByText(/show advanced/i));
    expect(screen.getByText(/printer calibration/i)).toBeInTheDocument();

    fireEvent.click(screen.getByText(/hide advanced/i));
    expect(screen.queryByText(/printer calibration/i)).not.toBeInTheDocument();
  });

  it('updates offsetTop via setPrefs when the top-offset slider changes', () => {
    const setPrefs = vi.fn();
    customRender(<LabelCalibrationPanel prefs={makePrefs()} setPrefs={setPrefs} />);
    fireEvent.click(screen.getByText(/show advanced/i));

    const slider = screen.getByRole('slider', { name: /top offset/i });
    fireEvent.change(slider, { target: { value: '1' } });

    expect(setPrefs).toHaveBeenCalled();
    const updater = setPrefs.mock.calls[0]![0];
    expect(updater(makePrefs()).offsetTop).toBe(1);
  });

  it('updates offsetLeft via setPrefs when the left-offset slider changes', () => {
    const setPrefs = vi.fn();
    customRender(<LabelCalibrationPanel prefs={makePrefs()} setPrefs={setPrefs} />);
    fireEvent.click(screen.getByText(/show advanced/i));

    const slider = screen.getByRole('slider', { name: /left offset/i });
    fireEvent.change(slider, { target: { value: '1' } });

    expect(setPrefs).toHaveBeenCalled();
    const updater = setPrefs.mock.calls[0]![0];
    expect(updater(makePrefs()).offsetLeft).toBe(1);
  });

  it('updates pitchAdjustment via setPrefs when the row-pitch slider changes', () => {
    const setPrefs = vi.fn();
    customRender(<LabelCalibrationPanel prefs={makePrefs()} setPrefs={setPrefs} />);
    fireEvent.click(screen.getByText(/show advanced/i));

    const slider = screen.getByRole('slider', { name: /row pitch/i });
    fireEvent.change(slider, { target: { value: '1' } });

    expect(setPrefs).toHaveBeenCalled();
    const updater = setPrefs.mock.calls[0]![0];
    expect(updater(makePrefs()).pitchAdjustment).toBe(1);
  });

  it('hides the reset button when all three values are zero', () => {
    customRender(<LabelCalibrationPanel prefs={makePrefs()} setPrefs={vi.fn()} />);
    fireEvent.click(screen.getByText(/show advanced/i));
    expect(screen.queryByText(/reset calibration/i)).not.toBeInTheDocument();
  });

  it('shows the reset button when any value is non-zero and clears all three on click', () => {
    const setPrefs = vi.fn();
    customRender(
      <LabelCalibrationPanel
        prefs={makePrefs({ pitchAdjustment: 4, offsetTop: -2, offsetLeft: 6 })}
        setPrefs={setPrefs}
      />
    );
    fireEvent.click(screen.getByText(/show advanced/i));

    const resetButton = screen.getByText(/reset calibration/i);
    fireEvent.click(resetButton);

    expect(setPrefs).toHaveBeenCalled();
    const updater = setPrefs.mock.calls[0]![0];
    const result = updater(makePrefs({ pitchAdjustment: 4, offsetTop: -2, offsetLeft: 6 }));
    expect(result.pitchAdjustment).toBe(0);
    expect(result.offsetTop).toBe(0);
    expect(result.offsetLeft).toBe(0);
  });
});
