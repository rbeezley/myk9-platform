/**
 * Animation Settings Hook
 *
 * Provides animation configuration based on device capabilities,
 * user settings, and current performance metrics.
 */

import { useState, useEffect, useMemo } from 'react';
import { getDeviceTier } from '@/utils/deviceDetection';
import { useSettingsStore } from '@/stores/settingsStore';

export interface AnimationConfig {
  /** Enable all animations */
  enabled: boolean;

  /** Reduce animation complexity */
  reduced: boolean;

  /** Animation duration multiplier (0.5 = 2x faster, 2 = 2x slower) */
  durationMultiplier: number;

  /** Enable GPU acceleration */
  gpuAcceleration: boolean;

  /** Enable blur effects */
  blur: boolean;

  /** Enable shadow effects */
  shadows: boolean;

  /** Enable transform animations */
  transforms: boolean;

  /** Enable opacity animations */
  opacity: boolean;

  /** Enable motion path animations */
  motionPath: boolean;

  /** Preferred easing function */
  easing: string;

  /** Target frame rate */
  targetFps: number;
}

/**
 * Get animation configuration based on device and settings
 */
export function useAnimationSettings(): AnimationConfig {
  const settings = useSettingsStore((state) => state.settings);
  const [deviceTier, setDeviceTier] = useState<'low' | 'medium' | 'high'>('medium');
  const [currentFps, setCurrentFps] = useState(60);

  useEffect(() => {
    // Detect device tier
    getDeviceTier().then(setDeviceTier);

    // Measure FPS only for first 2 seconds, then stop (battery optimization)
    // This gets an initial performance baseline without continuous CPU/GPU wake
    let rafId: number;
    let lastTime = performance.now();
    let frameCount = 0;
    const startTime = performance.now();
    const MEASUREMENT_DURATION = 2000; // Only measure for 2 seconds

    const measureFps = (currentTime: number) => {
      frameCount++;

      if (currentTime >= lastTime + 1000) {
        const fps = Math.round((frameCount * 1000) / (currentTime - lastTime));
        setCurrentFps(fps);
        frameCount = 0;
        lastTime = currentTime;
      }

      // Stop measuring after 2 seconds to save battery
      if (currentTime - startTime < MEASUREMENT_DURATION) {
        rafId = requestAnimationFrame(measureFps);
      }
    };

    rafId = requestAnimationFrame(measureFps);

    return () => cancelAnimationFrame(rafId);
  }, []);

  const config = useMemo((): AnimationConfig => {
    // Start with user's explicit settings
    let enabled = settings.enableAnimations;
    let blur = settings.enableBlur;
    let shadows = settings.enableShadows;

    // If settings are null, use auto-detection
    if (enabled === null) {
      enabled = deviceTier !== 'low';
    }

    if (blur === null) {
      blur = deviceTier === 'high';
    }

    if (shadows === null) {
      shadows = deviceTier === 'high';
    }

    // Check reduce motion preference (OS setting only)
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reducedMotion) {
      enabled = false;
    }

    // Adjust for low FPS
    const performanceMode = currentFps < 30 ? 'low' : deviceTier;

    // Build configuration
    const config: AnimationConfig = {
      enabled,
      reduced: reducedMotion || performanceMode === 'low',
      durationMultiplier: 1,
      gpuAcceleration: true,
      blur,
      shadows,
      transforms: enabled,
      opacity: enabled,
      motionPath: enabled && performanceMode !== 'low',
      easing: 'cubic-bezier(0.4, 0.0, 0.2, 1)', // Material Design standard easing
      targetFps: 60,
    };

    // Adjust for device tier
    if (performanceMode === 'low') {
      config.durationMultiplier = 0.5; // Faster animations
      config.gpuAcceleration = true; // Force GPU for better performance
      config.blur = false;
      config.shadows = false;
      config.motionPath = false;
      config.targetFps = 30;
      config.easing = 'ease-out'; // Simpler easing
    } else if (performanceMode === 'medium') {
      config.durationMultiplier = 0.75;
      config.targetFps = 45;
      config.motionPath = false;
    }

    // If reduced motion, use only essential animations
    if (config.reduced) {
      config.durationMultiplier = 0.3; // Very fast
      config.transforms = false;
      config.motionPath = false;
      config.easing = 'linear'; // No easing for reduced motion
    }

    return config;
  }, [settings, deviceTier, currentFps]);

  return config;
}

