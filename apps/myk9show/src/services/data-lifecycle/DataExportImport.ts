/**
 * Data Export/Import Service
 * 
 * Handles exporting and importing data for archival, backup, and
 * data transfer purposes with support for multiple formats.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { saveAs } from 'file-saver';
import { smartCompress, smartDecompress } from '@/services/database/compression-utils';
import { logger } from '@/services/LoggingService';

export type ExportFormat = 'json' | 'csv' | 'excel' | 'zip';

export interface ExportOptions {
  format: ExportFormat;
  includeMetadata: boolean;
  compress: boolean;
  encryption?: {
    enabled: boolean;
    password?: string | undefined;
  } | undefined;
  filters?: {
    dateRange?: { start: Date; end: Date } | undefined;
    types?: string[] | undefined;
    ids?: string[] | undefined;
  } | undefined;
}

export interface ExportResult {
  success: boolean;
  filename: string;
  sizeBytes: number;
  recordCount: number;
  exportedAt: Date;
  error?: string | undefined;
}

export interface ImportOptions {
  validateData: boolean;
  mergeStrategy: 'replace' | 'merge' | 'skip';
  dryRun: boolean;
  transformers?: Record<string, (data: unknown) => unknown> | undefined;
}

export interface ImportResult {
  success: boolean;
  recordsImported: number;
  recordsSkipped: number;
  recordsFailed: number;
  errors: string[];
  warnings: string[];
}

export interface ExportManifest {
  version: string;
  exportedAt: string;
  exportedBy: string;
  dataTypes: string[];
  recordCounts: Record<string, number>;
  checksum?: string | undefined;
  compression?: string | undefined;
  encryption?: string | undefined;
}

export class DataExportImportService {
  private readonly EXPORT_VERSION = '1.0.0';
  
  /**
   * Export data to file
   */
  public async exportData(
    data: Record<string, unknown[]>,
    options: ExportOptions
  ): Promise<ExportResult> {
    logger.info('Starting data export', 'lifecycle', { format: options.format });
    
    try {
      // Apply filters if specified
      const filteredData = this.applyFilters(data, options.filters);
      
      // Create export manifest
      const manifest = this.createManifest(filteredData, options);
      
      // Convert to export format
      let exportContent: string | Blob;
      let filename: string;
      
      switch (options.format) {
        case 'json':
          exportContent = await this.exportToJSON(filteredData, manifest, options);
          filename = `myk9show-export-${Date.now()}.json`;
          break;
          
        case 'csv':
          exportContent = await this.exportToCSV(filteredData, options);
          filename = `myk9show-export-${Date.now()}.csv`;
          break;
          
        case 'zip':
          exportContent = await this.exportToZIP(filteredData, manifest, options);
          filename = `myk9show-export-${Date.now()}.zip`;
          break;
          
        default:
          throw new Error(`Unsupported export format: ${options.format}`);
      }
      
      // Save file
      const blob = exportContent instanceof Blob 
        ? exportContent 
        : new Blob([exportContent], { type: 'application/octet-stream' });
      
      saveAs(blob, filename);
      
      // Calculate total records
      const recordCount = Object.values(filteredData)
        .reduce((sum, records) => sum + records.length, 0);
      
      return {
        success: true,
        filename,
        sizeBytes: blob.size,
        recordCount,
        exportedAt: new Date(),
      };
      
    } catch (error) {
      logger.error('Export failed', 'lifecycle', {}, error as Error);
      return {
        success: false,
        filename: '',
        sizeBytes: 0,
        recordCount: 0,
        exportedAt: new Date(),
        error: error instanceof Error ? error.message : 'Export failed',
      };
    }
  }

  /**
   * Import data from file
   */
  public async importData(
    file: File,
    options: ImportOptions
  ): Promise<ImportResult> {
    logger.info('Starting data import', 'lifecycle', { fileName: file.name });
    
    const result: ImportResult = {
      success: false,
      recordsImported: 0,
      recordsSkipped: 0,
      recordsFailed: 0,
      errors: [],
      warnings: [],
    };
    
    try {
      // Read file content
      const content = await this.readFile(file);
      
      // Parse based on file type
      let data: Record<string, any[]>;
      let manifest: ExportManifest | undefined;
      
      if (file.name.endsWith('.json')) {
        const parsed = await this.parseJSON(content);
        data = parsed.data;
        manifest = parsed.manifest;
      } else if (file.name.endsWith('.csv')) {
        data = await this.parseCSV(content);
      } else if (file.name.endsWith('.zip')) {
        const parsed = await this.parseZIP(file);
        data = parsed.data;
        manifest = parsed.manifest;
      } else {
        throw new Error('Unsupported file format');
      }
      
      // Validate if requested
      if (options.validateData) {
        const validation = this.validateImportData(data, manifest);
        if (!validation.isValid) {
          result.errors.push(...validation.errors);
          return result;
        }
        result.warnings.push(...validation.warnings);
      }
      
      // Apply transformers if provided
      if (options.transformers) {
        data = this.applyTransformers(data, options.transformers);
      }
      
      // Import data (dry run or actual)
      if (options.dryRun) {
        logger.info('Dry run mode - no data will be imported', 'lifecycle');
        result.recordsImported = Object.values(data)
          .reduce((sum, records) => sum + records.length, 0);
      } else {
        const importResult = await this.performImport(data, options);
        Object.assign(result, importResult);
      }
      
      result.success = result.errors.length === 0;
      return result;
      
    } catch (error) {
      logger.error('Import failed', 'lifecycle', {}, error as Error);
      result.errors.push(error instanceof Error ? error.message : 'Import failed');
      return result;
    }
  }

  /**
   * Export to JSON format
   */
  private async exportToJSON(
    data: Record<string, any[]>,
    manifest: ExportManifest,
    options: ExportOptions
  ): Promise<string> {
    const exportData = {
      manifest,
      data,
    };
    
    let jsonString = JSON.stringify(exportData, null, 2);
    
    // Compress if requested
    if (options.compress) {
      jsonString = smartCompress(jsonString);
    }
    
    return jsonString;
  }

  /**
   * Export to CSV format
   */
  private async exportToCSV(
    data: Record<string, any[]>,
    _options: ExportOptions
  ): Promise<string> {
    void _options; // Mark as intentionally unused
    const csvLines: string[] = [];
    
    // Export each data type as a separate section
    for (const [dataType, records] of Object.entries(data)) {
      if (records.length === 0) continue;
      
      // Section header
      csvLines.push(`# ${dataType.toUpperCase()}`);
      
      // Get all unique keys from records
      const keys = new Set<string>();
      records.forEach(record => {
        Object.keys(record).forEach(key => keys.add(key));
      });
      
      // Header row
      const headers = Array.from(keys);
      csvLines.push(headers.map(h => `"${h}"`).join(','));
      
      // Data rows
      records.forEach(record => {
        const values = headers.map(header => {
          const value = record[header];
          if (value === null || value === undefined) return '';
          if (typeof value === 'object') return JSON.stringify(value);
          return `"${String(value).replace(/"/g, '""')}"`;
        });
        csvLines.push(values.join(','));
      });
      
      csvLines.push(''); // Empty line between sections
    }
    
    return csvLines.join('\n');
  }

  /**
   * Export to ZIP format
   */
  private async exportToZIP(
    data: Record<string, any[]>,
    manifest: ExportManifest,
    options: ExportOptions
  ): Promise<Blob> {
    // Dynamic import of JSZip to avoid loading it unless needed
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    
    // Add manifest
    zip.file('manifest.json', JSON.stringify(manifest, null, 2));
    
    // Add data files
    for (const [dataType, records] of Object.entries(data)) {
      const content = JSON.stringify(records, null, 2);
      
      if (options.compress) {
        zip.file(`${dataType}.json.gz`, smartCompress(content));
      } else {
        zip.file(`${dataType}.json`, content);
      }
    }
    
    // Add metadata if requested
    if (options.includeMetadata) {
      const metadata = {
        exportDate: new Date().toISOString(),
        recordCounts: Object.fromEntries(
          Object.entries(data).map(([type, records]) => [type, records.length])
        ),
        options: options,
      };
      zip.file('metadata.json', JSON.stringify(metadata, null, 2));
    }
    
    return await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  }

  /**
   * Apply filters to data before export
   */
  private applyFilters(
    data: Record<string, any[]>,
    filters?: ExportOptions['filters']
  ): Record<string, any[]> {
    if (!filters) return data;
    
    const filtered: Record<string, any[]> = {};
    
    for (const [dataType, records] of Object.entries(data)) {
      let filteredRecords = [...records];
      
      // Filter by type
      if (filters.types && !filters.types.includes(dataType)) {
        continue;
      }
      
      // Filter by IDs
      if (filters.ids) {
        filteredRecords = filteredRecords.filter(r => filters.ids!.includes(r.id));
      }
      
      // Filter by date range
      if (filters.dateRange) {
        filteredRecords = filteredRecords.filter(r => {
          const recordDate = new Date(r.createdAt || r.date || 0);
          return recordDate >= filters.dateRange!.start && 
                 recordDate <= filters.dateRange!.end;
        });
      }
      
      if (filteredRecords.length > 0) {
        filtered[dataType] = filteredRecords;
      }
    }
    
    return filtered;
  }

  /**
   * Create export manifest
   */
  private createManifest(
    data: Record<string, any[]>,
    options: ExportOptions
  ): ExportManifest {
    return {
      version: this.EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      exportedBy: 'myK9Show', // Could include user info
      dataTypes: Object.keys(data),
      recordCounts: Object.fromEntries(
        Object.entries(data).map(([type, records]) => [type, records.length])
      ),
      compression: options.compress ? 'smart' : undefined,
      encryption: options.encryption?.enabled ? 'AES-256' : undefined,
    };
  }

  /**
   * Read file content
   */
  private readFile(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string);
      reader.onerror = reject;
      reader.readAsText(file);
    });
  }

  /**
   * Parse JSON import
   */
  private async parseJSON(content: string): Promise<{
    data: Record<string, any[]>;
    manifest?: ExportManifest;
  }> {
    try {
      // Try to decompress first
      let jsonContent = content;
      try {
        jsonContent = smartDecompress(content);
      } catch {
        // Not compressed, use as-is
      }
      
      const parsed = JSON.parse(jsonContent);
      
      // Check if it has manifest structure
      if (parsed.manifest && parsed.data) {
        return {
          data: parsed.data,
          manifest: parsed.manifest,
        };
      }
      
      // Otherwise assume it's just data
      return { data: parsed };
      
    } catch (error) {
      throw new Error(`Failed to parse JSON: ${error}`);
    }
  }

  /**
   * Parse CSV import
   */
  private async parseCSV(content: string): Promise<Record<string, any[]>> {
    const data: Record<string, any[]> = {};
    const lines = content.split('\n').filter(line => line.trim());
    
    let currentType = '';
    let headers: string[] = [];
    let records: any[] = [];
    
    for (const line of lines) {
      // Section header
      if (line.startsWith('#')) {
        if (currentType && records.length > 0) {
          data[currentType] = records;
        }
        currentType = line.substring(1).trim().toLowerCase();
        records = [];
        headers = [];
        continue;
      }
      
      // Header row
      if (headers.length === 0) {
        headers = this.parseCSVLine(line);
        continue;
      }
      
      // Data row
      const values = this.parseCSVLine(line);
      const record: any = {};
      
      headers.forEach((header, index) => {
        let value = values[index];
        
        // Try to parse JSON values
        if (value.startsWith('{') || value.startsWith('[')) {
          try {
            value = JSON.parse(value);
          } catch {
            // Keep as string
          }
        }
        
        record[header] = value;
      });
      
      records.push(record);
    }
    
    // Add last section
    if (currentType && records.length > 0) {
      data[currentType] = records;
    }
    
    return data;
  }

  /**
   * Parse CSV line
   */
  private parseCSVLine(line: string): string[] {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];
      
      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          current += '"';
          i++; // Skip next quote
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        values.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    
    values.push(current);
    return values;
  }

  /**
   * Parse ZIP import
   */
  private async parseZIP(file: File): Promise<{
    data: Record<string, any[]>;
    manifest?: ExportManifest;
  }> {
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(file);
    
    const data: Record<string, any[]> = {};
    let manifest: ExportManifest | undefined;
    
    // Read manifest
    const manifestFile = zip.file('manifest.json');
    if (manifestFile) {
      const content = await manifestFile.async('string');
      manifest = JSON.parse(content);
    }
    
    // Read data files
    for (const filename of Object.keys(zip.files)) {
      if (filename === 'manifest.json' || filename === 'metadata.json') continue;
      
      const file = zip.file(filename);
      if (!file) continue;
      
      let content = await file.async('string');
      
      // Decompress if needed
      if (filename.endsWith('.gz')) {
        content = smartDecompress(content);
      }
      
      const dataType = filename.replace(/\.(json|gz)$/g, '');
      data[dataType] = JSON.parse(content);
    }
    
    return { data, ...(manifest !== undefined && { manifest }) };
  }

  /**
   * Validate import data
   */
  private validateImportData(
    data: Record<string, any[]>,
    manifest?: ExportManifest
  ): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // Check manifest version compatibility
    if (manifest && manifest.version !== this.EXPORT_VERSION) {
      warnings.push(`Version mismatch: expected ${this.EXPORT_VERSION}, got ${manifest.version}`);
    }
    
    // Validate data structure
    for (const [dataType, records] of Object.entries(data)) {
      if (!Array.isArray(records)) {
        errors.push(`Invalid data structure for ${dataType}: expected array`);
        continue;
      }
      
      // Check for required fields based on data type
      records.forEach((record, index) => {
        if (!record.id) {
          warnings.push(`Record ${index} in ${dataType} missing ID field`);
        }
      });
    }
    
    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Apply transformers to imported data
   */
  private applyTransformers(
    data: Record<string, any[]>,
    transformers: Record<string, (data: any) => any>
  ): Record<string, any[]> {
    const transformed: Record<string, any[]> = {};
    
    for (const [dataType, records] of Object.entries(data)) {
      const transformer = transformers[dataType];
      
      if (transformer) {
        transformed[dataType] = records.map(transformer);
      } else {
        transformed[dataType] = records;
      }
    }
    
    return transformed;
  }

  /**
   * Perform the actual import
   */
  private async performImport(
    data: Record<string, any[]>,
    options: ImportOptions
  ): Promise<Partial<ImportResult>> {
    let recordsImported = 0;
    let recordsSkipped = 0;
    let recordsFailed = 0;
    const errors: string[] = [];
    
    // TODO: Implement actual import logic based on data types
    // This would integrate with your stores
    
    for (const [dataType, records] of Object.entries(data)) {
      logger.info('Importing records', 'lifecycle', { count: records.length, dataType });
      
      // Example implementation - replace with actual store integration
      try {
        switch (options.mergeStrategy) {
          case 'replace':
            // Clear existing and add new
            recordsImported += records.length;
            break;
            
          case 'merge':
            // Merge with existing
            recordsImported += records.length;
            break;
            
          case 'skip':
            // Skip existing
            recordsImported += records.length / 2; // Example
            recordsSkipped += records.length / 2;
            break;
        }
      } catch (error) {
        recordsFailed += records.length;
        errors.push(`Failed to import ${dataType}: ${error}`);
      }
    }
    
    return {
      recordsImported,
      recordsSkipped,
      recordsFailed,
      errors,
    };
  }
}

// Singleton instance
let exportImportService: DataExportImportService | null = null;

export function getDataExportImportService(): DataExportImportService {
  if (!exportImportService) {
    exportImportService = new DataExportImportService();
  }
  return exportImportService;
}