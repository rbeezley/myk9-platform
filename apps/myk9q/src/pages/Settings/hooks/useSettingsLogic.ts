import { useState, useRef, useEffect, useCallback } from 'react';
import { useSettingsStore } from '@/stores/settingsStore';
import { useAuth } from '@/contexts/AuthContext';
import { getStorageUsage } from '@/services/dataExportService';
import PushNotificationService from '@/services/pushNotificationService';
import voiceAnnouncementService from '@/services/voiceAnnouncementService';
import { logger } from '@/utils/logger';
import { mutationQueue } from '@/services/replication/MutationQueueManager';
import { ensureReplicationManager } from '@/utils/replicationHelper';
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
    const [isRefreshing, setIsRefreshing] = useState(false);
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

    /**
     * Refresh all data - syncs pending changes, clears cache, and reloads
     * Safe for offline scoring: syncs pending mutations before clearing
     */
    const handleRefreshAllData = useCallback(async () => {
        setIsRefreshing(true);
        try {
            // Check for pending mutations
            const pendingMutations = await mutationQueue.getPending();
            const hasPending = pendingMutations.length > 0;
            const isOnline = navigator.onLine;

            if (hasPending) {
                if (!isOnline) {
                    showToastMessage(
                        `Cannot refresh: ${pendingMutations.length} unsynced score(s). Connect to internet first.`,
                        'error'
                    );
                    setIsRefreshing(false);
                    return;
                }

                // Try to sync pending mutations first
                showToastMessage('Syncing pending changes...', 'info');
                try {
                    const manager = await ensureReplicationManager();
                    await manager.syncAll({ forceFullSync: false });

                    // Check again after sync
                    const stillPending = await mutationQueue.getPending();
                    if (stillPending.length > 0) {
                        showToastMessage(
                            `Warning: ${stillPending.length} change(s) could not be synced. They will be preserved.`,
                            'error'
                        );
                        setIsRefreshing(false);
                        return;
                    }
                } catch (syncError) {
                    logger.error('Error syncing before refresh:', syncError);
                    showToastMessage('Sync failed. Please try again when online.', 'error');
                    setIsRefreshing(false);
                    return;
                }
            }

            // All clear - delete the IndexedDB database and reload
            showToastMessage('Clearing cache and reloading...', 'info');

            // Clear IndexedDB databases
            const dbNames = ['myK9Q_Replication', 'myK9Q-replication'];
            for (const dbName of dbNames) {
                try {
                    const deleteRequest = indexedDB.deleteDatabase(dbName);
                    await new Promise<void>((resolve, reject) => {
                        deleteRequest.onsuccess = () => resolve();
                        deleteRequest.onerror = () => reject(deleteRequest.error);
                        deleteRequest.onblocked = () => {
                            logger.warn(`[RefreshAllData] Database ${dbName} delete blocked`);
                            resolve(); // Continue anyway
                        };
                    });
                    logger.log(`[RefreshAllData] Deleted IndexedDB: ${dbName}`);
                } catch (err) {
                    logger.warn(`[RefreshAllData] Could not delete ${dbName}:`, err);
                }
            }

            // Short delay to ensure DB is cleared, then reload
            setTimeout(() => {
                window.location.reload();
            }, 500);

        } catch (err) {
            logger.error('Error refreshing data:', err);
            showToastMessage('Failed to refresh data', 'error');
            setIsRefreshing(false);
        }
    }, [showToastMessage]);

    return {
        // State
        settings,
        toast,
        showResetConfirm,
        showClearDataConfirm,
        isClearing,
        isRefreshing,
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
        handleRefreshAllData,
        handleExportData: () => exportPersonalDataHelper(showToastMessage),
        handleExportSettings: () => exportSettingsToFile(exportSettings, showToastMessage),
        handleImportClick: () => fileInputRef.current?.click(),
        handleImportFile,
        handleRefresh: reloadPage,
        handleShowOnboarding: () => resetOnboarding(showToastMessage),
        showToast: showToastMessage,
    };
}
