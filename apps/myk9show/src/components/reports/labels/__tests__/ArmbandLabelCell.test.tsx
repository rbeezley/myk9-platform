import React from 'react';
import { render, screen } from '@testing-library/react';

import { ArmbandLabelCell } from '../ArmbandLabelCell';
import type { ArmbandLabelItem } from '@/lib/labels/armbandLabelTypes';
import { DEFAULT_CONTENT_CONFIG } from '@/lib/labels/armbandLabelTypes';

const item: ArmbandLabelItem = {
  armband: 101,
  callName: 'Storm',
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
      />
    );
    expect(screen.queryByText('Jane Smith')).not.toBeInTheDocument();
  });

  it('renders myK9Q code when enabled and provided', () => {
    render(
      <ArmbandLabelCell
        item={item}
        config={{ ...DEFAULT_CONTENT_CONFIG, myk9qCode: true }}
        labelHeight={1.333}
        passcode="eab12"
      />
    );
    expect(screen.getByText(/eab12/)).toBeInTheDocument();
  });

  it('renders WiFi when enabled and provided', () => {
    render(
      <ArmbandLabelCell
        item={item}
        config={{ ...DEFAULT_CONTENT_CONFIG, venueWifi: true }}
        labelHeight={1.333}
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
        wifiNetwork="ShowNet"
        wifiPassword="dog123"
      />
    );
    expect(screen.queryByText(/ShowNet/)).not.toBeInTheDocument();
  });
});
