/**
 * Navigation Performance Monitor
 * 
 * Tracks navigation performance metrics to monitor the 10-second fix
 */

import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

interface NavigationMetrics {
  route: string;
  loadTime: number;
  isFromCache: boolean;
  timestamp: number;
}

class NavigationPerformanceTracker {
  private metrics: NavigationMetrics[] = [];
  private navigationStart: number = 0;
  
  startNavigation() {
    this.navigationStart = performance.now();
  }
  
  endNavigation(route: string, isFromCache: boolean = false) {
    if (this.navigationStart === 0) return;
    
    const loadTime = performance.now() - this.navigationStart;
    const metric: NavigationMetrics = {
      route,
      loadTime,
      isFromCache,
      timestamp: Date.now(),
    };
    
    this.metrics.push(metric);
    this.navigationStart = 0;
    
    // Log performance in development
    if (import.meta.env.DEV) {
      const status = isFromCache ? '🚀 CACHED' : '📡 NETWORK';
      const color = loadTime < 500 ? '✅' : loadTime < 2000 ? '⚠️' : '❌';
      console.log(`${color} ${status} Navigation to ${route}: ${loadTime.toFixed(2)}ms`);
      
      // Alert if navigation is still slow
      if (loadTime > 5000) {
        console.warn(`🐌 Slow navigation detected: ${loadTime.toFixed(2)}ms to ${route}`);
      }
    }
    
    return metric;
  }
  
  getMetrics(): NavigationMetrics[] {
    return [...this.metrics];
  }
  
  getAverageLoadTime(route?: string): number {
    const relevantMetrics = route 
      ? this.metrics.filter(m => m.route === route)
      : this.metrics;
      
    if (relevantMetrics.length === 0) return 0;
    
    const totalTime = relevantMetrics.reduce((sum, m) => sum + m.loadTime, 0);
    return totalTime / relevantMetrics.length;
  }
  
  getCacheHitRate(): number {
    if (this.metrics.length === 0) return 0;
    
    const cacheHits = this.metrics.filter(m => m.isFromCache).length;
    return (cacheHits / this.metrics.length) * 100;
  }
  
  clear() {
    this.metrics = [];
  }
}

const tracker = new NavigationPerformanceTracker();

export function useNavigationPerformance() {
  const location = useLocation();
  const previousLocation = useRef<string>('');
  
  useEffect(() => {
    const currentPath = location.pathname;
    
    // Start tracking when location changes
    if (previousLocation.current !== currentPath) {
      if (previousLocation.current !== '') {
        // Navigation completed
        tracker.endNavigation(currentPath);
      }
      
      // Start new navigation tracking
      tracker.startNavigation();
      previousLocation.current = currentPath;
    }
  }, [location]);
  
  return {
    startNavigation: () => tracker.startNavigation(),
    endNavigation: (isFromCache?: boolean) => tracker.endNavigation(location.pathname, isFromCache),
    getMetrics: () => tracker.getMetrics(),
    getAverageLoadTime: (route?: string) => tracker.getAverageLoadTime(route),
    getCacheHitRate: () => tracker.getCacheHitRate(),
    clearMetrics: () => tracker.clear(),
  };
}

export { tracker as navigationPerformanceTracker };