import { render, screen, fireEvent } from '@testing-library/react';
import { ArmbandLabelsReport } from '../ArmbandLabelsReport';
import type { ArmbandLabelEntry } from '@/lib/labels/armbandLabelTypes';

vi.mock('@/hooks/queries/useArmbandLabelData', () => ({
  useArmbandLabelData: () => ({
    entries: [
      {
        id: '1',
        dogId: 'dog-1',
        trialId: 'trial-1',
        classId: 'class-1',
        calendarDay: '2025-06-11',
        armband: 101,
        callName: 'Storm',
        handler: 'Jane',
        trialDate: '6/11/2025',
        isDayOfShow: false,
      },
      {
        id: '2',
        dogId: 'dog-2',
        trialId: 'trial-1',
        classId: 'class-1',
        calendarDay: '2025-06-11',
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
      offsetTop: 0,
      offsetLeft: 0,
    },
    vi.fn(),
  ],
}));

vi.mock('@myk9/core', () => ({
  generatePasscodesFromShowId: () => ({ exhibitor: 'etest' }),
}));

describe('ArmbandLabelsReport', () => {
  const showScope = { kind: 'show' as const, showId: 'test-show-id' };

  it('renders the inline config panel', () => {
    render(<ArmbandLabelsReport showId="test-show-id" scope={showScope} />);
    expect(screen.getByText(/Label Size/i)).toBeInTheDocument();
  });

  it('renders armband numbers from entries', () => {
    render(<ArmbandLabelsReport showId="test-show-id" scope={showScope} />);
    expect(screen.getByText('101')).toBeInTheDocument();
    expect(screen.getByText('102')).toBeInTheDocument();
  });

  it('renders call names with default config', () => {
    render(<ArmbandLabelsReport showId="test-show-id" scope={showScope} />);
    expect(screen.getByText('Storm')).toBeInTheDocument();
    expect(screen.getByText('Max')).toBeInTheDocument();
  });

  it('shows label count summary', () => {
    render(<ArmbandLabelsReport showId="test-show-id" scope={showScope} />);
    expect(screen.getByText(/2 label/i)).toBeInTheDocument();
  });

  it('shows WiFi as not configured when no WiFi data', () => {
    render(<ArmbandLabelsReport showId="test-show-id" scope={showScope} />);
    expect(screen.getByText(/not configured/i)).toBeInTheDocument();
  });

  describe('mobile touch targets', () => {
    it('uses shadcn primitives, not raw native radio/checkbox inputs', () => {
      render(<ArmbandLabelsReport showId="test-show-id" scope={showScope} />);
      // Base UI's Radio/Checkbox render accessible non-input controls (span /
      // button); the native <input> they keep for form integration is hidden
      // from the a11y tree. A raw native control would expose an <input> in the
      // a11y tree instead — so asserting "not INPUT" proves the shadcn
      // primitives are in use.
      const controls = [...screen.getAllByRole('radio'), ...screen.getAllByRole('checkbox')];
      expect(screen.getAllByRole('radio').length).toBeGreaterThan(0);
      expect(screen.getAllByRole('checkbox').length).toBeGreaterThan(0);
      for (const control of controls) {
        expect(control.tagName).not.toBe('INPUT');
      }
    });

    it('gives every radio and checkbox row a 44px-tall hit area', () => {
      render(<ArmbandLabelsReport showId="test-show-id" scope={showScope} />);
      const controls = [...screen.getAllByRole('radio'), ...screen.getAllByRole('checkbox')];
      expect(controls.length).toBeGreaterThan(0);
      for (const control of controls) {
        const row = control.closest('label');
        expect(row).not.toBeNull();
        expect(row?.className).toContain('min-h-[44px]');
      }
    });
  });

  describe('specific-armband number input', () => {
    it('is not nested inside the checkbox label, so tapping it cannot toggle the checkbox', () => {
      render(<ArmbandLabelsReport showId="test-show-id" scope={showScope} />);

      const specificCheckbox = screen.getByRole('checkbox', {
        name: /specific armband number/i,
      });
      // Reveal the number field.
      fireEvent.click(specificCheckbox);
      expect(specificCheckbox).toHaveAttribute('aria-checked', 'true');

      const numberInput = screen.getByLabelText('Armband number');
      const checkboxLabel = specificCheckbox.closest('label');
      expect(checkboxLabel).not.toBeNull();
      // The regression: the input must be a SIBLING of the label, never a
      // descendant — otherwise a tap on the field re-dispatches to the checkbox.
      expect(checkboxLabel?.contains(numberInput)).toBe(false);

      // And typing leaves the checkbox checked.
      fireEvent.change(numberInput, { target: { value: '42' } });
      expect(specificCheckbox).toHaveAttribute('aria-checked', 'true');
      expect(numberInput).toHaveValue(42);
    });

    it('hides the number field and clears it when the checkbox is unchecked', () => {
      render(<ArmbandLabelsReport showId="test-show-id" scope={showScope} />);
      const specificCheckbox = screen.getByRole('checkbox', {
        name: /specific armband number/i,
      });
      fireEvent.click(specificCheckbox);
      expect(screen.getByLabelText('Armband number')).toBeInTheDocument();
      fireEvent.click(specificCheckbox);
      expect(screen.queryByLabelText('Armband number')).not.toBeInTheDocument();
    });
  });
});
