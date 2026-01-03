/**
 * Offline Check-In Interface
 * 
 * Main interface for gate stewards to handle check-in operations
 * with full offline support, QR scanning, and conflict resolution.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { 
  Camera, 
  QrCode, 
  Search, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle,
  Wifi,
  WifiOff,
  RefreshCw,
  Clock,
  Activity
} from 'lucide-react';
import { cn } from '@/lib/utils';

// Service imports
import { offlineCheckInService } from '@/services/offline-checkin/OfflineCheckInService';
import { armbandManager } from '@/services/offline-checkin/ArmbandManager';
import { gateCoordinator } from '@/services/offline-checkin/GateCoordinator';
import { qrScannerService } from '@/services/offline-checkin/QRScannerService';

import type {
  CheckInEntry,
  CheckInStatistics,
  QRScanResult,
  CheckInValidationResult,
  GateSession
} from '@/types/offline-checkin-types';
import type { CheckInStatus } from '@/types/check-in-types';

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
  onSessionEnd
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
      console.error('Failed to load entries:', error);
      setError('Failed to load entries');
    }
  }, [showId]);

  const loadStatistics = async () => {
    try {
      const stats = await offlineCheckInService.getStatistics();
      setStatistics(stats);
    } catch (error) {
      console.error('Failed to load statistics:', error);
    }
  };

  const initializeServices = useCallback(async () => {
    try {
      setLoading(true);
      
      // Initialize core services
      await Promise.all([
        offlineCheckInService.initialize(),
        armbandManager.initialize(),
        gateCoordinator.initialize(),
        qrScannerService.initialize()
      ]);

      // Load initial data
      await loadEntries();
      await loadStatistics();
      
      // Start gate session if not already active
      const activeSession = gateCoordinator.getActiveSessionForGate(gateId);
      if (!activeSession) {
        const session = await gateCoordinator.assignStewardToGate(stewardId, gateId, 'system');
        setCurrentSession(session);
      } else {
        setCurrentSession(activeSession);
      }

    } catch (error) {
      console.error('Failed to initialize services:', error);
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
      console.error('Failed to start camera:', error);
      setError(`Camera error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const stopScanning = useCallback(async () => {
    try {
      await qrScannerService.stopScanning();
      setIsScanning(false);
    } catch (error) {
      console.error('Failed to stop scanning:', error);
    }
  }, []);

  // Event handlers
  const handleScanSuccess = useCallback(async (result: QRScanResult) => {
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
      // Find entry by armband
      const entry = entries.find(e => e.armband === result.armband);
      if (entry) {
        setSelectedEntry(entry);
        setShowCheckInDialog(true);
      } else {
        setError(`Entry with armband ${result.armband} not found`);
      }
    }

    setManualEntry('');
  }, [entries, stopScanning]);

  const handleScanFailed = useCallback((data: unknown) => {
    console.warn('Scan failed:', data);
    setError('Scan failed - please try again');
  }, []);

  const handleScanError = useCallback((data: unknown) => {
    console.error('Scan error:', data);
    const errorMessage = (data && typeof data === 'object' && 'error' in data && typeof (data as Record<string, unknown>).error === 'string') 
      ? (data as Record<string, unknown>).error as string
      : 'Unknown error';
    setError(`Scan error: ${errorMessage}`);
  }, []);

  const handleCheckInEvent = useCallback((event: unknown) => {
    console.log('Check-in event:', event);
    
    // Reload data after check-in events
    if (event && typeof event === 'object' && 'type' in event && (event as Record<string, unknown>).type === 'check_in_completed') {
      loadEntries();
      loadStatistics();
    }
  }, [loadEntries]);

  const handleGateEvent = useCallback((event: unknown) => {
    console.log('Gate event:', event);
  }, []);

  const setupEventListeners = useCallback(() => {
    // Type-safe event handlers
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

    // QR Scanner events
    qrScannerService.on('scan_success', handleScanSuccessTyped);
    qrScannerService.on('scan_failed', handleScanFailedTyped);
    qrScannerService.on('scan_error', handleScanErrorTyped);
    
    // Check-in service events
    offlineCheckInService.on('checkin-event', handleCheckInEventTyped);
    
    // Gate coordinator events
    gateCoordinator.on('gate-event', handleGateEventTyped);
  }, [handleScanSuccess, handleScanFailed, handleScanError, handleCheckInEvent, handleGateEvent]);

  const cleanupServices = useCallback(async () => {
    try {
      await qrScannerService.dispose();
      if (currentSession?.isActive) {
        await gateCoordinator.endSession(currentSession.id, stewardId);
      }
    } catch (error) {
      console.error('Cleanup failed:', error);
    }
  }, [currentSession, stewardId]);

  // Initialize services and load data
  useEffect(() => {
    initializeServices();
    setupEventListeners();
    
    return () => {
      cleanupServices();
    };
  }, [initializeServices, setupEventListeners, cleanupServices]);

  // Monitor online status
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

  // Filter entries based on search and status
  useEffect(() => {
    let filtered = [...entries];

    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      filtered = filtered.filter(entry =>
        entry.dogName.toLowerCase().includes(searchLower) ||
        entry.handlerName.toLowerCase().includes(searchLower) ||
        entry.armband.includes(searchLower) ||
        entry.entryNumber.toLowerCase().includes(searchLower)
      );
    }

    if (statusFilter !== 'all') {
      filtered = filtered.filter(entry => entry.checkInStatus === statusFilter);
    }

    // Sort by run order
    filtered.sort((a, b) => a.runOrder - b.runOrder);

    setFilteredEntries(filtered);
  }, [entries, searchTerm, statusFilter]);

  const stopCamera = async () => {
    try {
      await qrScannerService.stopCamera();
      setIsCameraActive(false);
      setIsScanning(false);
    } catch (error) {
      console.error('Failed to stop camera:', error);
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

  // Check-in operations
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
          handlerChange: handlerChange || undefined,
          specialRequests: specialRequests || undefined,
          scratchReason: scratchReason || undefined,
          notes: notes || undefined
        }
      );

      // Show validation results if any warnings/errors
      if (operation.hasWarnings || operation.hasErrors) {
        setValidationResults(operation.validationChecks);
        setShowValidationDialog(true);
      }

      // Log activity in gate session
      if (currentSession) {
        await gateCoordinator.logCheckIn(
          currentSession.id,
          selectedEntry.id,
          !operation.hasErrors,
          1000 // Placeholder duration
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

  const resetForm = () => {
    setSelectedEntry(null);
    setCheckInStatus('checked-in');
    setHandlerChange('');
    setSpecialRequests('');
    setScratchReason('');
    setNotes('');
    setScanResult(null);
  };

  const getStatusColor = (status: CheckInStatus) => {
    switch (status) {
      case 'checked-in':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'at-gate':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'go-to-gate':
        return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'conflict':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'pulled':
        return 'bg-gray-100 text-gray-800 border-gray-200';
      default:
        return 'bg-gray-100 text-gray-600 border-gray-200';
    }
  };

  const getStatusIcon = (status: CheckInStatus) => {
    switch (status) {
      case 'checked-in':
        return <CheckCircle2 className="h-4 w-4" />;
      case 'pulled':
        return <XCircle className="h-4 w-4" />;
      case 'conflict':
        return <AlertTriangle className="h-4 w-4" />;
      default:
        return <Clock className="h-4 w-4" />;
    }
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
          {/* Search and Filters */}
          <Card>
            <CardContent className="p-4">
              <div className="flex gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by dog name, handler, or armband..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9"
                  />
                </div>
                
                <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as CheckInStatus | 'all')}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Filter by status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="none">Not Checked In</SelectItem>
                    <SelectItem value="checked-in">Checked In</SelectItem>
                    <SelectItem value="at-gate">At Gate</SelectItem>
                    <SelectItem value="go-to-gate">Go to Gate</SelectItem>
                    <SelectItem value="conflict">Conflict</SelectItem>
                    <SelectItem value="pulled">Pulled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Entry List */}
          <Card>
            <CardHeader>
              <CardTitle>Entries ({filteredEntries.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {filteredEntries.map((entry) => (
                  <div
                    key={entry.id}
                    className={cn(
                      'flex items-center justify-between p-3 rounded-lg border cursor-pointer hover:bg-muted/50',
                      entry.checkInStatus === 'conflict' && 'border-red-200 bg-red-50'
                    )}
                    onClick={() => {
                      setSelectedEntry(entry);
                      setShowCheckInDialog(true);
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <Badge variant="outline" className="font-mono">
                        #{entry.armband}
                      </Badge>
                      <div>
                        <div className="font-medium">{entry.dogName}</div>
                        <div className="text-sm text-muted-foreground">
                          {entry.handlerName} • {entry.className}
                        </div>
                      </div>
                    </div>
                    
                    <Badge className={getStatusColor(entry.checkInStatus)}>
                      {getStatusIcon(entry.checkInStatus)}
                      <span className="ml-1">{entry.checkInStatus.replace('-', ' ')}</span>
                    </Badge>
                  </div>
                ))}
                
                {filteredEntries.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    No entries match your search criteria
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* QR Scanner Tab */}
        <TabsContent value="scanner" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <QrCode className="h-5 w-5" />
                QR Code Scanner
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Camera Controls */}
              <div className="flex gap-2">
                {!isCameraActive ? (
                  <Button onClick={startCamera}>
                    <Camera className="h-4 w-4 mr-2" />
                    Start Camera
                  </Button>
                ) : (
                  <>
                    <Button onClick={stopCamera} variant="outline">
                      Stop Camera
                    </Button>
                    {!isScanning ? (
                      <Button onClick={startScanning}>
                        Start Scanning
                      </Button>
                    ) : (
                      <Button onClick={stopScanning} variant="destructive">
                        Stop Scanning
                      </Button>
                    )}
                  </>
                )}
              </div>

              {/* Camera View */}
              {isCameraActive && (
                <div className="relative">
                  <video
                    ref={videoRef}
                    className="w-full max-w-md mx-auto rounded-lg"
                    autoPlay
                    playsInline
                  />
                  {isScanning && (
                    <div className="absolute inset-0 border-4 border-blue-500 rounded-lg animate-pulse" />
                  )}
                </div>
              )}

              {/* Manual Entry */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Manual Entry</label>
                <div className="flex gap-2">
                  <Input
                    placeholder="Enter armband number or QR data..."
                    value={manualEntry}
                    onChange={(e) => setManualEntry(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleManualEntry()}
                  />
                  <Button onClick={handleManualEntry}>
                    Enter
                  </Button>
                </div>
              </div>

              {/* Scan Result */}
              {scanResult && (
                <Alert className={scanResult.success ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}>
                  <AlertDescription>
                    {scanResult.success ? (
                      <div>
                        <strong>Scan successful!</strong>
                        {scanResult.armband && <div>Armband: {scanResult.armband}</div>}
                        {scanResult.entryId && <div>Entry ID: {scanResult.entryId}</div>}
                      </div>
                    ) : (
                      <div>
                        <strong>Scan failed:</strong> {scanResult.error}
                      </div>
                    )}
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Statistics Tab */}
        <TabsContent value="statistics" className="space-y-4">
          {statistics && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="p-4">
                  <div className="text-2xl font-bold">{statistics.totalEntries}</div>
                  <div className="text-sm text-muted-foreground">Total Entries</div>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="p-4">
                  <div className="text-2xl font-bold text-green-600">{statistics.checkedInCount}</div>
                  <div className="text-sm text-muted-foreground">Checked In</div>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="p-4">
                  <div className="text-2xl font-bold text-orange-600">{statistics.scratchedCount}</div>
                  <div className="text-sm text-muted-foreground">Scratched</div>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="p-4">
                  <div className="text-2xl font-bold text-red-600">{statistics.conflictCount}</div>
                  <div className="text-sm text-muted-foreground">Conflicts</div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Check-In Dialog */}
      {selectedEntry && (
        <Dialog open={showCheckInDialog} onOpenChange={setShowCheckInDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Check In Entry</DialogTitle>
            </DialogHeader>
            
            <div className="space-y-4">
              {/* Entry Details */}
              <div className="p-3 bg-muted rounded-lg">
                <div className="font-medium">{selectedEntry.dogName}</div>
                <div className="text-sm text-muted-foreground">
                  Handler: {selectedEntry.handlerName}
                </div>
                <div className="text-sm text-muted-foreground">
                  Armband: #{selectedEntry.armband} • Class: {selectedEntry.className}
                </div>
              </div>

              {/* Status Selection */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Status</label>
                <Select value={checkInStatus} onValueChange={(value) => setCheckInStatus(value as CheckInStatus)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="checked-in">Checked In</SelectItem>
                    <SelectItem value="at-gate">At Gate</SelectItem>
                    <SelectItem value="go-to-gate">Go to Gate</SelectItem>
                    <SelectItem value="pulled">Scratch</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Additional Fields */}
              {checkInStatus === 'pulled' && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Scratch Reason</label>
                  <Textarea
                    value={scratchReason}
                    onChange={(e) => setScratchReason(e.target.value)}
                    placeholder="Reason for scratching..."
                  />
                </div>
              )}

              <div className="space-y-2">
                <label className="text-sm font-medium">Handler Change (Optional)</label>
                <Input
                  value={handlerChange}
                  onChange={(e) => setHandlerChange(e.target.value)}
                  placeholder="New handler name..."
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Special Requests (Optional)</label>
                <Textarea
                  value={specialRequests}
                  onChange={(e) => setSpecialRequests(e.target.value)}
                  placeholder="Any special requests..."
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Notes (Optional)</label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Additional notes..."
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCheckInDialog(false)}>
                Cancel
              </Button>
              <Button onClick={performCheckIn} disabled={loading}>
                {loading ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : null}
                Check In
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Validation Results Dialog */}
      <Dialog open={showValidationDialog} onOpenChange={setShowValidationDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Validation Results</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {validationResults.map((result, index) => (
              <Alert
                key={index}
                variant={result.status === 'error' ? 'destructive' : 'default'}
                className={result.status === 'warning' ? 'border-orange-200 bg-orange-50' : ''}
              >
                <AlertDescription>
                  <strong>{result.check}:</strong> {result.message}
                </AlertDescription>
              </Alert>
            ))}
          </div>

          <DialogFooter>
            <Button onClick={() => setShowValidationDialog(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};