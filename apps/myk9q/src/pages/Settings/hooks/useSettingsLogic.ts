import { useState, useRef, useEffect, useCallback } from 'react';
import { useSettingsStore } from '@/stores/settingsStore';
import { useAuth } from '@/contexts/AuthContext';
import { getStorageUsage } from '@/services/dataExportService';
import PushNotificationService from '@/services/pushNotificationService';
import voiceAnnouncementService from '@/services/voiceAnnouncementService';
import { logger } from '@/utils/logger';
import {
    exportPersonalDataHelper,
    clearAllDataHelper,
    exportSettingsToFile,
    importSettingsFromFile,
    resetOnboarding,
    reloadPage
} from '../utils/settingsHelpers';

export function useSettingsLogic() {
    const { settings, updateSettings, resetSettings, exportSettings, importSettings } = useSettingsStore();
    const { showContext, role } = useAuth();

    // UI State
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
    const [showResetConfirm, setShowResetConfirm] = useState(false);
    const [showClearDataConfirm, setShowClearDataConfirm] = useState(false);
    const [isClearing, setIsClearing] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [storageUsage, setStorageUsage] = useState<{ estimated: number; quota: number; percentUsed: number; localStorageSize: number } | null>(null);

    // Push Notification State
    const [isPushSubscribed, setIsPushSubscribed] = useState(false);
    const [isSubscribing, setIsSubscribing] = useState(false);
    const [permissionState, setPermissionState] = useState<NotificationPermission>('default');
    const [browserCompatibility, setBrowserCompatibility] = useState<ReturnType<typeof PushNotificationService.getBrowserCompatibility> | null>(null);

    // Refs
    const fileInputRef = useRef<HTMLInputElement>(null);
    const devModeTapCount = useRef(0);
    const devModeTimer = useRef<NodeJS.Timeout | null>(null);

    // --- Effects ---

    // Load storage usage
    useEffect(() => {
        getStorageUsage().then(setStorageUsage);
    }, []);

    // Initialize Push Notifications
    useEffect(() => {
        PushNotificationService.isSubscribed().then(setIsPushSubscribed);
        PushNotificationService.getPermissionState().then(setPermissionState);
        setBrowserCompatibility(PushNotificationService.getBrowserCompatibility());
    }, []);

    // Configure Voice Service
    useEffect(() => {
        voiceAnnouncementService.setEnabled(settings.voiceAnnouncements);
        const voices = voiceAnnouncementService.getAvailableVoices();
        const selectedVoice = settings.voiceName
            ? voices.find(v => v.name === settings.voiceName) || null
            : null;

        voiceAnnouncementService.setDefaultConfig({
            voice: selectedVoice,
            lang: navigator.language || 'en-US',
            rate: settings.voiceRate,
        });
    }, [settings.voiceAnnouncements, settings.voiceRate, settings.voiceName]);

    // --- Actions ---

    const showToastMessage = useCallback((message: string, type: 'success' | 'error' | 'info' = 'success') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 5000);
    }, []);

    const handleDevModeTap = useCallback(() => {
        devModeTapCount.current += 1;

        if (devModeTimer.current) clearTimeout(devModeTimer.current);

        devModeTimer.current = setTimeout(() => {
            devModeTapCount.current = 0;
        }, 1000);

        if (devModeTapCount.current === 7) {
            updateSettings({ developerMode: !settings.developerMode });
            showToastMessage(
                settings.developerMode ? 'Developer Mode Disabled' : 'Developer Mode Enabled 👩‍💻',
                'info'
            );
            devModeTapCount.current = 0;
        }
    }, [settings.developerMode, updateSettings, showToastMessage]);

    const handlePushToggle = async (enabled: boolean) => {
        updateSettings({ enableNotifications: enabled });

        if (enabled) {
            if (!showContext?.licenseKey || !role) {
                showToastMessage('Please log in to enable push notifications', 'error');
                updateSettings({ enableNotifications: false });
                return;
            }

            setIsSubscribing(true);
            try {
                // Get favorites logic (simplified for brevity, logic remains same)
                const favoritesKey = `dog_favorites_${showContext.licenseKey}`;
                const savedFavorites = localStorage.getItem(favoritesKey);
                let favoriteArmbands: number[] = [];
                if (savedFavorites) {
                    try { favoriteArmbands = JSON.parse(savedFavorites); } catch (_e) {
                        // Ignore parse errors
                    }
                }

                const success = await PushNotificationService.subscribe(role, showContext.licenseKey, favoriteArmbands);
                setPermissionState(await PushNotificationService.getPermissionState());

                if (success) {
                    setIsPushSubscribed(true);
                    showToastMessage('Push notifications enabled!', 'success');
                } else {
                    showToastMessage('Failed to enable. Check browser permissions.', 'error');
                    updateSettings({ enableNotifications: false });
                }
            } catch (error) {
                logger.error('Subscribe error:', error);
                showToastMessage('Failed to enable push notifications', 'error');
                updateSettings({ enableNotifications: false });
            } finally {
                setIsSubscribing(false);
            }
        } else {
            setIsSubscribing(true);
            try {
                await PushNotificationService.unsubscribe();
                setIsPushSubscribed(false);
                showToastMessage('Push notifications disabled', 'info');
            } catch (_error) {
                showToastMessage('Failed to disable push notifications', 'error');
                updateSettings({ enableNotifications: true });
            } finally {
                setIsSubscribing(false);
            }
        }
    };

    const handleClearData = async () => {
        setShowClearDataConfirm(false);
        setIsClearing(true);
        try {
            const usage = await clearAllDataHelper(showToastMessage, {
                keepAuth: true,
                keepSettings: false,
                keepFavorites: false
            });
            setStorageUsage(usage);
        } finally {
            setIsClearing(false);
        }
    };

    const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        await importSettingsFromFile(file, importSettings, showToastMessage, fileInputRef);
    };

    return {
        // State
        settings,
        toast,
        showResetConfirm,
        showClearDataConfirm,
        isClearing,
        searchQuery,
        storageUsage,
        isPushSubscribed,
        isSubscribing,
        permissionState,
        browserCompatibility,
        fileInputRef,
        role,
        showContext,

        // Setters
        setSearchQuery,
        setShowResetConfirm,
        setShowClearDataConfirm,

        // Actions
        updateSettings,
        resetSettings,
        handleDevModeTap,
        handlePushToggle,
        handleClearData,
        handleExportData: () => exportPersonalDataHelper(showToastMessage),
        handleExportSettings: () => exportSettingsToFile(exportSettings, showToastMessage),
        handleImportClick: () => fileInputRef.current?.click(),
        handleImportFile,
        handleRefresh: reloadPage,
        handleShowOnboarding: () => resetOnboarding(showToastMessage),
        showToast: showToastMessage,
    };
}
