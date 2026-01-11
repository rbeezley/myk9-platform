/**
 * Network Condition Detector
 *
 * Detects network conditions for adaptive loading strategies.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import type { NetworkCondition } from './types';

/**
 * Detect current network conditions
 */
export function detectNetworkConditions(): NetworkCondition {
  // Check if navigator is available (for SSR compatibility)
  if (typeof navigator === 'undefined') {
    return {
      effectiveType: '3g',
      downlink: 1.5,
      rtt: 300,
      saveData: false,
    };
  }

  const connection = (navigator as any).connection ||
    (navigator as any).mozConnection ||
    (navigator as any).webkitConnection;

  if (connection) {
    return {
      effectiveType: connection.effectiveType || '4g',
      downlink: connection.downlink || 10,
      rtt: connection.rtt || 100,
      saveData: connection.saveData || false,
    };
  }

  // Fallback: assume moderate 3G connection
  return {
    effectiveType: '3g',
    downlink: 1.5,
    rtt: 300,
    saveData: false,
  };
}

/**
 * Check if network is slow (2G or slow-2g)
 */
export function isSlowNetwork(network: NetworkCondition): boolean {
  return network.effectiveType === '2g' || network.effectiveType === 'slow-2g';
}

/**
 * Check if data saver should be applied
 */
export function shouldApplyDataSaver(network: NetworkCondition): boolean {
  return network.saveData || isSlowNetwork(network);
}

/**
 * Get recommended max concurrent requests based on network
 */
export function getMaxConcurrentRequests(network: NetworkCondition): number {
  switch (network.effectiveType) {
    case 'slow-2g':
    case '2g':
      return 2;
    case '3g':
      return 4;
    case '4g':
    default:
      return 6;
  }
}

/**
 * Get recommended prefetch delay based on network
 */
export function getPrefetchDelay(network: NetworkCondition): number {
  switch (network.effectiveType) {
    case 'slow-2g':
    case '2g':
      return 5000;
    case '3g':
      return 3000;
    case '4g':
    default:
      return 1000;
  }
}

/**
 * Set up network change monitoring
 */
export function setupNetworkChangeMonitoring(
  onNetworkChange: (newNetwork: NetworkCondition, oldNetwork: NetworkCondition) => void
): () => void {
  const connection = (navigator as any).connection;

  if (!connection) {
    return () => {}; // No-op cleanup
  }

  let currentNetwork = detectNetworkConditions();

  const handleChange = () => {
    const newNetwork = detectNetworkConditions();
    onNetworkChange(newNetwork, currentNetwork);
    currentNetwork = newNetwork;
  };

  connection.addEventListener('change', handleChange);

  // Return cleanup function
  return () => {
    connection.removeEventListener('change', handleChange);
  };
}
