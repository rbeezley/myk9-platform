import { useEffect } from 'react';
import { useSettingsStore, initializeSettings } from '../stores/settingsStore';
import { performanceMonitor } from '../services/performanceMonitor';
import { notificationIntegration } from '../services/notificationIntegration';
import voiceAnnouncementService from '../services/voiceAnnouncementService';
import { subscriptionCleanup } from '../services/subscriptionCleanup';
import { metricsApiService } from '../services/metricsApiService';
import { scheduleAutoCleanup } from '../utils/cacheManager';
import { applyDeviceClasses, startPerformanceMonitoring } from '../utils/deviceDetection';

/**
 * Custom hook to handle application initialization
 *
 * Responsibilities:
 * - Initialize user settings
 * - Apply device-specific CSS classes
 * - Start performance monitoring
 * - Set up notification integration
 * - Schedule auto-cleanup tasks
 * - Set up subscription auto-cleanup
 * - Handle performance report on page unload
 *
 * @returns void
 */
export function useAppInitialization() {
  useEffect(() => {
    let cancelled = false;

    // Initialize user settings
    if (!cancelled) {
      initializeSettings();
    }

    // Initialize voice announcement service configuration from settings
    // Note: The service now subscribes to the settings store directly (see voiceAnnouncementService.ts)
    // We just need to configure the voice settings here
    const initVoiceConfig = () => {
      const { settings } = useSettingsStore.getState();
      const voices = voiceAnnouncementService.getAvailableVoices();
      const selectedVoice = settings.voiceName
        ? voices.find(v => v.name === settings.voiceName) || null
        : null;
      voiceAnnouncementService.setDefaultConfig({
        voice: selectedVoice,
        lang: navigator.language || 'en-US',
        rate: settings.voiceRate,
      });
    };

    initVoiceConfig();

    // Subscribe to settings changes to update voice configuration
    const unsubscribeVoice = useSettingsStore.subscribe((state) => {
      const voices = voiceAnnouncementService.getAvailableVoices();
      const selectedVoice = state.settings.voiceName
        ? voices.find(v => v.name === state.settings.voiceName) || null
        : null;
      voiceAnnouncementService.setDefaultConfig({
        voice: selectedVoice,
        lang: navigator.language || 'en-US',
        rate: state.settings.voiceRate,
      });
    });

    // Apply device-specific CSS classes
    applyDeviceClasses();

    // Start monitoring performance
    const stopMonitoring = startPerformanceMonitoring();

    // Initialize performance monitoring
    performanceMonitor.setEnabled(true);

    // Initialize notification integration
    notificationIntegration.initialize();

    // Schedule auto-cleanup
    scheduleAutoCleanup();

    // Start subscription auto-cleanup (cleanup every 30 seconds)
    const stopAutoCleanup = subscriptionCleanup.startAutoCleanup(30);

    // Handle performance report on unload
    const handleBeforeUnload = async () => {
      const { settings } = useSettingsStore.getState();
      if (settings.enablePerformanceMonitoring && performanceMonitor.hasProblems()) {
        const report = performanceMonitor.generateReport();
        await metricsApiService.sendPerformanceReport(report, 'unknown');
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    // Cleanup function
    return () => {
      cancelled = true;
      stopMonitoring();
      stopAutoCleanup();
      unsubscribeVoice();
      notificationIntegration.destroy();
      subscriptionCleanup.cleanupAll();
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);
}
