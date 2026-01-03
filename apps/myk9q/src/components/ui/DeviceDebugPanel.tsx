/* eslint-disable react-hooks/rules-of-hooks */
/**
 * Device Debug Panel
 *
 * Developer tool to visualize device detection and performance settings.
 * Shows device tier, capabilities, and allows overriding settings.
 */

import { useState, useEffect } from 'react';
import { useDeviceCapabilities, usePerformanceSettings } from '@/hooks/usePerformance';
import { setPerformanceOverrides, resetDeviceDetection } from '@/utils/deviceDetection';
import './shared-ui.css';

export interface DeviceDebugPanelProps {
  /** Show panel by default */
  defaultOpen?: boolean;

  /** Position of the panel */
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

  /** Enable in production (default: false - only dev) */
  enableInProduction?: boolean;
}

export function DeviceDebugPanel({
  defaultOpen = false,
  position = 'bottom-right',
  enableInProduction = false,
}: DeviceDebugPanelProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [fps, setFps] = useState(60);
  const capabilities = useDeviceCapabilities();
  const settings = usePerformanceSettings();

  // Hide in production unless explicitly enabled
  if (process.env.NODE_ENV === 'production' && !enableInProduction) {
    return null;
  }

   
  // FPS monitoring
  useEffect(() => {
    let frameCount = 0;
    let lastTime = performance.now();
    let rafId: number;

    const measureFPS = (currentTime: number) => {
      frameCount++;

      if (currentTime >= lastTime + 1000) {
        const currentFPS = Math.round((frameCount * 1000) / (currentTime - lastTime));
        setFps(currentFPS);
        frameCount = 0;
        lastTime = currentTime;
      }

      rafId = requestAnimationFrame(measureFPS);
    };

    rafId = requestAnimationFrame(measureFPS);

    return () => cancelAnimationFrame(rafId);
  }, []);

  if (!capabilities || !settings) {
    return null;
  }

  const getTierColor = (tier: string) => {
    switch (tier) {
      case 'high':
        return '#10b981'; // Green
      case 'medium':
        return '#f59e0b'; // Orange
      case 'low':
        return '#ef4444'; // Red
      default:
        return '#6b7280'; // Gray
    }
  };

  const getFPSColor = (fps: number) => {
    if (fps >= 55) return '#10b981'; // Green
    if (fps >= 30) return '#f59e0b'; // Orange
    return '#ef4444'; // Red
  };

  const handleOverrideTier = (tier: 'low' | 'medium' | 'high') => {
    const overrides = {
      low: {
        animations: false,
        blurEffects: false,
        shadows: false,
        virtualScrollThreshold: 20,
        maxConcurrentRequests: 2,
      },
      medium: {
        animations: true,
        blurEffects: false,
        shadows: true,
        virtualScrollThreshold: 30,
        maxConcurrentRequests: 4,
      },
      high: {
        animations: true,
        blurEffects: true,
        shadows: true,
        virtualScrollThreshold: 50,
        maxConcurrentRequests: 6,
      },
    };

    setPerformanceOverrides(overrides[tier]);
    window.location.reload();
  };

  const handleReset = () => {
    localStorage.removeItem('myK9Q_perf_overrides');
    resetDeviceDetection();
    window.location.reload();
  };

  return (
    <div className={`device-debug-panel ${position}`}>
      {/* Toggle button */}
      <button
        className="debug-toggle"
        onClick={() => setIsOpen(!isOpen)}
        title="Toggle Device Debug Panel"
      >
        <span className="debug-icon">🔧</span>
        <span className="debug-tier" style={{ color: getTierColor(capabilities.tier) }}>
          {capabilities.tier.toUpperCase()}
        </span>
        <span className="debug-fps" style={{ color: getFPSColor(fps) }}>
          {fps}fps
        </span>
      </button>

      {/* Panel content */}
      {isOpen && (
        <div className="debug-panel-content">
          <div className="debug-header">
            <h3>Device Debug Panel</h3>
            <button className="debug-close" onClick={() => setIsOpen(false)}>
              ✕
            </button>
          </div>

          <div className="debug-section">
            <h4>Device Tier</h4>
            <div className="tier-badge" style={{ backgroundColor: getTierColor(capabilities.tier) }}>
              {capabilities.tier.toUpperCase()}
            </div>
          </div>

          <div className="debug-section">
            <h4>Capabilities</h4>
            <table className="debug-table">
              <tbody>
                <tr>
                  <td>CPU Cores:</td>
                  <td>{capabilities.cores}</td>
                </tr>
                <tr>
                  <td>Memory:</td>
                  <td>{capabilities.memory}GB</td>
                </tr>
                <tr>
                  <td>GPU:</td>
                  <td>{capabilities.gpu}</td>
                </tr>
                <tr>
                  <td>Network:</td>
                  <td>{capabilities.connection}</td>
                </tr>
                <tr>
                  <td>Screen:</td>
                  <td>{capabilities.screen}</td>
                </tr>
                <tr>
                  <td>Touch:</td>
                  <td>{capabilities.touch ? 'Yes' : 'No'}</td>
                </tr>
                <tr>
                  <td>Modern:</td>
                  <td>{capabilities.modern ? 'Yes' : 'No'}</td>
                </tr>
                <tr>
                  <td>Battery Saving:</td>
                  <td>{capabilities.batterySaving ? 'Yes' : 'No'}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="debug-section">
            <h4>Performance Settings</h4>
            <table className="debug-table">
              <tbody>
                <tr>
                  <td>Animations:</td>
                  <td>{settings.animations ? '✅' : '❌'}</td>
                </tr>
                <tr>
                  <td>Blur Effects:</td>
                  <td>{settings.blurEffects ? '✅' : '❌'}</td>
                </tr>
                <tr>
                  <td>Shadows:</td>
                  <td>{settings.shadows ? '✅' : '❌'}</td>
                </tr>
                <tr>
                  <td>Virtual Scroll @:</td>
                  <td>{settings.virtualScrollThreshold} items</td>
                </tr>
                <tr>
                  <td>Prefetch Level:</td>
                  <td>{(settings.prefetchLevel * 100).toFixed(0)}%</td>
                </tr>
                <tr>
                  <td>Image Quality:</td>
                  <td>{(settings.imageQuality * 100).toFixed(0)}%</td>
                </tr>
                <tr>
                  <td>Debounce:</td>
                  <td>{settings.debounceTime}ms</td>
                </tr>
                <tr>
                  <td>Throttle:</td>
                  <td>{settings.throttleTime}ms</td>
                </tr>
                <tr>
                  <td>Max Requests:</td>
                  <td>{settings.maxConcurrentRequests}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="debug-section">
            <h4>FPS Monitor</h4>
            <div className="fps-display">
              <span className="fps-number" style={{ color: getFPSColor(fps) }}>
                {fps}
              </span>
              <span className="fps-label">fps</span>
            </div>
            <div className="fps-bar">
              <div
                className="fps-fill"
                style={{
                  width: `${(fps / 60) * 100}%`,
                  backgroundColor: getFPSColor(fps),
                }}
              />
            </div>
          </div>

          <div className="debug-section">
            <h4>Override Tier</h4>
            <div className="debug-buttons">
              <button
                className="debug-btn debug-btn-low"
                onClick={() => handleOverrideTier('low')}
              >
                Low
              </button>
              <button
                className="debug-btn debug-btn-medium"
                onClick={() => handleOverrideTier('medium')}
              >
                Medium
              </button>
              <button
                className="debug-btn debug-btn-high"
                onClick={() => handleOverrideTier('high')}
              >
                High
              </button>
            </div>
            <button className="debug-btn debug-btn-reset" onClick={handleReset}>
              Reset to Auto
            </button>
          </div>

          <div className="debug-footer">
            <small>DevTools Only • Press F12 to inspect</small>
          </div>
        </div>
      )}
    </div>
  );
}
