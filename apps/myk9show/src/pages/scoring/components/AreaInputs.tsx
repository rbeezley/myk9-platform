/**
 * AreaInputs Component
 *
 * Displays time input cards for scent work search areas with smart input handling,
 * optional area recording buttons, and max time display.
 *
 * Extracted from AKCScentWorkScoresheet.tsx
 */

import React from 'react';
import { X } from 'lucide-react';
import './AreaInputs.css';

/**
 * Represents a single search area with its time
 */
export interface Area {
  /** Time value as string (e.g., "1:23.45") */
  time: string;
}

/**
 * Props for AreaInputs component
 */
export interface AreaInputsProps {
  /** Array of areas with time values */
  areas: Area[];
  /** Current stopwatch time in milliseconds */
  stopwatchTime: number;
  /** Whether stopwatch is currently running */
  isStopwatchRunning: boolean;
  /** Handler for time input changes with smart formatting */
  onSmartTimeInput: (index: number, value: string) => void;
  /** Handler for time input blur (final validation) */
  onTimeInputBlur: (index: number, value: string) => void;
  /** Handler for clearing a time input */
  onClearTime: (index: number) => void;
  /** Handler for recording stopwatch time to an area */
  onRecordTime: (index: number) => void;
  /** Function to get the next empty area index */
  getNextEmptyAreaIndex: () => number;
  /** Function to get max time for an area (optional) */
  getMaxTimeForArea?: (index: number) => string;
}

/**
 * AreaInputs Component
 *
 * Displays time input cards for scent work search areas. Supports both single
 * and multi-area configurations with conditional UI elements.
 *
 * **Features:**
 * - Smart time input with multiple formats (12345 or 1:23.45)
 * - Clear button appears when time is entered
 * - Multi-area mode shows Record/Badge buttons
 * - Single-area mode uses simplified input
 * - Max time display for each area
 * - Next-in-sequence highlighting for empty areas
 *
 * **Use Cases:**
 * - Regular classes: Single area time entry
 * - Container/Buried searches: Multiple area recording
 * - Element Specialist: 4 area time tracking
 *
 * @example
 * ```tsx
 * <AreaInputs
 *   areas={areas}
 *   stopwatchTime={stopwatchTime}
 *   isStopwatchRunning={isStopwatchRunning}
 *   onSmartTimeInput={handleSmartTimeInput}
 *   onTimeInputBlur={handleTimeInputBlur}
 *   onClearTime={clearTimeInput}
 *   onRecordTime={recordTimeForArea}
 *   getNextEmptyAreaIndex={getNextEmptyAreaIndex}
 *   getMaxTimeForArea={(index) => '02:00'}
 * />
 * ```
 */
export function AreaInputs({
  areas,
  stopwatchTime,
  isStopwatchRunning,
  onSmartTimeInput,
  onTimeInputBlur,
  onClearTime,
  onRecordTime,
  getNextEmptyAreaIndex,
  getMaxTimeForArea
}: AreaInputsProps): React.ReactElement {
  return (
    <>
      {areas.map((area, index) => (
        <div key={index} className="scoresheet-time-card">
          <div className="time-input-flutter">
            {/* Only show badge/button for multi-area elements/levels */}
            {areas.length > 1 && (
              <>
                {!area.time ? (
                  <button
                    className={`area-record-btn ${getNextEmptyAreaIndex() === index && stopwatchTime > 0 && !isStopwatchRunning ? 'next-in-sequence' : ''}`}
                    onClick={() => onRecordTime(index)}
                    title={`Record time from stopwatch for Area ${index + 1}`}
                  >
                    Record Area {index + 1}
                  </button>
                ) : (
                  <div className="area-badge recorded">
                    Area {index + 1}
                  </div>
                )}
              </>
            )}
            <div className="scoresheet-time-input-wrapper">
              <input
                type="text"
                value={area.time || ''}
                onChange={(e) => onSmartTimeInput(index, e.target.value)}
                onBlur={(e) => onTimeInputBlur(index, e.target.value)}
                placeholder="Type: 12345 or 1:23.45"
                className={`scoresheet-time-input ${areas.length === 1 ? 'single-area' : ''}`}
              />
              {area.time && (
                <button
                  type="button"
                  className="scoresheet-time-clear-button"
                  onClick={() => onClearTime(index)}
                  title="Clear time"
                >
                  <X size={16} style={{ width: '16px', height: '16px', flexShrink: 0 }} />
                </button>
              )}
            </div>
            <div className="max-time-display">
              Max: {getMaxTimeForArea ? getMaxTimeForArea(index) : '02:00'}
            </div>
          </div>
        </div>
      ))}
    </>
  );
}
