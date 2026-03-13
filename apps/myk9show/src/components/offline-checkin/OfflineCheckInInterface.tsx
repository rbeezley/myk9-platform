import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertTriangle, Wifi, WifiOff, RefreshCw, Activity } from 'lucide-react';
import { logger } from '@/services/LoggingService';

import { offlineCheckInService } from '@/services/offline-checkin/OfflineCheckInService';
import { armbandManager } from '@/services/offline-checkin/ArmbandManager';
import { gateCoordinator } from '@/services/offline-checkin/GateCoordinator';
import { qrScannerService } from '@/services/offline-checkin/QRScannerService';

import type {
  CheckInEntry,
  CheckInStatistics,
  QRScanResult,
  CheckInValidationResult,
  GateSession,
} from '@/types/offline-checkin-types';
import type { CheckInStatus } from '@myk9/core';

import { CheckInSearchBar } from './CheckInSearchBar';
import { CheckInEntryList } from './CheckInEntryList';
import { QRScannerPanel } from './QRScannerPanel';
import { CheckInDialog } from './CheckInDialog';
import type { CheckInFormState } from './CheckInDialog';
import { ValidationResultsDialog } from './ValidationResultsDialog';
import { StatisticsPanel } from './StatisticsPanel';

interface OfflineCheckInInterfaceProps {
  gateId: string;
  stewardId: string;
  showId: string;
  onSessionEnd?: () => void;
}

