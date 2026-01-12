/**
 * QR Scanner Service
 *
 * Handles QR code and barcode scanning functionality,
 * including camera access, code generation, and validation.
 */

import { EventEmitter } from '../sync/eventEmitter';
import { logger } from '@/services/LoggingService';
import type {
  QRScanResult,
  QRCode,
  CheckInEntry
} from '@/types/offline-checkin-types';
// Removed unused import: generateId

export interface QRScannerConfig {
  enableCamera: boolean;
  enableBarcodeReader: boolean;
  autoStartCamera: boolean;
  preferredCamera: 'user' | 'environment';
  scanInterval: number;
  validationRequired: boolean;
  checksumValidation: boolean;
  maxScanAttempts: number;
  scanTimeout: number;
}

export interface CameraConstraints {
  video: {
    facingMode: 'user' | 'environment';
    width?: { ideal: number };
    height?: { ideal: number };
  };
}

const DEFAULT_CONFIG: QRScannerConfig = {
  enableCamera: true,
  enableBarcodeReader: true,
  autoStartCamera: false,
  preferredCamera: 'environment',
  scanInterval: 100,
  validationRequired: true,
  checksumValidation: true,
  maxScanAttempts: 10,
  scanTimeout: 30000
};

export class QRScannerService extends EventEmitter {
  private config: QRScannerConfig;
  private stream: MediaStream | null = null;
  private videoElement: HTMLVideoElement | null = null;
  private canvasElement: HTMLCanvasElement | null = null;
  private context: CanvasRenderingContext2D | null = null;
  private isScanning = false;
  private scanInterval?: NodeJS.Timeout;
  private currentAttempts = 0;
  private scanStartTime: number = 0;

  constructor(config: Partial<QRScannerConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async initialize(): Promise<void> {
    try {
      // Check for required APIs
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera access not available in this browser');
      }

      // Create canvas for image processing
      this.canvasElement = document.createElement('canvas');
      this.context = this.canvasElement.getContext('2d');

      if (!this.context) {
        throw new Error('Canvas 2D context not available');
      }

      this.emit('initialized', {});
      logger.debug('QRScannerService initialized successfully', 'checkin', {});
    } catch (error) {
      logger.error('Failed to initialize QRScannerService', 'checkin', {}, error as Error);
      throw error;
    }
  }

  async startCamera(constraints?: CameraConstraints): Promise<void> {
    try {
      if (this.stream) {
        await this.stopCamera();
      }

      const defaultConstraints: CameraConstraints = {
        video: {
          facingMode: this.config.preferredCamera,
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      };

      const mediaConstraints = constraints || defaultConstraints;
      this.stream = await navigator.mediaDevices.getUserMedia(mediaConstraints);

      // Create video element if not exists
      if (!this.videoElement) {
        this.videoElement = document.createElement('video');
        this.videoElement.setAttribute('playsinline', 'true');
        this.videoElement.style.display = 'none';
      }

      this.videoElement.srcObject = this.stream;
      await this.videoElement.play();

      // Wait for video to be ready
      await new Promise<void>((resolve) => {
        if (this.videoElement!.readyState >= 2) {
          resolve();
        } else {
          this.videoElement!.addEventListener('loadeddata', () => resolve(), { once: true });
        }
      });

      // Update canvas dimensions
      if (this.canvasElement && this.videoElement) {
        this.canvasElement.width = this.videoElement.videoWidth;
        this.canvasElement.height = this.videoElement.videoHeight;
      }

      this.emit('camera_started', {});
    } catch (error) {
      this.emit('camera_error', { error: error instanceof Error ? error.message : 'Camera start failed' });
      throw error;
    }
  }

  async stopCamera(): Promise<void> {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }

    if (this.videoElement) {
      this.videoElement.srcObject = null;
    }

    this.emit('camera_stopped', {});
  }

