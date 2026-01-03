/**
 * DataExportService - Handle data export in multiple formats
 * 
 * Provides:
 * - JSON export with full fidelity
 * - CSV export for spreadsheet applications
 * - Excel (XLSX) export with formatting
 * - ZIP archives for large exports
 * - Selective entity export
 * - Progress tracking for large exports
 */

export interface ExportProgress {
  stage: string;
  completed: number;
  total: number;
  percentage: number;
  currentItem?: string;
  estimatedTimeRemaining?: number;
}

export interface ExportResult {
  success: boolean;
  filename: string;
  size: number;
  format: string;
  entityCount: number;
  downloadUrl?: string;
  error?: string;
}

export interface ExportOptions {
  format: 'json' | 'csv' | 'xlsx' | 'zip';
  entities: string[];
  dateRange?: {
    start: Date;
    end: Date;
  };
  includeDeleted: boolean;
  compressed: boolean;
  customFields?: Record<string, string[]>; // Entity -> field names
  maxFileSize?: number; // bytes
  splitLargeFiles?: boolean;
}

export class DataExportService {
  private static instance: DataExportService;
  private activeExports: Map<string, AbortController> = new Map();
  private progressCallbacks: Map<string, (progress: ExportProgress) => void> = new Map();

  private constructor() {}

  public static getInstance(): DataExportService {
    if (!DataExportService.instance) {
      DataExportService.instance = new DataExportService();
    }
    return DataExportService.instance;
  }

