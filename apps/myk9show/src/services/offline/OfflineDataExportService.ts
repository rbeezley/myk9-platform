import { saveAs } from 'file-saver';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { Dog } from '../../types/dog-types';
import { User } from '../../types/show-types';
import { Show } from '../../types/show-types';
import { Club } from '../../types/club-types';

export type ExportFormat = 'csv' | 'json' | 'pdf';
export type EntityType = 'dogs' | 'people' | 'shows' | 'clubs' | 'entries' | 'classes';

export interface ExportOptions {
  format: ExportFormat;
  entities: EntityType[];
  includeMetadata: boolean;
  dateRange?: { start: Date; end: Date };
  showId?: string;
  clubId?: string;
  filename?: string;
}

export interface ExportProgress {
  progress: number;
  stage: string;
  totalItems: number;
  processedItems: number;
  estimatedTimeRemaining?: number;
}

export interface ExportResult {
  success: boolean;
  filename: string;
  format: ExportFormat;
  itemCount: number;
  fileSize: number;
  timestamp: Date;
  error?: string;
}

interface ExportEntry {
  id: string;
  showId: string;
  [key: string]: unknown;
}

interface ExportClass {
  id: string;
  showId: string;
  [key: string]: unknown;
}

class OfflineDataExportService {
  private abortController: AbortController | null = null;
  private progressCallback: ((progress: ExportProgress) => void) | null = null;