  async startScanning(): Promise<void> {
    if (this.isScanning) {
      return;
    }

    if (!this.stream) {
      throw new Error('Camera not started. Call startCamera() first.');
    }

    this.isScanning = true;
    this.currentAttempts = 0;
    this.scanStartTime = Date.now();

    this.scanInterval = setInterval(() => {
      this.scanFrame();
    }, this.config.scanInterval);

    // Set timeout for scanning
    setTimeout(() => {
      if (this.isScanning) {
        this.stopScanning();
        this.emit('scan_timeout', {});
      }
    }, this.config.scanTimeout);

    this.emit('scan_started', {});
  }

  async stopScanning(): Promise<void> {
    if (!this.isScanning) {
      return;
    }

    this.isScanning = false;

    if (this.scanInterval) {
      clearInterval(this.scanInterval);
      this.scanInterval = undefined;
    }

    this.emit('scan_stopped', {});
  }

  private async scanFrame(): Promise<void> {
    if (!this.isScanning || !this.videoElement || !this.canvasElement || !this.context) {
      return;
    }

    this.currentAttempts++;

    try {
      // Draw video frame to canvas
      this.context.drawImage(
        this.videoElement,
        0, 0,
        this.canvasElement.width,
        this.canvasElement.height
      );

      // Get image data
      this.context.getImageData(
        0, 0,
        this.canvasElement.width,
        this.canvasElement.height
      );

      // Scan for QR codes (this would integrate with a QR scanning library)
      const scanResult = await this.processImageData();

      if (scanResult.success) {
        await this.stopScanning();
        this.emit('scan_success', scanResult);
      }

      // Check if we've exceeded max attempts
      if (this.currentAttempts >= this.config.maxScanAttempts) {
        await this.stopScanning();
        this.emit('scan_failed', { reason: 'max_attempts_exceeded', attempts: this.currentAttempts });
      }
    } catch (error) {
      logger.error('Frame scanning error', 'checkin', {}, error as Error);
      this.emit('scan_error', { error: error instanceof Error ? error.message : 'Scan error' });
    }
  }

  private async processImageData(): Promise<QRScanResult> {
    // In a real implementation, this would use a QR code scanning library like jsQR
    // For now, we'll simulate the scanning process

    const result: QRScanResult = {
      success: false,
      scannedAt: new Date(),
      scannerType: 'camera'
    };

    try {
      // Simulate QR detection probability (in real implementation, use jsQR or similar)
      const detectionProbability = Math.random();

      if (detectionProbability > 0.95) { // 5% chance of successful scan per frame
        // Simulate successful QR code detection
        const mockQRData = {
          entryId: 'entry-123',
          armband: '101',
          showId: 'show-456',
          classId: 'class-789',
          dogName: 'Test Dog',
          handlerName: 'Test Handler',
          checksum: 'abc123'
        };

        result.success = true;
        result.data = JSON.stringify(mockQRData);
        result.entryId = mockQRData.entryId;
        result.armband = mockQRData.armband;

        // Validate if required
        if (this.config.validationRequired) {
          const isValid = await this.validateQRData(mockQRData);
          if (!isValid) {
            result.success = false;
            result.error = 'QR code validation failed';
          }
        }
      }
    } catch (error) {
      result.error = error instanceof Error ? error.message : 'Processing failed';
    }

    return result;
  }

  private async validateQRData(data: unknown): Promise<boolean> {
    try {
      // Type guard for QR data
      if (!data || typeof data !== 'object') {
        return false;
      }

      const qrData = data as Record<string, unknown>;

      // Basic structure validation
      if (!qrData.entryId || !qrData.armband || !qrData.showId) {
        return false;
      }

      // Checksum validation if enabled
      if (this.config.checksumValidation && qrData.checksum) {
        const calculatedChecksum = this.calculateChecksum(qrData);
        if (calculatedChecksum !== qrData.checksum) {
          return false;
        }
      }

      return true;
    } catch (error) {
      logger.error('QR validation error', 'checkin', {}, error as Error);
      return false;
    }
  }