export const OfflineCheckInInterface: React.FC<OfflineCheckInInterfaceProps> = ({
  gateId,
  stewardId,
  showId,
  onSessionEnd,
}) => {
  void onSessionEnd; // Suppress unused variable warning
  // State management
  const [entries, setEntries] = useState<CheckInEntry[]>([]);
  const [filteredEntries, setFilteredEntries] = useState<CheckInEntry[]>([]);
  const [selectedEntry, setSelectedEntry] = useState<CheckInEntry | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<CheckInStatus | 'all'>('all');
  const [currentSession, setCurrentSession] = useState<GateSession | null>(null);
  const [statistics, setStatistics] = useState<CheckInStatistics | null>(null);

  // Scanning state
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState<QRScanResult | null>(null);
  const [manualEntry, setManualEntry] = useState('');

  // UI state
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showCheckInDialog, setShowCheckInDialog] = useState(false);
  const [showValidationDialog, setShowValidationDialog] = useState(false);
  const [validationResults, setValidationResults] = useState<CheckInValidationResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check-in form state
  const [checkInStatus, setCheckInStatus] = useState<CheckInStatus>('checked-in');
  const [handlerChange, setHandlerChange] = useState('');
  const [specialRequests, setSpecialRequests] = useState('');
  const [scratchReason, setScratchReason] = useState('');
  const [notes, setNotes] = useState('');

  const videoRef = useRef<HTMLVideoElement>(null);

  const loadEntries = useCallback(async () => {
    try {
      const showEntries = await offlineCheckInService.loadEntriesForShow(showId);
      setEntries(showEntries);
    } catch (error) {
      logger.error('Failed to load entries', 'offline-checkin', { showId }, error as Error);
      setError('Failed to load entries');
    }
  }, [showId]);

  const loadStatistics = async () => {
    try {
      const stats = await offlineCheckInService.getStatistics();
      setStatistics(stats);
    } catch (error) {
      logger.error('Failed to load statistics', 'offline-checkin', {}, error as Error);
    }
  };

  const initializeServices = useCallback(async () => {
    try {
      setLoading(true);

      await Promise.all([
        offlineCheckInService.initialize(),
        armbandManager.initialize(),
        gateCoordinator.initialize(),
        qrScannerService.initialize(),
      ]);

      await loadEntries();
      await loadStatistics();

      const activeSession = gateCoordinator.getActiveSessionForGate(gateId);
      if (!activeSession) {
        const session = await gateCoordinator.assignStewardToGate(stewardId, gateId, 'system');
        setCurrentSession(session);
      } else {
        setCurrentSession(activeSession);
      }
    } catch (error) {
      logger.error(
        'Failed to initialize services',
        'offline-checkin',
        { gateId, stewardId },
        error as Error
      );
      setError(error instanceof Error ? error.message : 'Initialization failed');
    } finally {
      setLoading(false);
    }
  }, [gateId, stewardId, loadEntries]);

  // QR Scanning handlers
  const startCamera = async () => {
    try {
      await qrScannerService.startCamera();
      setIsCameraActive(true);
      setError('');
    } catch (error) {
      logger.error('Failed to start camera', 'offline-checkin', {}, error as Error);
      setError(`Camera error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const stopScanning = useCallback(async () => {
    try {
      await qrScannerService.stopScanning();
      setIsScanning(false);
    } catch (error) {
      logger.error('Failed to stop scanning', 'offline-checkin', {}, error as Error);
    }
  }, []);

  const handleScanSuccess = useCallback(
    async (result: QRScanResult) => {
      setScanResult(result);
      await stopScanning();

      if (result.entryId) {
        const entry = await offlineCheckInService.loadEntry(result.entryId);
        if (entry) {
          setSelectedEntry(entry);
          setShowCheckInDialog(true);
        } else {
          setError(`Entry ${result.entryId} not found`);
        }
      } else if (result.armband) {
        const entry = entries.find(e => e.armband === result.armband);
        if (entry) {
          setSelectedEntry(entry);
          setShowCheckInDialog(true);
        } else {
          setError(`Entry with armband ${result.armband} not found`);
        }
      }

      setManualEntry('');
    },
    [entries, stopScanning]
  );

  const handleScanFailed = useCallback((data: unknown) => {
    logger.warn('Scan failed', 'offline-checkin', { data });
    setError('Scan failed - please try again');
  }, []);

  const handleScanError = useCallback((data: unknown) => {
    logger.error('Scan error', 'offline-checkin', { data });
    const errorMessage =
      data &&
      typeof data === 'object' &&
      'error' in data &&
      typeof (data as Record<string, unknown>).error === 'string'
        ? ((data as Record<string, unknown>).error as string)
        : 'Unknown error';
    setError(`Scan error: ${errorMessage}`);
  }, []);

  const handleCheckInEvent = useCallback(
    (event: unknown) => {
      logger.debug('Check-in event', 'offline-checkin', { event });

      if (
        event &&
        typeof event === 'object' &&
        'type' in event &&
        (event as Record<string, unknown>).type === 'check_in_completed'
      ) {
        loadEntries();
        loadStatistics();
      }
    },
    [loadEntries]
  );

  const handleGateEvent = useCallback((event: unknown) => {
    logger.debug('Gate event', 'offline-checkin', { event });
  }, []);

  const setupEventListeners = useCallback(() => {
    const handleScanSuccessTyped = (data: unknown) => {
      handleScanSuccess(data as QRScanResult);
    };
    const handleScanFailedTyped = (data: unknown) => {
      handleScanFailed(data);
    };
    const handleScanErrorTyped = (data: unknown) => {
      handleScanError(data);
    };
    const handleCheckInEventTyped = (event: unknown) => {
      handleCheckInEvent(event);
    };
    const handleGateEventTyped = (event: unknown) => {
      handleGateEvent(event);
    };

    qrScannerService.on('scan_success', handleScanSuccessTyped);
    qrScannerService.on('scan_failed', handleScanFailedTyped);
    qrScannerService.on('scan_error', handleScanErrorTyped);

    offlineCheckInService.on('checkin-event', handleCheckInEventTyped);

    gateCoordinator.on('gate-event', handleGateEventTyped);
  }, [handleScanSuccess, handleScanFailed, handleScanError, handleCheckInEvent, handleGateEvent]);

  const cleanupServices = useCallback(async () => {
    try {
      await qrScannerService.dispose();
      if (currentSession?.isActive) {
        await gateCoordinator.endSession(currentSession.id, stewardId);
      }
    } catch (error) {
      logger.error(
        'Cleanup failed',
        'offline-checkin',
        { sessionId: currentSession?.id },
        error as Error
      );
    }
  }, [currentSession, stewardId]);

  useEffect(() => {
    initializeServices();
    setupEventListeners();

    return () => {
      cleanupServices();
    };
  }, [initializeServices, setupEventListeners, cleanupServices]);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    let filtered = [...entries];

    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      filtered = filtered.filter(
        entry =>
          entry.dogName.toLowerCase().includes(searchLower) ||
          entry.handlerName.toLowerCase().includes(searchLower) ||
          entry.armband.includes(searchLower) ||
          entry.entryNumber.toLowerCase().includes(searchLower)
      );
    }

    if (statusFilter !== 'all') {
      filtered = filtered.filter(entry => entry.checkInStatus === statusFilter);
    }

    filtered.sort((a, b) => a.runOrder - b.runOrder);

    setFilteredEntries(filtered);
  }, [entries, searchTerm, statusFilter]);

  const stopCamera = async () => {
    try {
      await qrScannerService.stopCamera();
      setIsCameraActive(false);
      setIsScanning(false);
    } catch (error) {
      logger.error('Failed to stop camera', 'offline-checkin', {}, error as Error);
    }
  };

  const startScanning = async () => {
    try {
      if (!isCameraActive) {
        await startCamera();
      }
      await qrScannerService.startScanning();
      setIsScanning(true);
      setScanResult(null);
    } catch (error) {
      setError(`Scan error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleManualEntry = async () => {
    if (!manualEntry.trim()) {
      setError('Please enter an armband number or scan data');
      return;
    }

    try {
      const result = await qrScannerService.processManualEntry(manualEntry);
      setScanResult(result);

      if (result.success) {
        await handleScanSuccess(result);
      } else {
        setError(result.error || 'Manual entry failed');
      }
    } catch (error) {
      setError(`Manual entry error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const resetForm = () => {
    setSelectedEntry(null);
    setCheckInStatus('checked-in');
    setHandlerChange('');
    setSpecialRequests('');
    setScratchReason('');
    setNotes('');
    setScanResult(null);
  };

  const performCheckIn = async () => {
    if (!selectedEntry) return;

    try {
      setLoading(true);

      const operation = await offlineCheckInService.checkInEntry(
        selectedEntry.id,
        checkInStatus,
        stewardId,
        {
          method: scanResult ? 'qr_scan' : 'manual_entry',
          gateId,
          ...(handlerChange && { handlerChange }),
          ...(specialRequests && { specialRequests }),
          ...(scratchReason && { scratchReason }),
          ...(notes && { notes }),
        }
      );

      if (operation.hasWarnings || operation.hasErrors) {
        setValidationResults(operation.validationChecks);
        setShowValidationDialog(true);
      }

      if (currentSession) {
        await gateCoordinator.logCheckIn(
          currentSession.id,
          selectedEntry.id,
          !operation.hasErrors,
          1000
        );
      }

      setShowCheckInDialog(false);
      resetForm();
      await loadEntries();
      await loadStatistics();
    } catch (error) {
      setError(`Check-in failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleEntrySelect = (entry: CheckInEntry) => {
    setSelectedEntry(entry);
    setShowCheckInDialog(true);
  };

  const formState: CheckInFormState = {
    checkInStatus,
    handlerChange,
    specialRequests,
    scratchReason,
    notes,
  };

  const handleFormStateChange = (updates: Partial<CheckInFormState>) => {
    if (updates.checkInStatus !== undefined) setCheckInStatus(updates.checkInStatus);
    if (updates.handlerChange !== undefined) setHandlerChange(updates.handlerChange);
    if (updates.specialRequests !== undefined) setSpecialRequests(updates.specialRequests);
    if (updates.scratchReason !== undefined) setScratchReason(updates.scratchReason);
    if (updates.notes !== undefined) setNotes(updates.notes);
  };

  if (loading && !entries.length) {
    return (
      <div className="flex items-center justify-center h-96">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">Loading check-in interface...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold">Gate Check-In</h1>
          <p className="text-muted-foreground">
            Gate {gateId} • {isOnline ? 'Online' : 'Offline Mode'}
            {statistics && ` • ${statistics.checkedInCount}/${statistics.totalEntries} checked in`}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {isOnline ? (
            <Badge variant="outline" className="text-green-600 border-green-600">
              <Wifi className="h-3 w-3 mr-1" />
              Online
            </Badge>
          ) : (
            <Badge variant="outline" className="text-orange-600 border-orange-600">
              <WifiOff className="h-3 w-3 mr-1" />
              Offline
            </Badge>
          )}

          {currentSession && (
            <Badge variant="secondary">
              <Activity className="h-3 w-3 mr-1" />
              Active Session
            </Badge>
          )}
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Main Content */}
      <Tabs defaultValue="checkin" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="checkin">Check-In</TabsTrigger>
          <TabsTrigger value="scanner">QR Scanner</TabsTrigger>
          <TabsTrigger value="statistics">Statistics</TabsTrigger>
        </TabsList>

        {/* Check-In Tab */}
        <TabsContent value="checkin" className="space-y-4">
          <CheckInSearchBar
            searchTerm={searchTerm}
            onSearchTermChange={setSearchTerm}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
          />
          <CheckInEntryList entries={filteredEntries} onEntrySelect={handleEntrySelect} />
        </TabsContent>

        {/* QR Scanner Tab */}
        <TabsContent value="scanner" className="space-y-4">
          <QRScannerPanel
            isCameraActive={isCameraActive}
            isScanning={isScanning}
            manualEntry={manualEntry}
            scanResult={scanResult}
            videoRef={videoRef}
            onStartCamera={startCamera}
            onStopCamera={stopCamera}
            onStartScanning={startScanning}
            onStopScanning={stopScanning}
            onManualEntryChange={setManualEntry}
            onManualEntrySubmit={handleManualEntry}
          />
        </TabsContent>

        {/* Statistics Tab */}
        <TabsContent value="statistics" className="space-y-4">
          {statistics && <StatisticsPanel statistics={statistics} />}
        </TabsContent>
      </Tabs>

      {/* Check-In Dialog */}
      {selectedEntry && (
        <CheckInDialog
          open={showCheckInDialog}
          onOpenChange={setShowCheckInDialog}
          entry={selectedEntry}
          formState={formState}
          onFormStateChange={handleFormStateChange}
          onCheckIn={performCheckIn}
          loading={loading}
        />
      )}

      {/* Validation Results Dialog */}
      <ValidationResultsDialog
        open={showValidationDialog}
        onOpenChange={setShowValidationDialog}
        validationResults={validationResults}
      />
    </div>
  );
};
