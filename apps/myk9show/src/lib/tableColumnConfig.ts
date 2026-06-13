/**
 * Table Column Configuration Utility
 * Manages column configurations for entry tables based on show type and template settings
 */

import {
  TableColumn,
  TrialTypeColumnConfig,
  TableColumnConfiguration,
  STANDARD_COLUMNS,
  SHOW_TYPE_COLUMN_CONFIGS,
} from '@/types/table-column-types';
import { TrialType, ClassTemplate } from '@/types/template.types';

/**
 * Get column configuration for a show type
 */
export function getTrialTypeColumnConfig(trialType: TrialType): TrialTypeColumnConfig {
  const config = SHOW_TYPE_COLUMN_CONFIGS.find(c => c.trialType === trialType);
  if (!config) {
    // Return a default configuration if not found
    return {
      trialType,
      requiredColumns: ['armband', 'handler', 'dog', 'status'],
      defaultColumns: ['armband', 'handler', 'dog', 'status', 'placement'],
      availableColumns: [
        'armband',
        'handler',
        'dog',
        'status',
        'score',
        'time',
        'placement',
        'notes',
      ],
      formatRules: {
        timeFormat: 'MM:SS',
        scoreFormat: 'points',
        placementFormat: 'ordinal',
      },
    };
  }
  return config;
}

/**
 * Get available columns for a show type
 */
export function getAvailableColumns(trialType: TrialType): TableColumn[] {
  return STANDARD_COLUMNS.filter(column => column.trialTypes.includes(trialType));
}

/**
 * Get default visible columns for a show type
 */
export function getDefaultColumns(trialType: TrialType): TableColumn[] {
  const config = getTrialTypeColumnConfig(trialType);
  const availableColumns = getAvailableColumns(trialType);

  return availableColumns
    .filter(column => config.defaultColumns.includes(column.id))
    .sort((a, b) => a.displayOrder - b.displayOrder);
}

/**
 * Get required columns for a show type (cannot be hidden)
 */
export function getRequiredColumns(trialType: TrialType): TableColumn[] {
  const config = getTrialTypeColumnConfig(trialType);
  const availableColumns = getAvailableColumns(trialType);

  return availableColumns
    .filter(column => config.requiredColumns.includes(column.id))
    .sort((a, b) => a.displayOrder - b.displayOrder);
}

/**
 * Create a complete table configuration from template and show type
 */
export function createTableConfigurationFromTemplate(
  template: ClassTemplate,
  customColumns?: string[]
): TableColumnConfiguration {
  const trialType = template.trialType;
  const config = getTrialTypeColumnConfig(trialType);
  const availableColumns = getAvailableColumns(trialType);

  // Determine which columns to show
  const columnsToShow = customColumns || config.defaultColumns;

  // Get the actual column definitions
  const selectedColumns = availableColumns
    .filter(column => columnsToShow.includes(column.id))
    .sort((a, b) => a.displayOrder - b.displayOrder);

  // Ensure required columns are always included
  const requiredColumns = getRequiredColumns(trialType);
  const finalColumns = [...requiredColumns];

  // Add non-required selected columns
  selectedColumns.forEach(column => {
    if (!requiredColumns.find(req => req.id === column.id)) {
      finalColumns.push(column);
    }
  });

  // Sort by display order
  finalColumns.sort((a, b) => a.displayOrder - b.displayOrder);

  return {
    name: `${template.organization}_${template.trialType}_${template.version}`,
    trialType: template.trialType,
    organization: template.organization,
    columns: finalColumns,
    trialTypeConfig: config,
    isDefault: template.isOfficial,
    templateId: template.id,
    version: template.version,
  };
}

/**
 * Create a table configuration for a show type without a specific template
 */
export function createDefaultTableConfiguration(trialType: TrialType): TableColumnConfiguration {
  const config = getTrialTypeColumnConfig(trialType);
  const columns = getDefaultColumns(trialType);

  return {
    name: `default_${trialType}`,
    trialType,
    columns,
    trialTypeConfig: config,
    isDefault: true,
    version: '1.0.0',
  };
}

/**
 * Format a value according to the column configuration
 */