  // QR Code generation
  async generateQRCode(entry: CheckInEntry): Promise<QRCode> {
    const qrData = {
      entryId: entry.id,
      armband: entry.armband,
      showId: entry.showId,
      classId: entry.classId,
      dogName: entry.dogName,
      handlerName: entry.handlerName,
      timestamp: Date.now()
    };

    const checksum = this.calculateChecksum(qrData);

    const qrCode: QRCode = {
      ...qrData,
      checksum,
      generatedAt: new Date(),
      isValid: true
    };

    return qrCode;
  }

  async generateQRCodeData(entry: CheckInEntry): Promise<string> {
    const qrCode = await this.generateQRCode(entry);
    return JSON.stringify(qrCode);
  }

  // Manual entry methods
  async processManualEntry(entryData: string): Promise<QRScanResult> {
    const result: QRScanResult = {
      success: false,
      scannedAt: new Date(),
      scannerType: 'manual'
    };

    try {
      // Try to parse as JSON
      let parsedData;
      try {
        parsedData = JSON.parse(entryData);
      } catch {
        // If not JSON, treat as simple armband number
        parsedData = { armband: entryData.trim() };
      }

      if (this.config.validationRequired) {
        const isValid = await this.validateQRData(parsedData);
        if (!isValid) {
          result.error = 'Manual entry validation failed';
          return result;
        }
      }

      result.success = true;
      result.data = typeof parsedData === 'string' ? parsedData : JSON.stringify(parsedData);
      result.entryId = parsedData.entryId;
      result.armband = parsedData.armband;

    } catch (error) {
      result.error = error instanceof Error ? error.message : 'Manual entry processing failed';
    }

    return result;
  }

  // Camera controls
  async switchCamera(): Promise<void> {
    const newFacingMode = this.config.preferredCamera === 'user' ? 'environment' : 'user';
    this.config.preferredCamera = newFacingMode;

    if (this.stream) {
      await this.startCamera({
        video: {
          facingMode: newFacingMode,
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      });
    }

    this.emit('camera_switched', { facingMode: newFacingMode });
  }

  async getAvailableCameras(): Promise<MediaDeviceInfo[]> {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter(device => device.kind === 'videoinput');
    } catch (error) {
      logger.error('Failed to enumerate cameras', 'checkin', {}, error as Error);
      return [];
    }
  }

  // Utility methods
  private calculateChecksum(data: unknown): string {
    // Simple checksum calculation (in production, use a proper hash function)
    if (!data || typeof data !== 'object') {
      return '';
    }

    const objData = data as Record<string, unknown>;
    const str = JSON.stringify(objData, Object.keys(objData).sort());
    let hash = 0;

    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }

    return Math.abs(hash).toString(36);
  }

  // State getters
  isCameraActive(): boolean {
    return this.stream !== null;
  }

  isScanningActive(): boolean {
    return this.isScanning;
  }

  getCurrentConfig(): QRScannerConfig {
    return { ...this.config };
  }

  // Configuration
  updateConfig(updates: Partial<QRScannerConfig>): void {
    this.config = { ...this.config, ...updates };
    this.emit('config_updated', updates);
  }

  // Cleanup
  async dispose(): Promise<void> {
    await this.stopScanning();
    await this.stopCamera();

    if (this.videoElement) {
      this.videoElement.remove();
      this.videoElement = null;
    }

    if (this.canvasElement) {
      this.canvasElement.remove();
      this.canvasElement = null;
    }

    this.context = null;
    this.emit('disposed', {});
  }

  // Testing and development methods
  async simulateSuccessfulScan(entryId: string, armband: string): Promise<QRScanResult> {
    const mockData = {
      entryId,
      armband,
      showId: 'test-show',
      classId: 'test-class',
      dogName: 'Test Dog',
      handlerName: 'Test Handler',
      checksum: this.calculateChecksum({ entryId, armband })
    };

    return {
      success: true,
      data: JSON.stringify(mockData),
      entryId,
      armband,
      scannedAt: new Date(),
      scannerType: 'camera'
    };
  }
}

// Export singleton instance
export const qrScannerService = new QRScannerService();
