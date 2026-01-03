/**
 * Performance Statistics Component
 * 
 * Development-only component to monitor navigation performance improvements
 */

import React, { useState, useEffect } from 'react';
import { useNavigationPerformance } from '@/hooks/useNavigationPerformance';

interface NavigationMetrics {
  route: string;
  loadTime: number;
  isFromCache: boolean;
  timestamp: number;
}

export const PerformanceStats: React.FC = () => {
  const { getMetrics, getAverageLoadTime, getCacheHitRate } = useNavigationPerformance();
  const [isVisible, setIsVisible] = useState(false);
  const [metrics, setMetrics] = useState<NavigationMetrics[]>([]);

  useEffect(() => {
    const interval = setInterval(() => {
      setMetrics(getMetrics());
    }, 1000);

    return () => clearInterval(interval);
  }, [getMetrics]);

  // Only show in development
  if (!import.meta.env.DEV || !isVisible) {
    return (
      <button
        onClick={() => setIsVisible(true)}
        className="fixed bottom-4 right-4 bg-blue-500 text-white p-2 rounded text-xs z-50"
        style={{ display: import.meta.env.DEV ? 'block' : 'none' }}
      >
        📊 Perf
      </button>
    );
  }

  const avgShowDetailsTime = getAverageLoadTime('/shows/');
  const cacheHitRate = getCacheHitRate();
  const recentMetrics = metrics.slice(-5);

  return (
    <div className="fixed bottom-4 right-4 bg-black/90 text-white p-4 rounded-lg text-xs max-w-sm z-50">
      <div className="flex justify-between items-center mb-2">
        <h3 className="font-bold">Navigation Performance</h3>
        <button onClick={() => setIsVisible(false)} className="text-red-400">✕</button>
      </div>
      
      <div className="space-y-2">
        <div>
          <div className="text-yellow-300">Avg Show Details Load Time:</div>
          <div className={avgShowDetailsTime < 500 ? 'text-green-400' : avgShowDetailsTime < 2000 ? 'text-yellow-400' : 'text-red-400'}>
            {avgShowDetailsTime.toFixed(0)}ms
          </div>
        </div>
        
        <div>
          <div className="text-yellow-300">Cache Hit Rate:</div>
          <div className={cacheHitRate > 80 ? 'text-green-400' : 'text-yellow-400'}>
            {cacheHitRate.toFixed(1)}%
          </div>
        </div>
        
        <div>
          <div className="text-yellow-300">Recent Navigations:</div>
          <div className="max-h-32 overflow-y-auto">
            {recentMetrics.map((metric, i) => (
              <div key={i} className="flex justify-between text-xs">
                <span className="truncate">{metric.route}</span>
                <span className={metric.loadTime < 500 ? 'text-green-400' : metric.loadTime < 2000 ? 'text-yellow-400' : 'text-red-400'}>
                  {metric.loadTime.toFixed(0)}ms {metric.isFromCache ? '🚀' : '📡'}
                </span>
              </div>
            ))}
          </div>
        </div>
        
        <div className="text-xs text-gray-400 mt-2">
          Target: &lt;500ms for optimal UX
        </div>
      </div>
    </div>
  );
};