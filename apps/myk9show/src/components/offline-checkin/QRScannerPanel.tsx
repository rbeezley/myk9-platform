import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Camera, QrCode } from 'lucide-react';
import type { QRScanResult } from '@/types/offline-checkin-types';

interface QRScannerPanelProps {
  isCameraActive: boolean;
  isScanning: boolean;
  manualEntry: string;
  scanResult: QRScanResult | null;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  onStartCamera: () => void;
  onStopCamera: () => void;
  onStartScanning: () => void;
  onStopScanning: () => void;
  onManualEntryChange: (value: string) => void;
  onManualEntrySubmit: () => void;
}

export const QRScannerPanel: React.FC<QRScannerPanelProps> = ({
  isCameraActive,
  isScanning,
  manualEntry,
  scanResult,
  videoRef,
  onStartCamera,
  onStopCamera,
  onStartScanning,
  onStopScanning,
  onManualEntryChange,
  onManualEntrySubmit,
}) => {
  return (
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
            <Button onClick={onStartCamera}>
              <Camera className="h-4 w-4 mr-2" />
              Start Camera
            </Button>
          ) : (
            <>
              <Button onClick={onStopCamera} variant="outline">
                Stop Camera
              </Button>
              {!isScanning ? (
                <Button onClick={onStartScanning}>
                  Start Scanning
                </Button>
              ) : (
                <Button onClick={onStopScanning} variant="destructive">
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
              onChange={(e) => onManualEntryChange(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && onManualEntrySubmit()}
            />
            <Button onClick={onManualEntrySubmit}>
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
  );
};
