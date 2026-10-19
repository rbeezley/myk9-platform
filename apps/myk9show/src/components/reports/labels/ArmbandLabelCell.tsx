import React from 'react';

import type { ArmbandLabelItem, LabelContentConfig } from '@/lib/labels/armbandLabelTypes';
import {
  ARMBAND_NUMBER_LINE_HEIGHT,
  getArmbandFontSize,
  getArmbandLayout,
  getArmbandSideFontSize,
} from '@/lib/labels/labelFontSize';

interface ArmbandLabelCellProps {
  item: ArmbandLabelItem;
  config: LabelContentConfig;
  labelHeight: number;
  /** Template width in inches; caps the number so the details keep their share. */
  labelWidth: number;
  /** Digits in the longest armband of the print run, so every label's number is one size. */
  numberDigits: number;
  passcode?: string | undefined;
  wifiNetwork?: string | undefined;
  wifiPassword?: string | undefined;
}

// Layout is inline so the in-page preview (which has no label stylesheet) and the printed
// iframe agree; the stylesheet only adds the detail lines' weights and colours.
const ROW_STYLE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.12in',
  height: '100%',
  minWidth: 0,
};
const STACKED_STYLE: React.CSSProperties = {
  ...ROW_STYLE,
  flexDirection: 'column',
  alignItems: 'stretch',
  justifyContent: 'center',
};
// Bold and Arial inline too, so the preview shows the weight and width the print is sized for.
const NUMBER_STYLE: React.CSSProperties = {
  flex: '0 0 auto',
  lineHeight: ARMBAND_NUMBER_LINE_HEIGHT,
  fontWeight: 700,
  fontFamily: 'Arial, Helvetica, sans-serif',
};
const SIDE_STYLE: React.CSSProperties = {
  flex: '1 1 0',
  fontFamily: 'Arial, Helvetica, sans-serif',
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: '1px',
  lineHeight: 1.15,
};
const STACKED_NUMBER_STYLE: React.CSSProperties = { ...NUMBER_STYLE, textAlign: 'center' };
const STACKED_SIDE_STYLE: React.CSSProperties = { ...SIDE_STYLE, flex: '0 0 auto' };
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
  numberDigits,
  passcode,
  wifiNetwork,
  wifiPassword,
}) => {
  const stacked = getArmbandLayout(labelWidth, labelHeight) === 'stacked';
  const fontSize = getArmbandFontSize(labelWidth, labelHeight, numberDigits);

  return (
    <div className="armband-label">
      <div className="armband-label__row" style={stacked ? STACKED_STYLE : ROW_STYLE}>
        <span
          className="armband-label__number"
          style={{ ...(stacked ? STACKED_NUMBER_STYLE : NUMBER_STYLE), fontSize: `${fontSize}px` }}
        >
          {item.armband}
        </span>
        <div
          className="armband-label__side"
          style={{
            ...(stacked ? STACKED_SIDE_STYLE : SIDE_STYLE),
            fontSize: `${getArmbandSideFontSize(labelHeight)}px`,
          }}
        >
          {config.callName && (
            <span className="armband-label__call-name" style={TRUNCATE}>
              {item.callName}
            </span>
          )}
          {config.breed && item.breed && (
            <span className="armband-label__breed" style={TRUNCATE}>
              {item.breed}
            </span>
          )}
          {config.handlerName && item.handler && (
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
