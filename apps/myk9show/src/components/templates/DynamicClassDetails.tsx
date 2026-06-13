import React from 'react';
import { ClassTemplate } from '@/types/template.types';
import {
  TemplateFieldConfiguration,
  FieldDefinition,
  ClassFieldValues,
  FieldDataType,
} from '@/types/field-definition-types';
import { getConfiguredFieldsWithDefinitions, groupFieldsByCategory } from '@/lib/fieldUtils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Calendar,
  Clock,
  DollarSign,
  User,
  Settings,
  AlertCircle,
  CheckCircle,
  EyeOff,
} from 'lucide-react';

interface DynamicClassDetailsProps {
  template: ClassTemplate;
  values: ClassFieldValues;
  showEmptyFields?: boolean;
  className?: string;
}

export const DynamicClassDetails: React.FC<DynamicClassDetailsProps> = ({
  template,
  values,
  showEmptyFields = false,
  className = '',
}) => {
  // Get configured fields with definitions
  const configuredFields = getConfiguredFieldsWithDefinitions(template);
  const visibleFields = configuredFields.filter(field => field.visible);

  // Filter fields based on whether to show empty values
  const fieldsToShow = showEmptyFields
    ? visibleFields
    : visibleFields.filter(field => {
        const value = values[field.fieldName];
        return value !== undefined && value !== null && value !== '';
      });

  // Format field value for display
  const formatFieldValue = (
    field: FieldDefinition & TemplateFieldConfiguration,
    value: unknown
  ): string => {
    if (value === undefined || value === null || value === '') {
      return showEmptyFields ? '—' : '';
    }

    switch (field.dataType) {
      case FieldDataType.BOOLEAN: {
        return value ? 'Yes' : 'No';
      }

      case FieldDataType.CURRENCY: {
        const numValue = Number(value);
        return isNaN(numValue) ? String(value) : `$${numValue.toFixed(2)}`;
      }

      case FieldDataType.DATE: {
        try {
          const date = new Date(value as string | number | Date);
          return date.toLocaleDateString();
        } catch {
          return String(value);
        }
      }

      case FieldDataType.TIME: {
        return String(value);
      }

      case FieldDataType.DATETIME: {
        try {
          const date = new Date(value as string | number | Date);
          return date.toLocaleString();
        } catch {
          return String(value);
        }
      }

      case FieldDataType.MULTI_SELECT: {
        if (Array.isArray(value)) {
          return value.join(', ');
        }
        return String(value);
      }

      case FieldDataType.NUMBER: {
        const unit = field.unit ? ` ${field.unit}` : '';
        return `${value}${unit}`;
      }

      case FieldDataType.DURATION: {
        // Format duration from seconds or MM:SS string
        if (typeof value === 'number') {
          const minutes = Math.floor(value / 60);
          const seconds = value % 60;
          return `${minutes}:${seconds.toString().padStart(2, '0')}`;
        }
        return String(value);
      }

      default: {
        return String(value);
      }
    }
  };

  // Get field icon based on category
  const getFieldIcon = (field: FieldDefinition & TemplateFieldConfiguration) => {
    switch (field.category) {
      case 'scheduling': {
        return field.fieldName.includes('time') ? (
          <Clock className="h-4 w-4" />
        ) : (
          <Calendar className="h-4 w-4" />
        );
      }
      case 'financial': {
        return <DollarSign className="h-4 w-4" />;
      }
      case 'personnel': {
        return <User className="h-4 w-4" />;
      }
      case 'competition': {
        return <Settings className="h-4 w-4" />;
      }
      default: {
        return null;
      }
    }
  };

  // Render field display
  const renderField = (field: FieldDefinition & TemplateFieldConfiguration) => {
    const value = values[field.fieldName];
    const formattedValue = formatFieldValue(field, value);
    const icon = getFieldIcon(field);

    if (!showEmptyFields && !formattedValue) {
      return null;
    }

    return (
      <div key={field.fieldName} className="space-y-1">
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-sm font-medium text-muted-foreground">{field.displayName}</span>
          {field.required && (
            <Badge variant="destructive" className="text-xs h-4">
              Required
            </Badge>
          )}
          {!field.editable && (
            <Badge variant="outline" className="text-xs h-4">
              Read-only
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`text-sm ${formattedValue === '—' ? 'text-muted-foreground italic' : ''}`}
          >
            {formattedValue || '—'}
          </span>
          {field.unit && formattedValue !== '—' && (
            <Badge variant="outline" className="text-xs">
              {field.unit}
            </Badge>
          )}
        </div>

        {field.description && <p className="text-xs text-muted-foreground">{field.description}</p>}
      </div>
    );
  };

  // Group fields by category
  const groupedFields = groupFieldsByCategory(fieldsToShow);

  // Show message if no fields configured
  if (fieldsToShow.length === 0 && !showEmptyFields) {
    return (
      <Alert>
        <EyeOff className="h-4 w-4" />
        <AlertDescription>
          No field values to display.{' '}
          {configuredFields.length > 0
            ? 'All configured fields are empty.'
            : 'No fields have been configured for this template.'}
        </AlertDescription>
      </Alert>
    );
  }

  if (configuredFields.length === 0) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>No fields have been configured for this template.</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Details Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Class Details</h3>
          <p className="text-sm text-muted-foreground">
            {template.templateName} - {template.trialType}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">
            {fieldsToShow.length} of {configuredFields.length} fields
          </Badge>
          {!showEmptyFields && fieldsToShow.length < configuredFields.length && (
            <Badge variant="secondary" className="text-xs">
              Hiding empty fields
            </Badge>
          )}
        </div>
      </div>

      {/* Class Summary Card */}
      {values.className && (
        <Card className="border-blue-200 bg-info/10 ">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle className="h-5 w-5 text-blue-600" />
              <h4 className="font-semibold text-info ">{String(values.className)}</h4>
            </div>
            <div className="flex flex-wrap gap-2">
              {values.element && <Badge variant="outline">{String(values.element)}</Badge>}
              {values.level && <Badge variant="outline">{String(values.level)}</Badge>}
              {values.section && <Badge variant="outline">Section {String(values.section)}</Badge>}
              {values.division && values.division !== 'Regular' && (
                <Badge variant="outline">{String(values.division)}</Badge>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Field Details by Category */}
      <div className="space-y-6">
        {Object.entries(groupedFields).map(([categoryName, categoryFields]) => {
          // Skip empty categories when not showing empty fields
          if (!showEmptyFields && categoryFields.length === 0) {
            return null;
          }

          return (
            <Card key={categoryName}>
              <CardHeader>
                <CardTitle className="text-base flex items-center justify-between">
                  <span>{categoryName}</span>
                  <Badge variant="outline" className="text-xs">
                    {categoryFields.length} field{categoryFields.length !== 1 ? 's' : ''}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {categoryFields
                    .sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0))
                    .map(field => renderField(field))
                    .filter(Boolean)}
                </div>

                {!showEmptyFields && categoryFields.length === 0 && (
                  <div className="text-center py-4 text-muted-foreground text-sm">
                    No values in this category
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Show Empty Fields Toggle Hint */}
      {!showEmptyFields && fieldsToShow.length < configuredFields.length && (
        <div className="text-center py-4">
          <p className="text-sm text-muted-foreground">
            {configuredFields.length - fieldsToShow.length} empty field
            {configuredFields.length - fieldsToShow.length !== 1 ? 's' : ''} hidden.
          </p>
        </div>
      )}
    </div>
  );
};