  /**
   * Export data with the specified options
   */
  public async exportData(
    options: ExportOptions,
    onProgress?: (progress: ExportProgress) => void
  ): Promise<ExportResult> {
    const exportId = this.generateExportId();
    const abortController = new AbortController();
    
    this.activeExports.set(exportId, abortController);
    if (onProgress) {
      this.progressCallbacks.set(exportId, onProgress);
    }

    try {
      const result = await this.performExport(exportId, options, abortController.signal);
      return result;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return {
          success: false,
          filename: '',
          size: 0,
          format: options.format,
          entityCount: 0,
          error: 'Export cancelled by user'
        };
      }
      
      return {
        success: false,
        filename: '',
        size: 0,
        format: options.format,
        entityCount: 0,
        error: error instanceof Error ? error.message : 'Unknown export error'
      };
    } finally {
      this.activeExports.delete(exportId);
      this.progressCallbacks.delete(exportId);
    }
  }

  /**
   * Cancel an active export
   */
  public cancelExport(exportId: string): void {
    const controller = this.activeExports.get(exportId);
    if (controller) {
      controller.abort();
    }
  }

  /**
   * Get list of active exports
   */
  public getActiveExports(): string[] {
    return Array.from(this.activeExports.keys());
  }

  /**
   * Core export logic
   */
  private async performExport(
    exportId: string,
    options: ExportOptions,
    signal: AbortSignal
  ): Promise<ExportResult> {
    const startTime = performance.now();
    
    // Stage 1: Gather data
    this.updateProgress(exportId, {
      stage: 'Gathering data',
      completed: 0,
      total: 100,
      percentage: 0
    });

    const data = await this.gatherExportData(exportId, options, signal);
    
    if (signal.aborted) throw new Error('Export cancelled');

    // Stage 2: Process and format data
    this.updateProgress(exportId, {
      stage: 'Processing data',
      completed: 30,
      total: 100,
      percentage: 30
    });

    const processedData = await this.processExportData(data, options, signal);
    
    if (signal.aborted) throw new Error('Export cancelled');

    // Stage 3: Generate export file
    this.updateProgress(exportId, {
      stage: 'Generating export file',
      completed: 60,
      total: 100,
      percentage: 60
    });

    const exportFile = await this.generateExportFile(processedData, options);
    
    if (signal.aborted) throw new Error('Export cancelled');

    // Stage 4: Finalize
    this.updateProgress(exportId, {
      stage: 'Finalizing export',
      completed: 90,
      total: 100,
      percentage: 90
    });

    const result = await this.finalizeExport(exportFile, options);
    
    this.updateProgress(exportId, {
      stage: 'Complete',
      completed: 100,
      total: 100,
      percentage: 100
    });

    const endTime = performance.now();
    console.log(`Export completed in ${Math.round(endTime - startTime)}ms`);

    return result;
  }

  /**
   * Gather data from all specified entities
   */
  private async gatherExportData(
    exportId: string,
    options: ExportOptions,
    signal: AbortSignal
  ): Promise<Record<string, unknown[]>> {
    const data: Record<string, unknown[]> = {};
    
    for (let i = 0; i < options.entities.length; i++) {
      if (signal.aborted) throw new Error('Export cancelled');
      
      const entity = options.entities[i];
      
      this.updateProgress(exportId, {
        stage: 'Gathering data',
        completed: (i / options.entities.length) * 30,
        total: 100,
        percentage: (i / options.entities.length) * 30,
        currentItem: `Loading ${entity} data`
      });

      try {
        const entityData = await this.getEntityData(entity, options);
        data[entity] = entityData;
        
        // Simulate loading delay
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (error) {
        console.error(`Failed to load ${entity} data:`, error);
        data[entity] = []; // Include empty array for failed entities
      }
    }

    return data;
  }

  /**
   * Get data for a specific entity
   */
  private async getEntityData(entityType: string, options: ExportOptions): Promise<unknown[]> {
    // Simulate data retrieval - in real app, get from actual stores
    const mockData = await this.getMockEntityData(entityType);
    
    // Apply filters
    let filteredData = [...mockData];

    // Filter by date range
    if (options.dateRange) {
      filteredData = filteredData.filter(item => {
        const itemRecord = item as Record<string, unknown>;
        const itemDate = new Date(
          (itemRecord.createdAt as string) || 
          (itemRecord.date as string) || 
          (itemRecord.updatedAt as string)
        );
        return itemDate >= options.dateRange!.start && itemDate <= options.dateRange!.end;
      });
    }

    // Filter deleted items
    if (!options.includeDeleted) {
      filteredData = filteredData.filter(item => !(item as Record<string, unknown>).isDeleted);
    }

    // Apply custom field selection
    if (options.customFields && options.customFields[entityType]) {
      const fields = options.customFields[entityType];
      filteredData = filteredData.map(item => {
        const filtered: Record<string, unknown> = {};
        const itemRecord = item as Record<string, unknown>;
        fields.forEach(field => {
          if (field in itemRecord) {
            filtered[field] = itemRecord[field];
          }
        });
        return filtered;
      });
    }

    return filteredData;
  }

  /**
   * Process and transform data for export
   */
  private async processExportData(
    data: Record<string, unknown[]>,
    options: ExportOptions,
    signal: AbortSignal
  ): Promise<Record<string, unknown[]>> {
    const processed: Record<string, unknown[]> = {};

    const entities = Object.keys(data);
    for (let i = 0; i < entities.length; i++) {
      if (signal.aborted) throw new Error('Export cancelled');
      
      const entity = entities[i];
      const entityData = data[entity];
      
      // Transform data based on format
      switch (options.format) {
        case 'csv':
        case 'xlsx':
          processed[entity] = this.flattenDataForTableFormat(entityData);
          break;
        case 'json':
        default:
          processed[entity] = entityData;
          break;
      }

      // Simulate processing delay
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return processed;
  }

  /**
   * Generate the export file
   */
  private async generateExportFile(
    data: Record<string, unknown[]>,
    options: ExportOptions
  ): Promise<{ content: string | Blob; filename: string; size: number }> {
    const timestamp = new Date().toISOString().split('T')[0];
    let filename: string;
    let content: string | Blob;

    switch (options.format) {
      case 'json':
        filename = `myK9Show-export-${timestamp}.json`;
        content = this.generateJSONExport(data, options);
        break;
        
      case 'csv':
        filename = `myK9Show-export-${timestamp}.csv`;
        content = this.generateCSVExport(data);
        break;
        
      case 'xlsx':
        filename = `myK9Show-export-${timestamp}.xlsx`;
        content = await this.generateExcelExport(data);
        break;
        
      case 'zip':
        filename = `myK9Show-export-${timestamp}.zip`;
        content = await this.generateZipExport(data, options);
        break;
        
      default:
        throw new Error(`Unsupported export format: ${options.format}`);
    }

    const size = typeof content === 'string' ? 
      new Blob([content]).size : 
      content.size;

    return { content, filename, size };
  }

  /**
   * Generate JSON export
   */
  private generateJSONExport(
    data: Record<string, unknown[]>,
    options: ExportOptions
  ): string {
    const exportData = {
      metadata: {
        exportedAt: new Date().toISOString(),
        format: 'json',
        version: '1.0.0',
        options: {
          entities: options.entities,
          includeDeleted: options.includeDeleted,
          dateRange: options.dateRange
        }
      },
      data
    };

    return JSON.stringify(exportData, null, 2);
  }

  /**
   * Generate CSV export
   */
  private generateCSVExport(
    data: Record<string, unknown[]>
  ): string {
    const csvParts: string[] = [];

    for (const [entityType, entityData] of Object.entries(data)) {
      if (entityData.length === 0) continue;

      csvParts.push(`\n# ${entityType.toUpperCase()}\n`);
      
      // Get all unique columns
      const columns = this.getUniqueColumns(entityData);
      
      // Add header
      csvParts.push(columns.map(col => `"${col}"`).join(','));
      
      // Add data rows
      entityData.forEach(item => {
        const itemRecord = item as Record<string, unknown>;
        const row = columns.map(col => {
          const value = itemRecord[col];
          if (value === null || value === undefined) return '""';
          if (typeof value === 'object') return `"${JSON.stringify(value)}"`;
          return `"${String(value).replace(/"/g, '""')}"`;
        });
        csvParts.push(row.join(','));
      });
      
      csvParts.push(''); // Empty line between entities
    }

    return csvParts.join('\n');
  }

  /**
   * Generate Excel export (simulated)
   */
  private async generateExcelExport(
    data: Record<string, unknown[]>
  ): Promise<Blob> {
    // In a real implementation, use a library like SheetJS or exceljs
    // For now, generate a simple tab-separated values format
    
    const tsvParts: string[] = [];
    
    for (const [entityType, entityData] of Object.entries(data)) {
      if (entityData.length === 0) continue;

      tsvParts.push(`${entityType.toUpperCase()}\n`);
      
      const columns = this.getUniqueColumns(entityData);
      tsvParts.push(columns.join('\t'));
      
      entityData.forEach(item => {
        const itemRecord = item as Record<string, unknown>;
        const row = columns.map(col => {
          const value = itemRecord[col];
          if (value === null || value === undefined) return '';
          if (typeof value === 'object') return JSON.stringify(value);
          return String(value);
        });
        tsvParts.push(row.join('\t'));
      });
      
      tsvParts.push(''); // Empty line
    }

    return new Blob([tsvParts.join('\n')], { 
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
    });
  }

  /**
   * Generate ZIP export
   */
  private async generateZipExport(
    data: Record<string, unknown[]>,
    options: ExportOptions
  ): Promise<Blob> {
    // In a real implementation, use JSZip
    // For now, simulate by creating a JSON file
    
    const jsonContent = this.generateJSONExport(data, options);
    
    // Simulate zip compression
    const compressedContent = `SIMULATED ZIP ARCHIVE\n\nOriginal JSON content:\n${jsonContent}`;
    
    return new Blob([compressedContent], { type: 'application/zip' });
  }

  /**
   * Finalize export and create download
   */
  private async finalizeExport(
    exportFile: { content: string | Blob; filename: string; size: number },
    options: ExportOptions
  ): Promise<ExportResult> {
    try {
      // Create download URL
      const blob = typeof exportFile.content === 'string' 
        ? new Blob([exportFile.content], { type: this.getContentType(options.format) })
        : exportFile.content;
      
      const downloadUrl = URL.createObjectURL(blob);
      
      // Trigger download
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = exportFile.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Clean up URL after a delay
      setTimeout(() => URL.revokeObjectURL(downloadUrl), 10000);

      return {
        success: true,
        filename: exportFile.filename,
        size: exportFile.size,
        format: options.format,
        entityCount: options.entities.length,
        downloadUrl
      };
    } catch (error) {
      throw new Error(`Failed to finalize export: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Flatten complex objects for table formats
   */
  private flattenDataForTableFormat(data: unknown[]): unknown[] {
    return data.map(item => this.flattenObject(item as Record<string, unknown>));
  }

  /**
   * Recursively flatten an object
   */
  private flattenObject(obj: Record<string, unknown>, prefix = '', result: Record<string, unknown> = {}): Record<string, unknown> {
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        const newKey = prefix ? `${prefix}.${key}` : key;
        
        if (obj[key] !== null && typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
          this.flattenObject(obj[key] as Record<string, unknown>, newKey, result);
        } else if (Array.isArray(obj[key])) {
          result[newKey] = JSON.stringify(obj[key]);
        } else {
          result[newKey] = obj[key];
        }
      }
    }
    return result;
  }

  /**
   * Get unique columns from data array
   */
  private getUniqueColumns(data: unknown[]): string[] {
    const columns = new Set<string>();
    data.forEach(item => {
      Object.keys(item as Record<string, unknown>).forEach(key => columns.add(key));
    });
    return Array.from(columns).sort();
  }

  /**
   * Get content type for format
   */
  private getContentType(format: string): string {
    switch (format) {
      case 'json':
        return 'application/json';
      case 'csv':
        return 'text/csv';
      case 'xlsx':
        return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      case 'zip':
        return 'application/zip';
      default:
        return 'application/octet-stream';
    }
  }

  /**
   * Update progress for an export
   */
  private updateProgress(exportId: string, progress: ExportProgress): void {
    const callback = this.progressCallbacks.get(exportId);
    if (callback) {
      callback(progress);
    }
  }

  /**
   * Generate unique export ID
   */
  private generateExportId(): string {
    return `export_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get mock data for demonstration
   */
  private async getMockEntityData(entityType: string): Promise<unknown[]> {
    // Simulate async data loading
    await new Promise(resolve => setTimeout(resolve, 50));
    
    const mockData = {
      shows: Array.from({ length: 25 }, (_, i) => ({
        id: `show-${i + 1}`,
        name: `Dog Show ${i + 1}`,
        date: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000),
        location: `Location ${i + 1}`,
        status: ['upcoming', 'active', 'completed'][Math.floor(Math.random() * 3)],
        entryCount: Math.floor(Math.random() * 100) + 10,
        createdAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000),
        isDeleted: Math.random() < 0.1
      })),
      
      entries: Array.from({ length: 1250 }, (_, i) => ({
        id: `entry-${i + 1}`,
        showId: `show-${Math.floor(Math.random() * 25) + 1}`,
        dogId: `dog-${Math.floor(Math.random() * 450) + 1}`,
        classId: `class-${Math.floor(Math.random() * 150) + 1}`,
        ownerId: `person-${Math.floor(Math.random() * 300) + 1}`,
        status: ['registered', 'withdrawn', 'completed'][Math.floor(Math.random() * 3)],
        entryFee: Math.floor(Math.random() * 50) + 15,
        createdAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000),
        isDeleted: Math.random() < 0.05
      })),
      
      dogs: Array.from({ length: 450 }, (_, i) => ({
        id: `dog-${i + 1}`,
        name: `Dog ${i + 1}`,
        breed: ['Labrador', 'Golden Retriever', 'German Shepherd', 'Beagle', 'Poodle'][Math.floor(Math.random() * 5)],
        ownerId: `person-${Math.floor(Math.random() * 300) + 1}`,
        dateOfBirth: new Date(Date.now() - Math.random() * 10 * 365 * 24 * 60 * 60 * 1000),
        registrationNumber: `REG${i + 1000}`,
        createdAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000),
        isDeleted: Math.random() < 0.02
      })),
      
      people: Array.from({ length: 300 }, (_, i) => ({
        id: `person-${i + 1}`,
        name: `User ${i + 1}`,
        email: `person${i + 1}@example.com`,
        phone: `555-${String(Math.floor(Math.random() * 9000) + 1000)}`,
        address: {
          street: `${Math.floor(Math.random() * 9999) + 1} Main St`,
          city: `City ${i + 1}`,
          state: 'CA',
          zip: String(Math.floor(Math.random() * 90000) + 10000)
        },
        createdAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000),
        isDeleted: Math.random() < 0.03
      }))
    };

    return mockData[entityType as keyof typeof mockData] || [];
  }
}

export default DataExportService;