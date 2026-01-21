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
import { cn } from '@/lib/utils';

/** Position styles for the debug panel */
const positionStyles = {
  'top-left': 'top-4 left-4',
  'top-right': 'top-4 right-4',
  'bottom-left': 'bottom-4 left-4',
  'bottom-right': 'bottom-4 right-4',
};

/** Tailwind styles for DeviceDebugPanel */
const styles = {
  container: "fixed z-[9999]",
  toggle: cn(
    "flex items-center gap-2 px-3 py-2 rounded-lg",
    "bg-gray-900/90 text-white text-xs font-mono",
    "border border-gray-700 shadow-lg backdrop-blur-sm",
    "cursor-pointer transition-all duration-150",
    "hover:bg-gray-800"
  ),
  toggleIcon: "text-base",
  toggleTier: "font-bold",
  toggleFps: "font-medium",
  panel: cn(
    "absolute mt-2 w-80 max-h-[80vh] overflow-y-auto",
    "bg-gray-900/95 text-white rounded-xl",
    "border border-gray-700 shadow-2xl backdrop-blur-sm"
  ),
  header: cn(
    "flex items-center justify-between",
    "px-4 py-3 border-b border-gray-700"
  ),
  headerTitle: "text-sm font-bold",
  closeBtn: cn(
    "w-6 h-6 flex items-center justify-center rounded",
    "text-gray-400 hover:text-white hover:bg-gray-700",
    "transition-colors duration-150"
  ),
  section: "px-4 py-3 border-b border-gray-800",
  sectionTitle: "text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2",
  tierBadge: cn(
    "inline-block px-3 py-1 rounded-full",
    "text-sm font-bold text-white"
  ),
  table: "w-full text-xs",
  tableRow: "border-b border-gray-800/50 last:border-0",
  tableLabel: "py-1.5 text-gray-400",
  tableValue: "py-1.5 text-right font-mono",
  fpsDisplay: "flex items-baseline justify-center gap-1 mb-2",
  fpsNumber: "text-4xl font-bold font-mono",
  fpsLabel: "text-gray-400 text-sm",
  fpsBar: cn(
    "h-2 rounded-full overflow-hidden",
    "bg-gray-800"
  ),
  fpsFill: "h-full transition-all duration-300 rounded-full",
  buttons: "flex gap-2 mb-3",
  btn: cn(
    "flex-1 px-3 py-2 rounded-lg text-xs font-medium",
    "transition-colors duration-150"
  ),
  btnLow: "bg-red-500/20 text-red-400 hover:bg-red-500/30",
  btnMedium: "bg-amber-500/20 text-amber-400 hover:bg-amber-500/30",
  btnHigh: "bg-green-500/20 text-green-400 hover:bg-green-500/30",
  btnReset: cn(
    "w-full px-3 py-2 rounded-lg text-xs font-medium",
    "bg-gray-700 text-gray-300 hover:bg-gray-600",
    "transition-colors duration-150"
  ),
  footer: cn(
    "px-4 py-2 text-center",
    "text-[10px] text-gray-500"
  ),
};

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
    <div className={cn(styles.container, positionStyles[position])}>
      {/* Toggle button */}
      <button
        className={styles.toggle}
        onClick={() => setIsOpen(!isOpen)}
        title="Toggle Device Debug Panel"
      >
        <span className={styles.toggleIcon}>🔧</span>
        <span className={styles.toggleTier} style={{ color: getTierColor(capabilities.tier) }}>
          {capabilities.tier.toUpperCase()}
        </span>
        <span className={styles.toggleFps} style={{ color: getFPSColor(fps) }}>
          {fps}fps
        </span>
      </button>

      {/* Panel content */}
      {isOpen && (
        <div className={styles.panel}>
          <div className={styles.header}>
            <h3 className={styles.headerTitle}>Device Debug Panel</h3>
            <button className={styles.closeBtn} onClick={() => setIsOpen(false)}>
              ✕
            </button>
          </div>

          <div className={styles.section}>
            <h4 className={styles.sectionTitle}>Device Tier</h4>
            <div className={styles.tierBadge} style={{ backgroundColor: getTierColor(capabilities.tier) }}>
              {capabilities.tier.toUpperCase()}
            </div>
          </div>

          <div className={styles.section}>
            <h4 className={styles.sectionTitle}>Capabilities</h4>
            <table className={styles.table}>
              <tbody>
                <tr className={styles.tableRow}>
                  <td className={styles.tableLabel}>CPU Cores:</td>
                  <td className={styles.tableValue}>{capabilities.cores}</td>
                </tr>
                <tr className={styles.tableRow}>
                  <td className={styles.tableLabel}>Memory:</td>
                  <td className={styles.tableValue}>{capabilities.memory}GB</td>
                </tr>
                <tr className={styles.tableRow}>
                  <td className={styles.tableLabel}>GPU:</td>
                  <td className={styles.tableValue}>{capabilities.gpu}</td>
                </tr>
                <tr className={styles.tableRow}>
                  <td className={styles.tableLabel}>Network:</td>
                  <td className={styles.tableValue}>{capabilities.connection}</td>
                </tr>
                <tr className={styles.tableRow}>
                  <td className={styles.tableLabel}>Screen:</td>
                  <td className={styles.tableValue}>{capabilities.screen}</td>
                </tr>
                <tr className={styles.tableRow}>
                  <td className={styles.tableLabel}>Touch:</td>
                  <td className={styles.tableValue}>{capabilities.touch ? 'Yes' : 'No'}</td>
                </tr>
                <tr className={styles.tableRow}>
                  <td className={styles.tableLabel}>Modern:</td>
                  <td className={styles.tableValue}>{capabilities.modern ? 'Yes' : 'No'}</td>
                </tr>
                <tr className={styles.tableRow}>
                  <td className={styles.tableLabel}>Battery Saving:</td>
                  <td className={styles.tableValue}>{capabilities.batterySaving ? 'Yes' : 'No'}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className={styles.section}>
            <h4 className={styles.sectionTitle}>Performance Settings</h4>
            <table className={styles.table}>
              <tbody>
                <tr className={styles.tableRow}>
                  <td className={styles.tableLabel}>Animations:</td>
                  <td className={styles.tableValue}>{settings.animations ? '✅' : '❌'}</td>
                </tr>
                <tr className={styles.tableRow}>
                  <td className={styles.tableLabel}>Blur Effects:</td>
                  <td className={styles.tableValue}>{settings.blurEffects ? '✅' : '❌'}</td>
                </tr>
                <tr className={styles.tableRow}>
                  <td className={styles.tableLabel}>Shadows:</td>
                  <td className={styles.tableValue}>{settings.shadows ? '✅' : '❌'}</td>
                </tr>
                <tr className={styles.tableRow}>
                  <td className={styles.tableLabel}>Virtual Scroll @:</td>
                  <td className={styles.tableValue}>{settings.virtualScrollThreshold} items</td>
                </tr>
                <tr className={styles.tableRow}>
                  <td className={styles.tableLabel}>Prefetch Level:</td>
                  <td className={styles.tableValue}>{(settings.prefetchLevel * 100).toFixed(0)}%</td>
                </tr>
                <tr className={styles.tableRow}>
                  <td className={styles.tableLabel}>Image Quality:</td>
                  <td className={styles.tableValue}>{(settings.imageQuality * 100).toFixed(0)}%</td>
                </tr>
                <tr className={styles.tableRow}>
                  <td className={styles.tableLabel}>Debounce:</td>
                  <td className={styles.tableValue}>{settings.debounceTime}ms</td>
                </tr>
                <tr className={styles.tableRow}>
                  <td className={styles.tableLabel}>Throttle:</td>
                  <td className={styles.tableValue}>{settings.throttleTime}ms</td>
                </tr>
                <tr className={styles.tableRow}>
                  <td className={styles.tableLabel}>Max Requests:</td>
                  <td className={styles.tableValue}>{settings.maxConcurrentRequests}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className={styles.section}>
            <h4 className={styles.sectionTitle}>FPS Monitor</h4>
            <div className={styles.fpsDisplay}>
              <span className={styles.fpsNumber} style={{ color: getFPSColor(fps) }}>
                {fps}
              </span>
              <span className={styles.fpsLabel}>fps</span>
            </div>
            <div className={styles.fpsBar}>
              <div
                className={styles.fpsFill}
                style={{
                  width: `${(fps / 60) * 100}%`,
                  backgroundColor: getFPSColor(fps),
                }}
              />
            </div>
          </div>

          <div className={styles.section}>
            <h4 className={styles.sectionTitle}>Override Tier</h4>
            <div className={styles.buttons}>
              <button
                className={cn(styles.btn, styles.btnLow)}
                onClick={() => handleOverrideTier('low')}
              >
                Low
              </button>
              <button
                className={cn(styles.btn, styles.btnMedium)}
                onClick={() => handleOverrideTier('medium')}
              >
                Medium
              </button>
              <button
                className={cn(styles.btn, styles.btnHigh)}
                onClick={() => handleOverrideTier('high')}
              >
                High
              </button>
            </div>
            <button className={styles.btnReset} onClick={handleReset}>
              Reset to Auto
            </button>
          </div>

          <div className={styles.footer}>
            <small>DevTools Only • Press F12 to inspect</small>
          </div>
        </div>
      )}
    </div>
  );
}
