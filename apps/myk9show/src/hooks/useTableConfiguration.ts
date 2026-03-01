/**
 * Hook for managing table configuration based on show type and template
 */

import { useMemo } from 'react';
import { TrialType, ClassTemplate } from '@/types/template.types';
import { TableColumnConfiguration, TableColumn } from '@/types/table-column-types';
import {
  createTableConfigurationFromTemplate,
  createDefaultTableConfiguration,
  transformEntryForTable,
  formatColumnValue,
  getColumnValueClassName,
  getAvailableColumns,
} from '@/lib/tableColumnConfig';
import { UnifiedEntryData } from '@/types/unified-entry-types';

export interface UseTableConfigurationProps {
  trialType: TrialType;
  template?: ClassTemplate | undefined;
  customColumns?: string[] | undefined;
}

export interface UseTableConfigurationReturn {
  /** Complete table configuration */
  config: TableColumnConfiguration;
  /** Column definitions to display */
  columns: TableColumn[];
  /** Transform entry data for table display */
  transformEntry: (entry: UnifiedEntryData) => Record<string, unknown>;
  /** Format a specific column value */
  formatValue: (value: unknown, columnId: string) => string;
  /** Get CSS classes for a column value */
  getValueClassName: (value: unknown, columnId: string) => string;
}

/**
 * Hook to get table configuration for entry tables
 */
export function useTableConfiguration({
  trialType,
  template,
  customColumns,
}: UseTableConfigurationProps): UseTableConfigurationReturn {
  const config = useMemo(() => {
    if (template) {
      // Use template-specific configuration
      const templateColumns = template.tableColumnConfig?.customColumns || customColumns;
      return createTableConfigurationFromTemplate(template, templateColumns);
    } else {
      // Use default configuration for show type
      return createDefaultTableConfiguration(trialType);
    }
  }, [trialType, template, customColumns]);

  const columns = useMemo(() => {
    if (template?.tableColumnConfig) {
      let selectedColumns = config.columns;

      // Apply hidden columns
      if (template.tableColumnConfig.hiddenColumns) {
        selectedColumns = selectedColumns.filter(
          col => !template.tableColumnConfig!.hiddenColumns!.includes(col.id)
        );
      }

      // Apply custom ordering
      if (template.tableColumnConfig.columnOrder) {
        const orderMap = new Map(
          template.tableColumnConfig.columnOrder.map((id, index) => [id, index])
        );
        selectedColumns.sort((a, b) => {
          const orderA = orderMap.get(a.id) ?? 999;
          const orderB = orderMap.get(b.id) ?? 999;
          return orderA - orderB;
        });
      }

      return selectedColumns;
    }

    return config.columns;
  }, [config, template]);

  const transformEntry = useMemo(() => {
    return (entry: UnifiedEntryData) => {
      return transformEntryForTable(entry, columns, config.trialTypeConfig.formatRules);
    };
  }, [columns, config.trialTypeConfig.formatRules]);

  const formatValue = useMemo(() => {
    return (value: unknown, columnId: string) => {
      const column = columns.find(col => col.id === columnId);
      if (!column) return String(value || '--');

      return formatColumnValue(value, column, config.trialTypeConfig.formatRules);
    };
  }, [columns, config.trialTypeConfig.formatRules]);

  const getValueClassName = useMemo(() => {
    return (value: unknown, columnId: string) => {
      const column = columns.find(col => col.id === columnId);
      if (!column) return '';

      return getColumnValueClassName(column, value);
    };
  }, [columns]);

  return {
    config,
    columns,
    transformEntry,
    formatValue,
    getValueClassName,
  };
}

/**
 * Hook to get available columns for a show type (for configuration UI)
 */
export function useAvailableColumns(trialType: TrialType): TableColumn[] {
  return useMemo(() => {
    return getAvailableColumns(trialType);
  }, [trialType]);
}

/**
 * Hook to get default column configuration for a show type
 */
export function useDefaultTableConfiguration(trialType: TrialType): TableColumnConfiguration {
  return useMemo(() => {
    return createDefaultTableConfiguration(trialType);
  }, [trialType]);
}
