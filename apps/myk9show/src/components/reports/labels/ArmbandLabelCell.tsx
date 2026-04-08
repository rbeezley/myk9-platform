import React from 'react';

import type { ArmbandLabelItem, LabelContentConfig } from '@/lib/labels/armbandLabelTypes';
import { getArmbandFontSize } from '@/lib/labels/labelFontSize';

interface ArmbandLabelCellProps {
  item: ArmbandLabelItem;
  config: LabelContentConfig;
  labelHeight: number;
  passcode?: string | undefined;
  wifiNetwork?: string | undefined;
  wifiPassword?: string | undefined;
}

export const ArmbandLabelCell: React.FC<ArmbandLabelCellProps> = ({
  item,
  config,
  labelHeight,
  passcode,
  wifiNetwork,
  wifiPassword,
}) => {
  const activeFieldCount = [
    config.callName,
    config.trialDate,
    config.handlerName,
    config.myk9qCode && !!passcode,
    config.venueWifi && !!wifiNetwork,
  ].filter(Boolean).length;

  const fontSize = getArmbandFontSize(labelHeight, activeFieldCount);

  return (
    <div className="armband-label">
      <div className="armband-label__top">
        <span
          className="armband-label__number"
          style={{ fontSize: `${fontSize}px` }}
        >
          {item.armband}
        </span>
        <div className="armband-label__info">
          {config.callName && (
            <span className="armband-label__call-name">{item.callName}</span>
          )}
          {config.handlerName && (
            <span className="armband-label__handler">{item.handler}</span>
          )}
        </div>
      </div>
      <div className="armband-label__bottom">
        {config.trialDate && (
          <span className="armband-label__date">{item.trialDate}</span>
        )}
        <div className="armband-label__actions">
          {config.myk9qCode && passcode && (
            <span>myK9Q: {passcode}</span>
          )}
          {config.venueWifi && wifiNetwork && (
            <span>
              WiFi: {wifiNetwork}
              {wifiPassword ? `/${wifiPassword}` : ''}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
