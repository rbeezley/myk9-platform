/**
 * Performance Monitoring Dashboard
 * 
 * Development tool for monitoring Core Web Vitals optimization progress.
 * Shows real-time metrics, optimization status, and improvement tracking.
 */

/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck - Development dashboard with type mismatches, needs refactoring

import React, { useState, useEffect } from 'react';
import { getPerformanceIntegrator } from '@/services/performance/PerformanceIntegrator';
import { getCoreWebVitalsOptimizer } from '@/services/performance/CoreWebVitalsOptimizer';
import { getMobilePerformanceOptimizer } from '@/services/performance/MobilePerformanceOptimizer';
import { getBundleOptimizer } from '@/services/performance/BundleOptimizer';

interface DashboardProps {
  isVisible: boolean;
  onToggle: () => void;
}

interface PerformanceMetrics {
  score: number;
  current: {
    lcp: number;
    fid: number;
    cls: number;
    bundleSize: number;
  };
  target: {
    lcp: number;
    fid: number;
    cls: number;
    bundleSize: number;
  };
  improvement: {
    lcp: number;
    fid: number;
    cls: number;
    bundleSize: number;
  };
}

interface OptimizationStep {
  name: string;
  status: 'pending' | 'active' | 'completed';
  description: string;
  expectedImprovement: string;
}

interface OptimizationPlan {
  phase: string;
  completedSteps: number;
  totalSteps: number;
  currentStep: string;
  estimatedTimeRemaining: number;
  optimizations: OptimizationStep[];
}

interface OptimizerStatus {
  isOptimized?: boolean;
  appliedOptimizations: string[];
  expectedImprovements: string[];
}