export function formatColumnValue(
  value: unknown,
  column: TableColumn,
  formatRules?: TrialTypeColumnConfig['formatRules']
): string {
  if (value === null || value === undefined || value === '') {
    return '--';
  }

  // Use custom format function if provided
  if (column.format && typeof column.format === 'function') {
    return column.format(value);
  }

  // Use format string if provided
  if (column.format && typeof column.format === 'string') {
    return column.format.replace('{value}', String(value));
  }

  // Apply data type specific formatting
  switch (column.dataType) {
    case 'armband':
      return value ? `#${value}` : '';

    case 'time': {
      const timeStr = String(value || '');
      if (formatRules?.timeFormat === 'MM:SS.HH') {
        // Expected format is already MM:SS.HH
        return timeStr;
      } else {
        // Remove hundredths if format is MM:SS
        return timeStr.replace(/\\.\\d{2}$/, '');
      }
    }

    case 'score':
      if (formatRules?.scoreFormat === 'points') {
        return `${value} pts`;
      } else if (formatRules?.scoreFormat === 'percentage') {
        return `${value}%`;
      }
      return value.toString();

    case 'placement':
      if (formatRules?.placementFormat === 'ordinal') {
        const num = parseInt(String(value || ''));
        if (isNaN(num)) return '--';
        const suffix = ['th', 'st', 'nd', 'rd'];
        const mod = num % 100;
        return num + (suffix[(mod - 20) % 10] || suffix[mod] || suffix[0]);
      }
      return value.toString();

    case 'status':
      return value.toString();

    case 'number':
      return value.toString();

    case 'boolean':
      return value ? 'Yes' : 'No';

    default:
      return value.toString();
  }
}

/**
 * Get CSS classes for a column value
 */
export function getColumnValueClassName(column: TableColumn, value: unknown): string {
  const baseClasses = column.className || '';

  // Add data type specific classes
  switch (column.dataType) {
    case 'status':
      return `${baseClasses} ${getStatusClassName(String(value || ''))}`;
    case 'placement':
      return `${baseClasses} ${getPlacementClassName(String(value || ''))}`;
    default:
      return baseClasses;
  }
}

/**
 * Get status-specific CSS classes
 */
function getStatusClassName(status: string): string {
  switch (status?.toLowerCase()) {
    case 'qualified':
      return 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200';
    case 'not qualified':
    case 'nq':
      return 'bg-destructive/10 text-destructive ';
    case 'absent':
      return 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200';
    case 'withdrawn':
    case 'excused':
      return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200';
    default:
      return 'bg-info/10 text-info ';
  }
}

/**
 * Get placement-specific CSS classes
 */
function getPlacementClassName(placement: string): string {
  if (placement === '1') return 'text-yellow-600 font-bold';
  if (placement === '2') return 'text-gray-500 font-bold';
  if (placement === '3') return 'text-amber-600 font-bold';
  return 'text-muted-foreground';
}

/**
 * Extract field value from entry object based on field source
 */
export function extractFieldValue(entry: unknown, column: TableColumn): unknown {
  const entryData = entry as Record<string, unknown>;

  switch (column.fieldSource) {
    case 'registration':
      return (
        (entryData.registrationData as Record<string, unknown>)?.[column.fieldName] ||
        entryData[column.fieldName]
      );

    case 'competition':
      return (
        (entryData.competitionData as Record<string, unknown>)?.[column.fieldName] ||
        entryData[column.fieldName]
      );

    case 'calculated':
      // For calculated fields, we might need special logic
      if (
        column.fieldName === 'qualification' &&
        !(entryData.competitionData as Record<string, unknown>)?.qualification
      ) {
        // Calculate qualification from qualified boolean
        const competitionData = entryData.competitionData as Record<string, unknown>;
        return competitionData?.qualified === true
          ? 'Qualified'
          : competitionData?.qualified === false
            ? 'Not Qualified'
            : '';
      }
      return entryData[column.fieldName];

    case 'display':
    default:
      return entryData[column.fieldName];
  }
}

/**
 * Transform entry data to match column configuration
 */
export function transformEntryForTable(
  entry: unknown,
  columns: TableColumn[],
  formatRules?: TrialTypeColumnConfig['formatRules']
): Record<string, unknown> {
  const transformed: Record<string, unknown> = { ...(entry as Record<string, unknown>) };

  columns.forEach(column => {
    const rawValue = extractFieldValue(entry, column);
    transformed[column.id] = {
      raw: rawValue,
      formatted: formatColumnValue(rawValue, column, formatRules),
      className: getColumnValueClassName(column, rawValue),
    };
  });

  return transformed;
}
