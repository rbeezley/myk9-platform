import { useState, useEffect } from 'react';
import { monitoring } from '../../services/MonitoringService';
import { logger } from '@/services/LoggingService';

export const useResourcePreloading = (resources: Array<{
  href: string;
  as: 'script' | 'style' | 'image' | 'font' | 'document';
  crossorigin?: 'anonymous' | 'use-credentials';
}>) => {
  const [preloadedResources, setPreloadedResources] = useState<Set<string>>(new Set());

  useEffect(() => {
    const preloadResource = (resource: typeof resources[0]) => {
      if (preloadedResources.has(resource.href)) return;

      const link = document.createElement('link');
      link.rel = 'preload';
      link.href = resource.href;
      link.as = resource.as;
      if (resource.crossorigin) {
        link.crossOrigin = resource.crossorigin;
      }

      link.onload = () => {
        setPreloadedResources(prev => new Set(prev).add(resource.href));
        monitoring.recordPerformanceMetric('preload.success', 1, 'count');
      };

      link.onerror = () => {
        logger.warn(`Failed to preload resource: ${resource.href}`, 'performance');
        monitoring.recordPerformanceMetric('preload.error', 1, 'count');
      };

      document.head.appendChild(link);
    };

    resources.forEach(preloadResource);
  }, [resources, preloadedResources]);

  return { preloadedResources };
};