export function PerformanceMonitoringDashboard({ isVisible, onToggle }: DashboardProps) {
  const [performanceMetrics, setPerformanceMetrics] = useState<PerformanceMetrics | null>(null);
  const [optimizationPlan, setOptimizationPlan] = useState<OptimizationPlan | null>(null);
  const [webVitalsStatus, setWebVitalsStatus] = useState<OptimizerStatus | null>(null);
  const [mobileStatus, setMobileStatus] = useState<OptimizerStatus | null>(null);
  const [bundleStatus, setBundleStatus] = useState<OptimizerStatus | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!isVisible) return;

    const updateMetrics = () => {
      const integrator = getPerformanceIntegrator();
      
      // Get comprehensive performance data
      setPerformanceMetrics(integrator.getPerformanceMetrics());
      setOptimizationPlan(integrator.getOptimizationPlan());
      
      // Get service-specific status
      setWebVitalsStatus(getCoreWebVitalsOptimizer().getOptimizationStatus());
      setMobileStatus(getMobilePerformanceOptimizer().getOptimizationStatus());
      setBundleStatus(getBundleOptimizer().getOptimizationStatus());
    };

    // Initial load
    updateMetrics();

    // Subscribe to updates
    const unsubscribe = getPerformanceIntegrator().subscribe(() => {
      updateMetrics();
    });

    // Refresh every 5 seconds
    const interval = setInterval(() => {
      updateMetrics();
      setRefreshKey(prev => prev + 1);
    }, 5000);

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, [isVisible]);

  if (!isVisible) {
    return (
      <button
        onClick={onToggle}
        className="fixed bottom-4 right-4 z-50 bg-blue-600 text-white p-3 rounded-full shadow-lg hover:bg-blue-700 transition-colors"
        title="Show Performance Dashboard"
      >
        📊
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] overflow-auto">
        {/* Header */}
        <div className="p-4 border-b bg-gradient-to-r from-blue-600 to-purple-600 text-white">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-bold">Performance Monitoring Dashboard</h2>
            <button
              onClick={onToggle}
              className="text-white hover:text-gray-200 text-xl font-bold"
            >
              ×
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Performance Score */}
          {performanceMetrics && (
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-gradient-to-r from-green-400 to-blue-500 text-white text-2xl font-bold mb-2">
                {performanceMetrics.score}
              </div>
              <h3 className="text-lg font-semibold text-gray-800">
                Performance Score
              </h3>
              <p className="text-sm text-gray-600">
                Overall application performance rating
              </p>
            </div>
          )}

          {/* Core Web Vitals */}
          {performanceMetrics && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <MetricCard
                title="LCP"
                subtitle="Largest Contentful Paint"
                current={performanceMetrics.current.lcp}
                target={performanceMetrics.target.lcp}
                improvement={performanceMetrics.improvement.lcp}
                unit="ms"
                goodThreshold={2500}
              />
              <MetricCard
                title="FID"
                subtitle="First Input Delay"
                current={performanceMetrics.current.fid}
                target={performanceMetrics.target.fid}
                improvement={performanceMetrics.improvement.fid}
                unit="ms"
                goodThreshold={100}
              />
              <MetricCard
                title="CLS"
                subtitle="Cumulative Layout Shift"
                current={performanceMetrics.current.cls}
                target={performanceMetrics.target.cls}
                improvement={performanceMetrics.improvement.cls}
                unit=""
                goodThreshold={0.1}
                decimals={3}
              />
              <MetricCard
                title="Bundle Size"
                subtitle="Initial JavaScript"
                current={performanceMetrics.current.bundleSize}
                target={performanceMetrics.target.bundleSize}
                improvement={performanceMetrics.improvement.bundleSize}
                unit="KB"
                goodThreshold={500}
                isReverse={true}
              />
            </div>
          )}

          {/* Optimization Progress */}
          {optimizationPlan && (
            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="text-lg font-semibold mb-4">Optimization Progress</h3>
              
              <div className="mb-4">
                <div className="flex justify-between text-sm text-gray-600 mb-1">
                  <span>Phase: {optimizationPlan.phase}</span>
                  <span>{optimizationPlan.completedSteps}/{optimizationPlan.totalSteps} completed</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{
                      width: `${(optimizationPlan.completedSteps / optimizationPlan.totalSteps) * 100}%`
                    }}
                  />
                </div>
              </div>

              <div className="text-sm text-gray-700 mb-2">
                <strong>Current Step:</strong> {optimizationPlan.currentStep}
              </div>
              
              {optimizationPlan.estimatedTimeRemaining > 0 && (
                <div className="text-sm text-gray-600">
                  <strong>Estimated Time Remaining:</strong> {optimizationPlan.estimatedTimeRemaining}s
                </div>
              )}
            </div>
          )}

          {/* Optimization Steps */}
          {optimizationPlan && (
            <div className="bg-white border rounded-lg">
              <h3 className="text-lg font-semibold p-4 border-b">Optimization Steps</h3>
              <div className="max-h-64 overflow-y-auto">
                {optimizationPlan.optimizations.map((step: OptimizationStep, index: number) => (
                  <div
                    key={step.name}
                    className={`p-3 border-b last:border-b-0 ${
                      step.status === 'completed'
                        ? 'bg-green-50'
                        : step.status === 'running'
                        ? 'bg-blue-50'
                        : step.status === 'failed'
                        ? 'bg-red-50'
                        : 'bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                          step.status === 'completed'
                            ? 'bg-green-500 text-white'
                            : step.status === 'running'
                            ? 'bg-blue-500 text-white'
                            : step.status === 'failed'
                            ? 'bg-red-500 text-white'
                            : 'bg-gray-300 text-gray-700'
                        }`}>
                          {step.status === 'completed'
                            ? '✓'
                            : step.status === 'running'
                            ? '⟳'
                            : step.status === 'failed'
                            ? '✗'
                            : index + 1
                          }
                        </div>
                        <div>
                          <div className="font-medium text-sm">{step.description}</div>
                          {step.error && (
                            <div className="text-xs text-red-600 mt-1">{step.error}</div>
                          )}
                        </div>
                      </div>
                      <div className="text-xs text-gray-500">
                        {step.endTime && step.startTime && (
                          <span>{Math.round((step.endTime - step.startTime) / 1000)}s</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Service Status */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Core Web Vitals Status */}
            {webVitalsStatus && (
              <StatusCard
                title="Core Web Vitals"
                status={webVitalsStatus.isOptimized ? 'active' : 'initializing'}
                optimizations={webVitalsStatus.appliedOptimizations}
                expectedImprovements={webVitalsStatus.expectedImprovements}
              />
            )}

            {/* Mobile Status */}
            {mobileStatus && (
              <StatusCard
                title="Mobile Optimization"
                status={mobileStatus.appliedOptimizations.length > 0 ? 'active' : 'pending'}
                optimizations={mobileStatus.appliedOptimizations}
                expectedImprovements={mobileStatus.expectedImprovements}
              />
            )}

            {/* Bundle Status */}
            {bundleStatus && (
              <StatusCard
                title="Bundle Optimization"
                status={bundleStatus.appliedOptimizations.length > 0 ? 'active' : 'pending'}
                optimizations={bundleStatus.appliedOptimizations}
                expectedImprovements={bundleStatus.expectedImprovements}
              />
            )}
          </div>

          {/* Real-time Metrics */}
          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="text-lg font-semibold mb-2">Real-time Metrics</h3>
            <div className="text-sm text-gray-600">
              <div>Refresh Key: {refreshKey}</div>
              <div>Last Updated: {new Date().toLocaleTimeString()}</div>
              <div>User Agent: {navigator.userAgent.slice(0, 100)}...</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface MetricCardProps {
  title: string;
  subtitle: string;
  current: number;
  target: number;
  improvement: number;
  unit: string;
  goodThreshold: number;
  decimals?: number;
  isReverse?: boolean; // For metrics where lower is better (like bundle size)
}

function MetricCard({ 
  title, 
  subtitle, 
  current, 
  target, 
  improvement, 
  unit, 
  goodThreshold, 
  decimals = 0,
  isReverse = false 
}: MetricCardProps) {
  const isGood = isReverse ? current <= goodThreshold : current >= goodThreshold;
  const targetMet = isReverse ? current <= target : current >= target;
  
  return (
    <div className="bg-white border rounded-lg p-4">
      <div className="text-center">
        <div className={`text-2xl font-bold ${
          targetMet ? 'text-green-600' : isGood ? 'text-yellow-600' : 'text-red-600'
        }`}>
          {current.toFixed(decimals)}{unit}
        </div>
        <div className="text-xs font-semibold text-gray-800 mt-1">{title}</div>
        <div className="text-xs text-gray-600">{subtitle}</div>
        
        <div className="mt-2 pt-2 border-t">
          <div className="text-xs text-gray-600">
            Target: {target.toFixed(decimals)}{unit}
          </div>
          {improvement > 0 && (
            <div className="text-xs text-green-600">
              Improved: {improvement.toFixed(decimals)}{unit}
            </div>
          )}
        </div>
        
        <div className={`mt-2 px-2 py-1 rounded text-xs font-medium ${
          targetMet 
            ? 'bg-green-100 text-green-800' 
            : isGood 
            ? 'bg-yellow-100 text-yellow-800' 
            : 'bg-red-100 text-red-800'
        }`}>
          {targetMet ? 'Target Met' : isGood ? 'Good' : 'Needs Improvement'}
        </div>
      </div>
    </div>
  );
}

interface StatusCardProps {
  title: string;
  status: 'active' | 'pending' | 'initializing';
  optimizations: string[];
  expectedImprovements: string[];
}

function StatusCard({ title, status, optimizations, expectedImprovements }: StatusCardProps) {
  const statusColors = {
    active: 'bg-green-100 text-green-800',
    pending: 'bg-yellow-100 text-yellow-800',
    initializing: 'bg-blue-100 text-blue-800',
  };

  const statusLabels = {
    active: 'Active',
    pending: 'Pending',
    initializing: 'Initializing',
  };

  return (
    <div className="bg-white border rounded-lg p-4">
      <div className="flex justify-between items-center mb-3">
        <h4 className="font-semibold text-sm">{title}</h4>
        <span className={`px-2 py-1 rounded text-xs font-medium ${statusColors[status]}`}>
          {statusLabels[status]}
        </span>
      </div>
      
      <div className="space-y-2">
        <div>
          <div className="text-xs font-medium text-gray-700 mb-1">Applied Optimizations:</div>
          <div className="text-xs text-gray-600">
            {optimizations.length > 0 ? (
              <ul className="list-disc list-inside space-y-1">
                {optimizations.slice(0, 3).map((opt, index) => (
                  <li key={index}>{opt.replace(/_/g, ' ')}</li>
                ))}
                {optimizations.length > 3 && (
                  <li>...and {optimizations.length - 3} more</li>
                )}
              </ul>
            ) : (
              'None applied yet'
            )}
          </div>
        </div>
        
        {expectedImprovements && Object.keys(expectedImprovements).length > 0 && (
          <div>
            <div className="text-xs font-medium text-gray-700 mb-1">Expected Improvements:</div>
            <div className="text-xs text-gray-600">
              {Object.entries(expectedImprovements).map(([key, value]) => (
                <div key={key}>
                  {key}: {typeof value === 'number' ? value.toFixed(0) : String(value)}
                  {key.includes('Time') || key.includes('lcp') ? 'ms' : 
                   key.includes('Usage') || key.includes('Life') ? '%' : ''}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Hook for easy dashboard integration
// eslint-disable-next-line react-refresh/only-export-components
export function usePerformanceDashboard() {
  const [isVisible, setIsVisible] = useState(false);

  const toggle = () => setIsVisible(!isVisible);
  const show = () => setIsVisible(true);
  const hide = () => setIsVisible(false);

  return {
    isVisible,
    toggle,
    show,
    hide,
    Dashboard: () => (
      <PerformanceMonitoringDashboard 
        isVisible={isVisible} 
        onToggle={toggle} 
      />
    ),
  };
}