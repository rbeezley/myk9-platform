import React from 'react';

import type { ArmbandLabelItem, LabelContentConfig } from '@/lib/labels/armbandLabelTypes';
import { getArmbandFontSize, getArmbandSideFontSize } from '@/lib/labels/labelFontSize';

interface ArmbandLabelCellProps {
  item: ArmbandLabelItem;
  config: LabelContentConfig;
  labelHeight: number;
  /** Template width in inches; caps the number so the right column keeps its share. */
  labelWidth?: number | undefined;
  passcode?: string | undefined;
  wifiNetwork?: string | undefined;
  wifiPassword?: string | undefined;
}

// Layout is inline so the in-page preview (which has no label stylesheet) and the printed
// iframe agree; the stylesheet only adds weights and colours.
const ROW_STYLE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.12in',
  height: '100%',
  minWidth: 0,
};
const NUMBER_STYLE: React.CSSProperties = { flex: '0 0 auto', lineHeight: 1 };
const SIDE_STYLE: React.CSSProperties = {
  flex: '1 1 0',
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: '1px',
  lineHeight: 1.15,
};
// Names may be cut short with an ellipsis; a code or password never is, because a clipped one
// is useless to the exhibitor. Those lines wrap instead.
const TRUNCATE: React.CSSProperties = {
  display: 'block',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};
const WRAP: React.CSSProperties = { display: 'block', overflowWrap: 'anywhere' };

export const ArmbandLabelCell: React.FC<ArmbandLabelCellProps> = ({
  item,
  config,
  labelHeight,
  labelWidth,
  passcode,
  wifiNetwork,
  wifiPassword,
}) => {
  // The secondary text lives in its own column, so it no longer takes height from the number.
  const fontSize = getArmbandFontSize(
    labelHeight,
    0,
    labelWidth === undefined
      ? undefined
      : { labelWidthInches: labelWidth, digits: String(item.armband).length }
  );

  return (
    <div className="armband-label">
      <div className="armband-label__row" style={ROW_STYLE}>
        <span
          className="armband-label__number"
          style={{ ...NUMBER_STYLE, fontSize: `${fontSize}px` }}
        >
          {item.armband}
        </span>
        <div
          className="armband-label__side"
          style={{ ...SIDE_STYLE, fontSize: `${getArmbandSideFontSize(labelHeight)}px` }}
        >
          {config.callName && (
            <span className="armband-label__call-name" style={TRUNCATE}>
              {item.callName}
            </span>
          )}
          {config.handlerName && (
            <span className="armband-label__handler" style={TRUNCATE}>
              {item.handler}
            </span>
          )}
          {config.trialDate && (
            <span className="armband-label__date" style={TRUNCATE}>
              {item.trialDate}
            </span>
          )}
          {config.showAccessCode && passcode && (
            <span
              className="armband-label__show-code"
              data-testid="armband-label-show-code"
              style={WRAP}
            >
              Show code: {passcode}
            </span>
          )}
          {config.venueWifi && wifiNetwork && (
            <span className="armband-label__actions" style={WRAP}>
              WiFi: {wifiNetwork}
              {wifiPassword ? `/${wifiPassword}` : ''}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
