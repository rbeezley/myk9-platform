import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { Show, ShowClass } from '../../types/show-types';
import { Dog } from '../../types/dog-types';
import { User } from '../../types/show-types';
import { resolvePersonNameFromStore } from '../../hooks/useResolvePersonName';

interface jsPDFWithAutoTable extends jsPDF {
  autoTable: (options: Record<string, unknown>) => void;
  lastAutoTable: { finalY: number };
}

export type ReportType =
  | 'entry-list'
  | 'class-schedule'
  | 'judge-book'
  | 'results'
  | 'show-summary';

export interface ReportOptions {
  type: ReportType;
  showId: string;
  classIds?: string[];
  judgeId?: string;
  includePhotos?: boolean;
  includeSummary?: boolean;
  format?: 'pdf' | 'html';
  title?: string;
}

export interface ReportEntry {
  id: string;
  showId: string;
  classId: string;
  dogId: string;
  exhibitorId: string;
  armband?: string;
  catalog?: string;
  placement?: string | number;
  points?: string | number;
  // Add other entry properties as needed
}

export interface ReportData {
  show: Show;
  classes: ShowClass[];
  entries: ReportEntry[];
  dogs: Dog[];
  people: User[];
  judges: User[];
}

class OfflineReportService {
  /**
   * Generate a comprehensive report based on type and options
   */
  async generateReport(
    options: ReportOptions
  ): Promise<{ success: boolean; filename?: string; error?: string }> {
    try {
      const reportData = await this.gatherReportData(options);

      switch (options.type) {
        case 'entry-list':
          return await this.generateEntryListReport(reportData);
        case 'class-schedule':
          return await this.generateClassScheduleReport(reportData);
        case 'judge-book':
          return await this.generateJudgeBookReport(reportData, options);
        case 'results':
          return await this.generateResultsReport(reportData);
        case 'show-summary':
          return await this.generateShowSummaryReport(reportData);
        default:
          throw new Error(`Unsupported report type: ${options.type}`);
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get available report types with descriptions
   */
  getAvailableReports(): { key: ReportType; label: string; description: string }[] {
    return [
      {
        key: 'entry-list',
        label: 'Entry List',
        description: 'Complete list of show entries with dog and exhibitor details',
      },
      {
        key: 'class-schedule',
        label: 'Class Schedule',
        description: 'Ring assignments and timing for all classes',
      },
      {
        key: 'judge-book',
        label: 'Judge Book',
        description: 'Complete judging assignments and class information',
      },
      {
        key: 'results',
        label: 'Results',
        description: 'Placement lists and awards for completed classes',
      },
      {
        key: 'show-summary',
        label: 'Show Summary',
        description: 'Statistics and overview of the entire show',
      },
    ];
  }

  private async gatherReportData(options: ReportOptions): Promise<ReportData> {
    // Get data from localStorage (simulating store access)
    const showsData = localStorage.getItem('show-store');
    const dogsData = localStorage.getItem('dog-store');
    const peopleData = localStorage.getItem('people-store');

    const shows = showsData ? JSON.parse(showsData).state.shows : [];
    const dogs = dogsData ? JSON.parse(dogsData).state.dogs : [];
    const people = peopleData ? JSON.parse(peopleData).state.people : [];

    const show = shows.find((s: Show) => s.id === options.showId);
    if (!show) {
      throw new Error(`Show not found: ${options.showId}`);
    }

    // Filter classes if specified
    let classes = show.classes || [];
    if (options.classIds && options.classIds.length > 0) {
      classes = classes.filter((cls: ShowClass) => options.classIds!.includes(cls.id));
    }

    // Get entries for the show (mock data structure)
    const entries = classes.flatMap((cls: ShowClass) => cls.entries || []);

    // Get judges
    const judges = people.filter((p: User) =>
      show.judges?.some((judgeAssignment: { judgeId: string }) => judgeAssignment.judgeId === p.id)
    );

    return {
      show,
      classes,
      entries,
      dogs,
      people,
      judges,
    };
  }

  private async generateEntryListReport(
    data: ReportData
  ): Promise<{ success: boolean; filename: string }> {
    const doc = new jsPDF();
    let yPosition = 20;

    // Header
    this.addReportHeader(doc, 'ENTRY LIST', data.show, yPosition);
    yPosition += 30;

    // Show information
    yPosition = this.addShowInformation(doc, data.show, yPosition);
    yPosition += 10;

    // Entry statistics
    doc.setFontSize(12);
    doc.text('ENTRY STATISTICS', 20, yPosition);
    yPosition += 10;

    doc.setFontSize(10);
    doc.text(`Total Classes: ${data.classes.length}`, 20, yPosition);
    yPosition += 5;
    doc.text(`Total Entries: ${data.entries.length}`, 20, yPosition);
    yPosition += 5;
    doc.text(`Total Dogs: ${new Set(data.entries.map(e => e.dogId)).size}`, 20, yPosition);
    yPosition += 15;

    // Classes and entries
    for (const classItem of data.classes) {
      if (yPosition > 250) {
        doc.addPage();
        yPosition = 20;
      }

      // Class header
      doc.setFontSize(12);
      doc.text(`CLASS ${classItem.id}: ${classItem.name}`, 20, yPosition);
      yPosition += 5;

      doc.setFontSize(10);
      doc.text(
        `Judge: ${classItem.judgeName || 'TBD'} | Ring: ${classItem.ringNumber || 'TBD'}`,
        20,
        yPosition
      );
      yPosition += 10;

      // Entries table
      const classEntries = data.entries.filter(e => e.classId === classItem.id);
      if (classEntries.length > 0) {
        const entryRows = classEntries.map(entry => {
          const dog = data.dogs.find(d => d.id === entry.dogId);
          const exhibitor = data.people.find(p => p.id === entry.exhibitorId);
          return [
            entry.armband || '',
            dog?.name || '',
            dog?.breed || '',
            exhibitor ? `${exhibitor.firstName} ${exhibitor.lastName}` : '',
            entry.catalog || '',
          ];
        });

        (doc as jsPDFWithAutoTable).autoTable({
          head: [['Armband', 'Dog Name', 'Breed', 'Exhibitor', 'Catalog']],
          body: entryRows,
          startY: yPosition,
          styles: { fontSize: 8 },
          headStyles: { fillColor: [66, 139, 202] },
          margin: { left: 20 },
        });

        yPosition = (doc as jsPDFWithAutoTable).lastAutoTable.finalY + 10;
      } else {
        doc.text('No entries', 25, yPosition);
        yPosition += 10;
      }
    }

    const filename = `entry-list-${data.show.name}-${new Date().toISOString().split('T')[0]}.pdf`;
    doc.save(filename);

    return { success: true, filename };
  }

  private async generateClassScheduleReport(
    data: ReportData
  ): Promise<{ success: boolean; filename: string }> {
    const doc = new jsPDF();
    let yPosition = 20;

    // Header
    this.addReportHeader(doc, 'CLASS SCHEDULE', data.show, yPosition);
    yPosition += 30;

    // Show information
    yPosition = this.addShowInformation(doc, data.show, yPosition);
    yPosition += 10;

    // Schedule table
    const scheduleRows = data.classes.map(cls => [
      cls.classNumber || '',
      cls.className || '',
      cls.ring || 'TBD',
      cls.judgeName || 'TBD',
      cls.scheduledTime || 'TBD',
      (cls.entries || []).length.toString(),
    ]);

    (doc as jsPDFWithAutoTable).autoTable({
      head: [['Class #', 'Class Name', 'Ring', 'Judge', 'Time', 'Entries']],
      body: scheduleRows,
      startY: yPosition,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [66, 139, 202] },
      margin: { left: 20 },
    });

    yPosition = (doc as jsPDFWithAutoTable).lastAutoTable.finalY + 15;

    // Ring assignments summary
    if (yPosition < 200) {
      doc.setFontSize(12);
      doc.text('RING ASSIGNMENTS', 20, yPosition);
      yPosition += 10;

      const ringAssignments = this.groupClassesByRing(data.classes);
      for (const [ring, classes] of Object.entries(ringAssignments)) {
        doc.setFontSize(10);
        doc.text(`Ring ${ring}: ${classes.length} classes`, 20, yPosition);
        yPosition += 5;
      }
    }

    const filename = `class-schedule-${data.show.name}-${new Date().toISOString().split('T')[0]}.pdf`;
    doc.save(filename);

    return { success: true, filename };
  }

  private async generateJudgeBookReport(
    data: ReportData,
    options: ReportOptions
  ): Promise<{ success: boolean; filename: string }> {
    const doc = new jsPDF();
    let yPosition = 20;

    // Header
    this.addReportHeader(doc, 'JUDGE BOOK', data.show, yPosition);
    yPosition += 30;

    // Judge-specific classes
    const judgeClasses = options.judgeId
      ? data.classes.filter(cls => cls.judgeId === options.judgeId)
      : data.classes;

    for (const classItem of judgeClasses) {
      if (yPosition > 200) {
        doc.addPage();
        yPosition = 20;
      }

      // Class information
      doc.setFontSize(14);
      doc.text(`CLASS ${classItem.id}: ${classItem.name}`, 20, yPosition);
      yPosition += 10;

      doc.setFontSize(10);
      doc.text(`Judge: ${classItem.judgeName}`, 20, yPosition);
      yPosition += 5;
      doc.text(`Ring: ${classItem.ringNumber} | Time: ${classItem.scheduledTime}`, 20, yPosition);
      yPosition += 5;
      doc.text(`Total Entries: ${(classItem.entries || []).length}`, 20, yPosition);
      yPosition += 15;

      // Judging sheet
      const entries = data.entries.filter(e => e.classId === classItem.id);
      if (entries.length > 0) {
        const judgingRows = entries.map((entry, index) => [
          entry.armband || (index + 1).toString(),
          data.dogs.find(d => d.id === entry.dogId)?.name || '',
          (() => {
            const person = data.people.find(p => p.id === entry.exhibitorId);
            return person ? `${person.firstName} ${person.lastName}` : '';
          })(),
          '', // Placement
          '', // Notes
        ]);

        (doc as jsPDFWithAutoTable).autoTable({
          head: [['Armband', 'Dog', 'Exhibitor', 'Placement', 'Notes']],
          body: judgingRows,
          startY: yPosition,
          styles: {
            fontSize: 8,
            cellPadding: { top: 5, bottom: 5 },
          },
          headStyles: { fillColor: [66, 139, 202] },
          columnStyles: {
            3: { minCellWidth: 20 },
            4: { minCellWidth: 30 },
          },
        });

        yPosition = (doc as jsPDFWithAutoTable).lastAutoTable.finalY + 15;
      }
    }

    const filename = `judge-book-${data.show.name}-${new Date().toISOString().split('T')[0]}.pdf`;
    doc.save(filename);

    return { success: true, filename };
  }

  private async generateResultsReport(
    data: ReportData
  ): Promise<{ success: boolean; filename: string }> {
    const doc = new jsPDF();
    let yPosition = 20;

    // Header
    this.addReportHeader(doc, 'SHOW RESULTS', data.show, yPosition);
    yPosition += 30;

    // Show information
    yPosition = this.addShowInformation(doc, data.show, yPosition);
    yPosition += 10;

    // Results by class
    for (const classItem of data.classes) {
      if (yPosition > 230) {
        doc.addPage();
        yPosition = 20;
      }

      // Class header
      doc.setFontSize(12);
      doc.text(`CLASS ${classItem.id}: ${classItem.name}`, 20, yPosition);
      yPosition += 5;

      doc.setFontSize(10);
      doc.text(`Judge: ${classItem.judgeName}`, 20, yPosition);
      yPosition += 10;

      // Results table (mock results)
      const classEntries = data.entries.filter(e => e.classId === classItem.id);
      if (classEntries.length > 0) {
        const resultRows = classEntries
          .sort((a, b) => {
            const aPlacement = typeof a.placement === 'number' ? a.placement : 999;
            const bPlacement = typeof b.placement === 'number' ? b.placement : 999;
            return aPlacement - bPlacement;
          })
          .map(entry => {
            const dog = data.dogs.find(d => d.id === entry.dogId);
            const exhibitor = data.people.find(p => p.id === entry.exhibitorId);
            return [
              entry.placement || 'NP',
              entry.armband || '',
              dog?.name || '',
              exhibitor ? `${exhibitor.firstName} ${exhibitor.lastName}` : '',
              entry.points || '0',
            ];
          });

        (doc as jsPDFWithAutoTable).autoTable({
          head: [['Place', 'Armband', 'Dog', 'Exhibitor', 'Points']],
          body: resultRows,
          startY: yPosition,
          styles: { fontSize: 8 },
          headStyles: { fillColor: [66, 139, 202] },
        });

        yPosition = (doc as jsPDFWithAutoTable).lastAutoTable.finalY + 10;
      }
    }

    const filename = `results-${data.show.name}-${new Date().toISOString().split('T')[0]}.pdf`;
    doc.save(filename);

    return { success: true, filename };
  }

  private async generateShowSummaryReport(
    data: ReportData
  ): Promise<{ success: boolean; filename: string }> {
    const doc = new jsPDF();
    let yPosition = 20;

    // Header
    this.addReportHeader(doc, 'SHOW SUMMARY', data.show, yPosition);
    yPosition += 30;

    // Show information
    yPosition = this.addShowInformation(doc, data.show, yPosition);
    yPosition += 15;

    // Summary statistics
    doc.setFontSize(14);
    doc.text('SHOW STATISTICS', 20, yPosition);
    yPosition += 15;

    const stats = this.calculateShowStatistics(data);

    doc.setFontSize(10);
    const statLines = [
      `Total Classes: ${stats.totalClasses}`,
      `Total Entries: ${stats.totalEntries}`,
      `Total Dogs: ${stats.totalDogs}`,
      `Total Exhibitors: ${stats.totalExhibitors}`,
      `Average Entries per Class: ${stats.avgEntriesPerClass}`,
      `Largest Class: ${stats.largestClass.name} (${stats.largestClass.entries} entries)`,
      `Most Popular Breed: ${stats.mostPopularBreed.name} (${stats.mostPopularBreed.count} entries)`,
    ];

    statLines.forEach(line => {
      doc.text(line, 20, yPosition);
      yPosition += 6;
    });

    yPosition += 10;

    // Breed breakdown
    doc.setFontSize(12);
    doc.text('BREED BREAKDOWN', 20, yPosition);
    yPosition += 10;

    const breedRows = Object.entries(stats.breedBreakdown)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 15) // Top 15 breeds
      .map(([breed, count]) => [breed, count.toString()]);

    (doc as jsPDFWithAutoTable).autoTable({
      head: [['Breed', 'Entries']],
      body: breedRows,
      startY: yPosition,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [66, 139, 202] },
    });

    yPosition = (doc as jsPDFWithAutoTable).lastAutoTable.finalY + 15;

    // Judge assignments
    if (yPosition < 200) {
      doc.setFontSize(12);
      doc.text('JUDGE ASSIGNMENTS', 20, yPosition);
      yPosition += 10;

      const judgeStats = this.calculateJudgeStatistics(data);
      judgeStats.forEach(judge => {
        doc.setFontSize(10);
        doc.text(
          `${judge.name}: ${judge.classes} classes, ${judge.entries} entries`,
          20,
          yPosition
        );
        yPosition += 5;
      });
    }

    const filename = `show-summary-${data.show.name}-${new Date().toISOString().split('T')[0]}.pdf`;
    doc.save(filename);

    return { success: true, filename };
  }