  /**
   * Export data with the specified options
   */
  async exportData(
    options: ExportOptions,
    onProgress?: (progress: ExportProgress) => void
  ): Promise<ExportResult> {
    this.abortController = new AbortController();
    this.progressCallback = onProgress || null;

    try {
      this.reportProgress(0, 'Preparing export...', 0, 0);
      
      // Gather data based on options
      const data = await this.gatherExportData(options);
      
      if (this.abortController.signal.aborted) {
        throw new Error('Export cancelled');
      }

      this.reportProgress(50, 'Processing data...', data.totalItems, 0);

      // Generate export based on format
      let result: ExportResult;
      
      switch (options.format) {
        case 'csv':
          result = await this.exportToCSV(data, options);
          break;
        case 'json':
          result = await this.exportToJSON(data, options);
          break;
        case 'pdf':
          result = await this.exportToPDF(data, options);
          break;
        default:
          throw new Error(`Unsupported export format: ${options.format}`);
      }

      this.reportProgress(100, 'Export complete', result.itemCount, result.itemCount);
      return result;

    } catch (error) {
      return {
        success: false,
        filename: '',
        format: options.format,
        itemCount: 0,
        fileSize: 0,
        timestamp: new Date(),
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    } finally {
      this.abortController = null;
      this.progressCallback = null;
    }
  }

  /**
   * Cancel ongoing export operation
   */
  cancelExport(): void {
    if (this.abortController) {
      this.abortController.abort();
    }
  }

  /**
   * Get available entities for export
   */
  getAvailableEntities(): { key: EntityType; label: string; description: string }[] {
    return [
      { key: 'dogs', label: 'Dogs', description: 'Dog profiles, registrations, and health records' },
      { key: 'people', label: 'Users', description: 'Exhibitors, handlers, judges, and officials' },
      { key: 'shows', label: 'Shows', description: 'Show details, schedules, and results' },
      { key: 'clubs', label: 'Clubs', description: 'Club information and memberships' },
      { key: 'entries', label: 'Entries', description: 'Show entries and registrations' },
      { key: 'classes', label: 'Classes', description: 'Class definitions and results' }
    ];
  }

  /**
   * Estimate export size and time
   */
  async estimateExport(options: ExportOptions): Promise<{
    estimatedItems: number;
    estimatedSize: string;
    estimatedTime: string;
  }> {
    const data = await this.gatherExportData(options, true); // Sample only
    
    const baseItemSize = options.format === 'pdf' ? 1000 : 100;
    
    const estimatedBytes = data.totalItems * baseItemSize;
    const estimatedMinutes = Math.ceil(data.totalItems / 1000); // ~1000 items per minute

    return {
      estimatedItems: data.totalItems,
      estimatedSize: this.formatFileSize(estimatedBytes),
      estimatedTime: estimatedMinutes > 1 ? `${estimatedMinutes} minutes` : '< 1 minute'
    };
  }

  private async gatherExportData(options: ExportOptions, sampleOnly = false): Promise<{
    dogs: Dog[];
    people: User[];
    shows: Show[];
    clubs: Club[];
    entries: ExportEntry[];
    classes: ExportClass[];
    totalItems: number;
  }> {
    const data = {
      dogs: [] as Dog[],
      people: [] as User[],
      shows: [] as Show[],
      clubs: [] as Club[],
      entries: [] as ExportEntry[],
      classes: [] as ExportClass[],
      totalItems: 0
    };

    // Get data from localStorage (simulating store access)
    if (options.entities.includes('dogs')) {
      const dogsData = localStorage.getItem('dog-store');
      if (dogsData) {
        const parsed = JSON.parse(dogsData);
        data.dogs = sampleOnly ? parsed.state.dogs.slice(0, 10) : parsed.state.dogs;
      }
    }

    if (options.entities.includes('people')) {
      const peopleData = localStorage.getItem('people-store');
      if (peopleData) {
        const parsed = JSON.parse(peopleData);
        data.people = sampleOnly ? parsed.state.people.slice(0, 10) : parsed.state.people;
      }
    }

    if (options.entities.includes('shows')) {
      const showsData = localStorage.getItem('show-store');
      if (showsData) {
        const parsed = JSON.parse(showsData);
        data.shows = sampleOnly ? parsed.state.shows.slice(0, 10) : parsed.state.shows;
      }
    }

    if (options.entities.includes('clubs')) {
      const clubsData = localStorage.getItem('club-store');
      if (clubsData) {
        const parsed = JSON.parse(clubsData);
        data.clubs = sampleOnly ? parsed.state.clubs.slice(0, 10) : parsed.state.clubs;
      }
    }

    // Apply date range filter if specified
    if (options.dateRange) {
      data.shows = data.shows.filter(show => {
        const showDate = new Date(show.startDate);
        return showDate >= options.dateRange!.start && showDate <= options.dateRange!.end;
      });
    }

    // Apply show filter if specified
    if (options.showId) {
      data.shows = data.shows.filter(show => show.id === options.showId);
      // Filter related entries and classes
      data.entries = data.entries.filter((entry: ExportEntry) => entry.showId === options.showId);
      data.classes = data.classes.filter((cls: ExportClass) => cls.showId === options.showId);
    }

    data.totalItems = data.dogs.length + data.people.length + data.shows.length + 
                     data.clubs.length + data.entries.length + data.classes.length;

    return data;
  }

  private async exportToCSV(data: Record<string, unknown>, options: ExportOptions): Promise<ExportResult> {
    const csvContent: string[] = [];
    let totalItems = 0;

    for (const entityType of options.entities) {
      const entityData = data[entityType] as Array<Record<string, unknown>> | undefined;
      if (entityData && Array.isArray(entityData) && entityData.length > 0) {
        // Add entity header
        csvContent.push(`\n# ${entityType.toUpperCase()}`);
        
        // Add column headers
        const headers = Object.keys(entityData[0]);
        csvContent.push(headers.join(','));
        
        // Add data rows
        entityData.forEach((item: Record<string, unknown>, index: number) => {
          const row = headers.map(header => {
            const value = item[header];
            return typeof value === 'string' && value.includes(',') 
              ? `"${value.replace(/"/g, '""')}"` 
              : value;
          });
          csvContent.push(row.join(','));
          
          totalItems++;
          if (index % 100 === 0) {
            this.reportProgress(
              50 + (index / (entityData as unknown[]).length) * 40,
              `Processing ${entityType}...`,
              (entityData as unknown[]).length,
              index
            );
          }
        });
      }
    }

    const filename = options.filename || `export_${new Date().toISOString().split('T')[0]}.csv`;
    const blob = new Blob([csvContent.join('\n')], { type: 'text/csv;charset=utf-8' });
    saveAs(blob, filename);

    return {
      success: true,
      filename,
      format: 'csv',
      itemCount: totalItems,
      fileSize: blob.size,
      timestamp: new Date()
    };
  }

  private async exportToJSON(data: Record<string, unknown>, options: ExportOptions): Promise<ExportResult> {
    const exportData: Record<string, unknown> = {
      metadata: {
        exportDate: new Date().toISOString(),
        format: 'json',
        entities: options.entities,
        includeMetadata: options.includeMetadata
      }
    };

    let totalItems = 0;

    for (const entityType of options.entities) {
      const entityData = data[entityType] as Array<unknown> | undefined;
      if (entityData && Array.isArray(entityData)) {
        exportData[entityType] = entityData;
        totalItems += entityData.length;
      }
    }

    if (!options.includeMetadata) {
      delete exportData.metadata;
    }

    const filename = options.filename || `export_${new Date().toISOString().split('T')[0]}.json`;
    const jsonString = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    saveAs(blob, filename);

    return {
      success: true,
      filename,
      format: 'json',
      itemCount: totalItems,
      fileSize: blob.size,
      timestamp: new Date()
    };
  }

  private async exportToPDF(data: Record<string, unknown>, options: ExportOptions): Promise<ExportResult> {
    const doc = new jsPDF();
    let yPosition = 20;
    let totalItems = 0;

    // Add title
    doc.setFontSize(16);
    doc.text('Data Export Report', 20, yPosition);
    yPosition += 10;

    // Add metadata
    doc.setFontSize(10);
    doc.text(`Export Date: ${new Date().toLocaleDateString()}`, 20, yPosition);
    yPosition += 5;
    doc.text(`Entities: ${options.entities.join(', ')}`, 20, yPosition);
    yPosition += 15;

    for (const entityType of options.entities) {
      const entityData = data[entityType] as Array<Record<string, unknown>> | undefined;
      if (entityData && Array.isArray(entityData) && entityData.length > 0) {
        // Check if we need a new page
        if (yPosition > 250) {
          doc.addPage();
          yPosition = 20;
        }

        // Add section header
        doc.setFontSize(14);
        doc.text(entityType.toUpperCase(), 20, yPosition);
        yPosition += 10;

        // Prepare table data
        const headers = Object.keys(entityData[0]);
        const rows = entityData.map((item: Record<string, unknown>) => 
          headers.map(header => String(item[header] || ''))
        );

        // Add table
        (doc as unknown as jsPDF & { autoTable: (options: unknown) => void; lastAutoTable: { finalY: number } }).autoTable({
          head: [headers],
          body: rows,
          startY: yPosition,
          styles: { fontSize: 8 },
          headStyles: { fillColor: [66, 139, 202] }
        });

        yPosition = (doc as unknown as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
        totalItems += entityData.length;

        this.reportProgress(
          50 + (options.entities.indexOf(entityType) / options.entities.length) * 40,
          `Processing ${entityType}...`,
          totalItems,
          totalItems
        );
      }
    }

    const filename = options.filename || `export_${new Date().toISOString().split('T')[0]}.pdf`;
    doc.save(filename);

    return {
      success: true,
      filename,
      format: 'pdf',
      itemCount: totalItems,
      fileSize: 0, // PDF size not easily calculable
      timestamp: new Date()
    };
  }


  private reportProgress(
    progress: number,
    stage: string,
    totalItems: number,
    processedItems: number
  ): void {
    if (this.progressCallback) {
      const estimatedTimeRemaining = processedItems > 0 && progress > 0
        ? ((100 - progress) / progress) * (Date.now() / 1000)
        : undefined;

      this.progressCallback({
        progress: Math.min(100, Math.max(0, progress)),
        stage,
        totalItems,
        processedItems,
        estimatedTimeRemaining
      });
    }
  }

  private formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

export const offlineDataExportService = new OfflineDataExportService();