/**
 * Get CSS animation properties based on configuration
 */
export function useAnimationProps(config: AnimationConfig) {
  return useMemo(() => {
    if (!config.enabled) {
      return {
        transition: 'none',
        animation: 'none',
      };
    }

    const duration = `${300 * config.durationMultiplier}ms`;
    const easing = config.easing;

    return {
      transitionDuration: duration,
      transitionTimingFunction: easing,
      willChange: config.gpuAcceleration ? 'transform, opacity' : 'auto',
    };
  }, [config]);
}

/**
 * Get recommended animation duration
 */
export function useAnimationDuration(
  baseDuration: number = 300
): number {
  const config = useAnimationSettings();

  if (!config.enabled) {
    return 0;
  }

  return Math.round(baseDuration * config.durationMultiplier);
}

/**
 * Check if a specific animation type should be enabled
 */
export function useCanAnimate(
  animationType: 'transform' | 'opacity' | 'blur' | 'shadow' | 'motionPath'
): boolean {
  const config = useAnimationSettings();

  if (!config.enabled) {
    return false;
  }

  switch (animationType) {
    case 'transform':
      return config.transforms;
    case 'opacity':
      return config.opacity;
    case 'blur':
      return config.blur;
    case 'shadow':
      return config.shadows;
    case 'motionPath':
      return config.motionPath;
    default:
      return false;
  }
}

/**
 * Spring animation config based on device capabilities
 */
export function useSpringConfig() {
  const config = useAnimationSettings();

  return useMemo(() => {
    if (!config.enabled || config.reduced) {
      return {
        tension: 300,
        friction: 30,
        duration: 0,
      };
    }

    // Adjust spring physics for device tier
    if (config.targetFps <= 30) {
      return {
        tension: 200,
        friction: 25,
      };
    }

    return {
      tension: 170,
      friction: 26,
    };
  }, [config]);
}

/**
 * Request animation frame with FPS throttling
 */
export function useThrottledRaf(
  callback: (time: number) => void,
  enabled: boolean = true
): void {
  const config = useAnimationSettings();

  useEffect(() => {
    if (!enabled || !config.enabled) {
      return;
    }

    let rafId: number;
    let lastTime = 0;
    const interval = 1000 / config.targetFps;

    const animate = (currentTime: number) => {
      rafId = requestAnimationFrame(animate);

      const delta = currentTime - lastTime;

      if (delta >= interval) {
        lastTime = currentTime - (delta % interval);
        callback(currentTime);
      }
    };

    rafId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(rafId);
    };
  }, [callback, enabled, config]);
}

/**
 * Prefers reduced motion media query hook
 */
export function usePrefersReducedMotion(): boolean {
  const [prefersReduced, setPrefersReduced] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

    const handleChange = (e: MediaQueryListEvent) => {
      setPrefersReduced(e.matches);
    };

    // Modern browsers
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }
    // Legacy browsers
    else if (mediaQuery.addListener) {
      mediaQuery.addListener(handleChange);
      return () => mediaQuery.removeListener(handleChange);
    }

    return () => {};
  }, []);

  return prefersReduced;
}

/**
 * Get CSS class names for animation configuration
 */
export function useAnimationClasses(): string {
  const config = useAnimationSettings();

  return useMemo(() => {
    const classes: string[] = [];

    if (!config.enabled) {
      classes.push('no-animations');
    }

    if (config.reduced) {
      classes.push('reduce-animations');
    }

    if (config.gpuAcceleration) {
      classes.push('gpu-accelerated');
    }

    if (!config.blur) {
      classes.push('no-blur');
    }

    if (!config.shadows) {
      classes.push('no-shadows');
    }

    return classes.join(' ');
  }, [config]);
}
