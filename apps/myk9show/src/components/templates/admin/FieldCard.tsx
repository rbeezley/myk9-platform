import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EyeOff, Settings, Lock } from 'lucide-react';
import type { FieldCardProps } from './FieldConfigurator.types';

export const FieldCard: React.FC<FieldCardProps> = ({
  field,
  isConfigured,
  config,
  readOnly,
  onToggle,
  onConfigure,
}) => {
  return (
    <div
      key={field.id}
      className={`relative p-4 rounded-lg border transition-all cursor-pointer ${
        isConfigured ? 'border-blue-500 bg-info/10 ' : 'border-gray-200 hover:border-gray-300'
      }`}
      onClick={() => onToggle(field)}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1">
          <h4 className="font-medium">{field.displayName}</h4>
          {field.description && (
            <p className="text-sm text-muted-foreground mt-1">{field.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2 ml-4">
          {isConfigured && (
            <>
              {config?.required && (
                <Badge variant="destructive" className="text-xs">
                  Required
                </Badge>
              )}
              {!config?.visible && <EyeOff className="h-4 w-4 text-muted-foreground" />}
              {!config?.editable && <Lock className="h-4 w-4 text-muted-foreground" />}
            </>
          )}
          <div
            className={`w-5 h-5 rounded border-2 transition-colors ${
              isConfigured ? 'bg-blue-500 border-blue-500' : 'border-gray-300'
            }`}
          >
            {isConfigured && (
              <svg className="w-3 h-3 text-white m-auto" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                  clipRule="evenodd"
                />
              </svg>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 mt-3">
        <Badge variant="outline" className="text-xs">
          {field.dataType}
        </Badge>
        {field.unit && (
          <Badge variant="outline" className="text-xs">
            {field.unit}
          </Badge>
        )}
        {isConfigured && !readOnly && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 ml-auto"
            onClick={e => {
              e.stopPropagation();
              onConfigure(field);
            }}
          >
            <Settings className="h-3 w-3 mr-1" />
            Configure
          </Button>
        )}
      </div>
    </div>
  );
};