  private addReportHeader(doc: jsPDF, title: string, show: Show, yPosition: number): number {
    doc.setFontSize(18);
    doc.text(title, 20, yPosition);

    doc.setFontSize(14);
    doc.text(show.name, 20, yPosition + 8);

    doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 20, yPosition + 16);

    return yPosition + 20;
  }

  private addShowInformation(doc: jsPDF, show: Show, yPosition: number): number {
    doc.setFontSize(12);
    doc.text('SHOW INFORMATION', 20, yPosition);
    yPosition += 10;

    doc.setFontSize(10);
    const showInfo = [
      `Date: ${new Date(show.startDate).toLocaleDateString()}`,
      `Location: ${show.location}`,
      `Club: ${show.clubName}`,
      `Secretary: ${resolvePersonNameFromStore(show.secretary) || 'N/A'}`,
      `Organization: ${show.organization || 'AKC'}`,
    ];

    showInfo.forEach(info => {
      doc.text(info, 20, yPosition);
      yPosition += 5;
    });

    return yPosition;
  }

  private groupClassesByRing(classes: ShowClass[]): Record<string, ShowClass[]> {
    return classes.reduce(
      (acc, cls) => {
        const ring = cls.ring || 'Unassigned';
        if (!acc[ring]) {
          acc[ring] = [];
        }
        acc[ring].push(cls);
        return acc;
      },
      {} as Record<string, ShowClass[]>
    );
  }

  private calculateShowStatistics(data: ReportData) {
    const totalClasses = data.classes.length;
    const totalEntries = data.entries.length;
    const totalDogs = new Set(data.entries.map(e => e.dogId)).size;
    const totalExhibitors = new Set(data.entries.map(e => e.exhibitorId)).size;
    const avgEntriesPerClass = totalClasses > 0 ? (totalEntries / totalClasses).toFixed(1) : '0';

    // Find largest class
    const classEntryCounts = data.classes.map(cls => ({
      name: cls.className,
      entries: data.entries.filter(e => e.classId === cls.id).length,
    }));
    const largestClass = classEntryCounts.reduce(
      (max, cls) => (cls.entries > max.entries ? cls : max),
      { name: '', entries: 0 }
    );

    // Breed breakdown
    const breedBreakdown: Record<string, number> = {};
    data.entries.forEach(entry => {
      const dog = data.dogs.find(d => d.id === entry.dogId);
      if (dog?.breed) {
        breedBreakdown[dog.breed] = (breedBreakdown[dog.breed] || 0) + 1;
      }
    });

    const mostPopularBreed = Object.entries(breedBreakdown).reduce(
      (max, [breed, count]) => (count > max.count ? { name: breed, count } : max),
      { name: '', count: 0 }
    );

    return {
      totalClasses,
      totalEntries,
      totalDogs,
      totalExhibitors,
      avgEntriesPerClass,
      largestClass,
      mostPopularBreed,
      breedBreakdown,
    };
  }

  private calculateJudgeStatistics(data: ReportData) {
    const judgeStats: Record<string, { name: string; classes: number; entries: number }> = {};

    data.classes.forEach(cls => {
      const judgeName = cls.judgeName || 'Unassigned';
      if (!judgeStats[judgeName]) {
        judgeStats[judgeName] = { name: judgeName, classes: 0, entries: 0 };
      }
      judgeStats[judgeName].classes++;
      judgeStats[judgeName].entries += data.entries.filter(e => e.classId === cls.id).length;
    });

    return Object.values(judgeStats).sort((a, b) => b.classes - a.classes);
  }
}

export const offlineReportService = new OfflineReportService();
