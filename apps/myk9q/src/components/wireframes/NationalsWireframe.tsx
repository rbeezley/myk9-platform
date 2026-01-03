/**
 * Wireframe for Nationals Scoresheet Layout
 *
 * STATUS: Dormant (No current nationals scheduled)
 * LAST USED: 2024
 *
 * Shows the exact design we want to achieve for nationals scoring interface.
 * Retained as reference for future nationals implementation.
 */

import React from 'react';
import './NationalsWireframe.css';

export const NationalsWireframe: React.FC = () => {
  return (
    <div className="wireframe-container">
      <div className="wireframe-header">
        <h2>📐 Nationals Scoresheet Wireframe</h2>
        <p>Target layout for implementation</p>
      </div>

      {/* Trial Info - One Line */}
      <div className="wireframe-section">
        <div className="wireframe-label">Trial Info (One Line)</div>
        <div className="wireframe-trial-info">
          <span>10/11/2025</span>
          <span className="separator">•</span>
          <span>Trial 1</span>
          <span className="separator">•</span>
          <span>Container Master</span>
        </div>
      </div>

      {/* Dog Info - Clean, No Background */}
      <div className="wireframe-section">
        <div className="wireframe-label">Dog Info (No Background Container)</div>
        <div className="wireframe-dog-info">
          <div className="wireframe-armband">156</div>
          <div className="wireframe-dog-details">
            <div className="wireframe-dog-name">Dog 57</div>
            <div className="wireframe-dog-breed">Dutch Shepherd</div>
            <div className="wireframe-dog-handler">Handler: Person 57</div>
          </div>
        </div>
        <div className="wireframe-note">
          ↑ Dog name should align with TOP of armband badge<br/>
          ↑ NO gray background container around this area
        </div>
      </div>

      {/* Timer Section */}
      <div className="wireframe-section">
        <div className="wireframe-label">Timer Section</div>
        <div className="wireframe-timer">
          <div className="wireframe-time">0:00.00</div>
          <div className="wireframe-timer-controls">
            <button className="wireframe-btn-reset">⟲</button>
            <button className="wireframe-btn-start">Start</button>
          </div>
        </div>
      </div>

      {/* Time Input - Single Area (No Badge) */}
      <div className="wireframe-section">
        <div className="wireframe-label">Time Input - Single Area Element (No Badge Needed)</div>
        <div className="wireframe-time-input">
          <input className="wireframe-time-field single-area" placeholder="MM:SS.HH" />
          <span className="wireframe-max-time">Max: 02:00</span>
        </div>
        <div className="wireframe-note">
          ↑ Single area elements (like Container) don't need area badges
        </div>
      </div>

      {/* Time Input - Multiple Areas (With Badge) */}
      <div className="wireframe-section">
        <div className="wireframe-label">Time Input - Multi Area Element (With Badge)</div>
        <div className="wireframe-time-input">
          <button className="wireframe-element-btn">Area 1</button>
          <input className="wireframe-time-field" placeholder="MM:SS.HH" />
          <span className="wireframe-max-time">Max: 03:00</span>
        </div>
        <div className="wireframe-note">
          ↑ Multi-area elements (like Interior Masters) need area badges
        </div>
      </div>

      {/* Result Buttons */}
      <div className="wireframe-section">
        <div className="wireframe-label">Result Selection</div>
        <div className="wireframe-result-buttons">
          <button className="wireframe-result-btn">Qualified</button>
          <button className="wireframe-result-btn">Absent</button>
          <button className="wireframe-result-btn">Excused</button>
        </div>
      </div>

      {/* Nationals Counters - Dark Backgrounds */}
      <div className="wireframe-section">
        <div className="wireframe-label">Nationals Counters (All Dark Backgrounds)</div>
        <div className="wireframe-counters">
          <div className="wireframe-counter positive">
            <div className="wireframe-counter-controls">
              <button className="wireframe-counter-btn decrement">−</button>
              <div className="wireframe-counter-value">0</div>
              <button className="wireframe-counter-btn increment positive">+</button>
            </div>
            <div className="wireframe-counter-label">Correct Calls</div>
          </div>

          <div className="wireframe-counter negative">
            <div className="wireframe-counter-controls">
              <button className="wireframe-counter-btn decrement">−</button>
              <div className="wireframe-counter-value">0</div>
              <button className="wireframe-counter-btn increment negative">+</button>
            </div>
            <div className="wireframe-counter-label">Incorrect Calls</div>
          </div>

          <div className="wireframe-counter negative">
            <div className="wireframe-counter-controls">
              <button className="wireframe-counter-btn decrement">−</button>
              <div className="wireframe-counter-value">0</div>
              <button className="wireframe-counter-btn increment negative">+</button>
            </div>
            <div className="wireframe-counter-label">Faults</div>
          </div>

          <div className="wireframe-counter negative">
            <div className="wireframe-counter-controls">
              <button className="wireframe-counter-btn decrement">−</button>
              <div className="wireframe-counter-value">0</div>
              <button className="wireframe-counter-btn increment negative">+</button>
            </div>
            <div className="wireframe-counter-label">No Finish Calls</div>
          </div>
        </div>
        <div className="wireframe-note">
          ↑ ALL backgrounds should be DARK in dark mode<br/>
          ↑ NO white containers anywhere in the counter area
        </div>
      </div>

      {/* Action Buttons */}
      <div className="wireframe-section">
        <div className="wireframe-label">Action Buttons</div>
        <div className="wireframe-action-buttons">
          <button className="wireframe-cancel-btn">Cancel</button>
          <button className="wireframe-save-btn">Save</button>
        </div>
      </div>

      <div className="wireframe-footer">
        <p><strong>Key Requirements:</strong></p>
        <ul>
          <li>✅ Trial info on single line with separators</li>
          <li>❌ NO gray background around dog info area</li>
          <li>✅ Dog name aligns with TOP of armband badge</li>
          <li>✅ Max time displayed to RIGHT of time field</li>
          <li>✅ Area badges ONLY for multi-area elements/levels</li>
          <li>✅ Cancel button to LEFT of Save button</li>
          <li>❌ NO white containers around counter controls in dark mode</li>
          <li>✅ All counter backgrounds are dark in dark mode</li>
          <li>✅ Mobile-friendly layout</li>
        </ul>
      </div>
    </div>
  );
};

export default NationalsWireframe;