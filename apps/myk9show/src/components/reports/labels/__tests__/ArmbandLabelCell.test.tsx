import { render, screen } from '@testing-library/react';

import { ArmbandLabelCell } from '../ArmbandLabelCell';
import type { ArmbandLabelItem } from '@/lib/labels/armbandLabelTypes';
import { DEFAULT_CONTENT_CONFIG } from '@/lib/labels/armbandLabelTypes';

const item: ArmbandLabelItem = {
  armband: 101,
  callName: 'Storm',
  breed: 'Labrador Retriever',
  handler: 'Jane Smith',
  trialDate: '6/11/2025',
};

describe('ArmbandLabelCell', () => {
  it('always renders the armband number', () => {
    render(
      <ArmbandLabelCell
        item={item}
        config={DEFAULT_CONTENT_CONFIG}
        labelHeight={1.333}
        labelWidth={4}
        numberDigits={3}
      />
    );
    expect(screen.getByText('101')).toBeInTheDocument();
  });

  it('renders call name when enabled', () => {
    render(
      <ArmbandLabelCell
        item={item}
        config={{ ...DEFAULT_CONTENT_CONFIG, callName: true }}
        labelHeight={1.333}
        labelWidth={4}
        numberDigits={3}
      />
    );
    expect(screen.getByText('Storm')).toBeInTheDocument();
  });

  it('hides call name when disabled', () => {
    render(
      <ArmbandLabelCell
        item={item}
        config={{ ...DEFAULT_CONTENT_CONFIG, callName: false }}
        labelHeight={1.333}
        labelWidth={4}
        numberDigits={3}
      />
    );
    expect(screen.queryByText('Storm')).not.toBeInTheDocument();
  });

  it('renders trial date when enabled', () => {
    render(
      <ArmbandLabelCell
        item={item}
        config={{ ...DEFAULT_CONTENT_CONFIG, trialDate: true }}
        labelHeight={1.333}
        labelWidth={4}
        numberDigits={3}
      />
    );
    expect(screen.getByText('6/11/2025')).toBeInTheDocument();
  });

  it('renders handler name when enabled', () => {
    render(
      <ArmbandLabelCell
        item={item}
        config={{ ...DEFAULT_CONTENT_CONFIG, handlerName: true }}
        labelHeight={1.333}
        labelWidth={4}
        numberDigits={3}
      />
    );
    expect(screen.getByText('Jane Smith')).toBeInTheDocument();
  });

  it('hides handler name when disabled', () => {
    render(
      <ArmbandLabelCell
        item={item}
        config={{ ...DEFAULT_CONTENT_CONFIG, handlerName: false }}
        labelHeight={1.333}
        labelWidth={4}
        numberDigits={3}
      />
    );
    expect(screen.queryByText('Jane Smith')).not.toBeInTheDocument();
  });

  it('renders show access code when enabled and provided', () => {
    render(
      <ArmbandLabelCell
        item={item}
        config={{ ...DEFAULT_CONTENT_CONFIG, showAccessCode: true }}
        labelHeight={1.333}
        labelWidth={4}
        numberDigits={3}
        passcode="eab12"
      />
    );
    expect(screen.getByText(/Show code/i)).toBeInTheDocument();
    expect(screen.getByText(/eab12/)).toBeInTheDocument();
  });

  it('renders WiFi when enabled and provided', () => {
    render(
      <ArmbandLabelCell
        item={item}
        config={{ ...DEFAULT_CONTENT_CONFIG, venueWifi: true }}
        labelHeight={1.333}
        labelWidth={4}
        numberDigits={3}
        wifiNetwork="ShowNet"
        wifiPassword="dog123"
      />
    );
    expect(screen.getByText(/ShowNet/)).toBeInTheDocument();
  });

  it('does not render WiFi when config disabled even if data provided', () => {
    render(
      <ArmbandLabelCell
        item={item}
        config={{ ...DEFAULT_CONTENT_CONFIG, venueWifi: false }}
        labelHeight={1.333}
        labelWidth={4}
        numberDigits={3}
        wifiNetwork="ShowNet"
        wifiPassword="dog123"
      />
    );
    expect(screen.queryByText(/ShowNet/)).not.toBeInTheDocument();
  });

  describe('layout and show code (MYK9-1233)', () => {
    it('keeps the existing Show code line, in the right column, when the toggle is on', () => {
      const { container } = render(
        <ArmbandLabelCell
          item={item}
          config={DEFAULT_CONTENT_CONFIG}
          labelHeight={1.333}
          labelWidth={4}
          numberDigits={3}
          passcode="eab12"
        />
      );
      const side = container.querySelector('.armband-label__side') as HTMLElement;
      expect(side).toHaveTextContent('Show code: eab12');
    });

    it('omits the Show code line when the toggle is off', () => {
      render(
        <ArmbandLabelCell
          item={item}
          config={{ ...DEFAULT_CONTENT_CONFIG, showAccessCode: false }}
          labelHeight={1.333}
          labelWidth={4}
          numberDigits={3}
          passcode="eab12"
        />
      );
      expect(screen.queryByText(/Show code/)).not.toBeInTheDocument();
    });

    it('puts the number in its own large element and the rest in a right-hand column', () => {
      const { container } = render(
        <ArmbandLabelCell
          item={item}
          config={{ ...DEFAULT_CONTENT_CONFIG, handlerName: true }}
          labelHeight={1.333}
          labelWidth={4}
          numberDigits={3}
          passcode="eab12"
        />
      );
      const number = container.querySelector('.armband-label__number') as HTMLElement;
      const side = container.querySelector('.armband-label__side') as HTMLElement;
      expect(number).not.toBeNull();
      expect(side).not.toBeNull();
      // Two siblings in one row: number first, secondary column second (on the right).
      expect(number.nextElementSibling).toBe(side);
      expect(side.contains(number)).toBe(false);
      expect(side).toHaveTextContent('Storm');
      expect(side).toHaveTextContent('Jane Smith');
      expect(side).toHaveTextContent('Show code: eab12');
      expect(side).toHaveTextContent('6/11/2025');
      // The number is the largest type on the label.
      const numberPx = parseFloat(number.style.fontSize);
      expect(numberPx).toBeGreaterThanOrEqual(24);
      expect(parseFloat(side.style.fontSize)).toBeLessThan(numberPx);
      // Bold inline, so the preview (no label stylesheet) shows the weight too.
      expect(number.style.fontWeight).toBe('700');
    });

    it('prints the breed and handler by default, and hides each when unticked', () => {
      const { container, rerender } = render(
        <ArmbandLabelCell
          item={item}
          config={DEFAULT_CONTENT_CONFIG}
          labelHeight={1.333}
          labelWidth={4}
          numberDigits={3}
        />
      );
      const side = () => container.querySelector('.armband-label__side') as HTMLElement;
      expect(side()).toHaveTextContent('Labrador Retriever');
      expect(side()).toHaveTextContent('Jane Smith');
      rerender(
        <ArmbandLabelCell
          item={item}
          config={{ ...DEFAULT_CONTENT_CONFIG, breed: false, handlerName: false }}
          labelHeight={1.333}
          labelWidth={4}
          numberDigits={3}
        />
      );
      expect(side()).not.toHaveTextContent('Labrador Retriever');
      expect(side()).not.toHaveTextContent('Jane Smith');
    });

    it('prints no breed line for a dog with no registration with this registry', () => {
      const { container } = render(
        <ArmbandLabelCell
          item={{ ...item, breed: '' }}
          config={DEFAULT_CONTENT_CONFIG}
          labelHeight={1.333}
          labelWidth={4}
          numberDigits={3}
        />
      );
      expect(container.querySelector('.armband-label__breed')).toBeNull();
    });

    it('stacks the details under the number on the tall 8387 label', () => {
      const { container } = render(
        <ArmbandLabelCell
          item={item}
          config={DEFAULT_CONTENT_CONFIG}
          labelHeight={5.5}
          labelWidth={4.25}
          numberDigits={3}
        />
      );
      const row = container.querySelector('.armband-label__row') as HTMLElement;
      expect(row.style.flexDirection).toBe('column');
    });
  });
});
