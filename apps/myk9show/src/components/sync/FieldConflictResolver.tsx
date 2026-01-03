import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertTriangle,
  Check,
  Copy,
  Edit3,
  GitBranch,
  Info,
  RotateCcw,
  User,
  Wand2,
} from 'lucide-react';
// import { cn } from '@/lib/utils';

interface FieldConflictResolverProps {
  fieldName: string;
  localValue: unknown;
  remoteValue: unknown;
  fieldType?: 'string' | 'number' | 'boolean' | 'date' | 'object' | 'array';
  onResolve: (resolvedValue: unknown) => void;
  onCancel?: () => void;
  suggestions?: Array<{
    value: unknown;
    label: string;
    confidence: number;
    reason: string;
  }>;
}

type ResolutionMode = 'select' | 'edit' | 'suggest';

export const FieldConflictResolver: React.FC<FieldConflictResolverProps> = ({
  fieldName,
  localValue,
  remoteValue,
  fieldType = 'string',
  onResolve,
  onCancel,
  suggestions = [],
}) => {
  const [mode, setMode] = useState<ResolutionMode>('select');
  const [customValue, setCustomValue] = useState<string>('');
  const [selectedValue, setSelectedValue] = useState<'local' | 'remote' | 'custom'>('local');
  const [error, setError] = useState<string | null>(null);

  // Initialize custom value based on field type
  React.useEffect(() => {
    if (mode === 'edit') {
      setCustomValue(formatValueForEditing(localValue));
    }
  }, [mode, localValue]);

  const formatValue = (value: unknown): string => {
    if (value === null || value === undefined) return 'Not set';
    if (typeof value === 'object') return JSON.stringify(value, null, 2);
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (value instanceof Date) return value.toLocaleString();
    return String(value);
  };

  const formatValueForEditing = (value: unknown): string => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'object') return JSON.stringify(value, null, 2);
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (value instanceof Date) return value.toISOString().split('T')[0]; // Date format for input
    return String(value);
  };

  const parseCustomValue = (rawValue: string): unknown => {
    if (!rawValue) return null;

    try {
      switch (fieldType) {
        case 'number': {
          const num = parseFloat(rawValue);
          if (isNaN(num)) throw new Error('Invalid number');
          return num;
        }
        
        case 'boolean':
          return rawValue.toLowerCase() === 'true' || rawValue === '1';
        
        case 'date':
          return new Date(rawValue);
        
        case 'object':
        case 'array':
          return JSON.parse(rawValue);
        
        default:
          return rawValue;
      }
    } catch (err) {
      console.error('Parse error:', err);
      throw new Error(`Invalid ${fieldType} format`);
    }
  };

  const getFieldDisplayName = (): string => {
    return fieldName.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
  };

  const handleResolve = () => {
    setError(null);

    try {
      let resolvedValue: unknown;

      if (selectedValue === 'local') {
        resolvedValue = localValue;
      } else if (selectedValue === 'remote') {
        resolvedValue = remoteValue;
      } else {
        resolvedValue = parseCustomValue(customValue);
      }

      onResolve(resolvedValue);
    } catch (_err) {
      setError(_err instanceof Error ? _err.message : 'Invalid value format');
    }
  };

  const copyToCustom = (source: 'local' | 'remote') => {
    const sourceValue = source === 'local' ? localValue : remoteValue;
    setCustomValue(formatValueForEditing(sourceValue));
    setSelectedValue('custom');
    setMode('edit');
  };

  const applySuggestion = (suggestionValue: unknown) => {
    setCustomValue(formatValueForEditing(suggestionValue));
    setSelectedValue('custom');
    setMode('edit');
  };

  const renderValueComparison = () => (
    <div className="grid grid-cols-2 gap-4">
      {/* Local Value */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">Local Value</span>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant={selectedValue === 'local' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedValue('local')}
              className="h-7 px-2 text-xs"
            >
              {selectedValue === 'local' && <Check className="h-3 w-3 mr-1" />}
              Use This
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => copyToCustom('local')}
              className="h-7 px-1"
            >
              <Copy className="h-3 w-3" />
            </Button>
          </div>
        </div>
        <div className="bg-background border rounded-md p-3 text-sm font-mono max-h-24 overflow-auto">
          <pre className="whitespace-pre-wrap">
            {formatValue(localValue)}
          </pre>
        </div>
      </div>

      {/* Remote Value */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <GitBranch className="h-4 w-4 text-secondary" />
            <span className="text-sm font-medium">Remote Value</span>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant={selectedValue === 'remote' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedValue('remote')}
              className="h-7 px-2 text-xs"
            >
              {selectedValue === 'remote' && <Check className="h-3 w-3 mr-1" />}
              Use This
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => copyToCustom('remote')}
              className="h-7 px-1"
            >
              <Copy className="h-3 w-3" />
            </Button>
          </div>
        </div>
        <div className="bg-background border rounded-md p-3 text-sm font-mono max-h-24 overflow-auto">
          <pre className="whitespace-pre-wrap">
            {formatValue(remoteValue)}
          </pre>
        </div>
      </div>
    </div>
  );

  const renderCustomEditor = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label htmlFor="custom-value" className="text-sm font-medium">
          Custom Value ({fieldType})
        </Label>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setMode('select')}
          >
            <RotateCcw className="h-4 w-4 mr-1" />
            Back to Selection
          </Button>
        </div>
      </div>

      {fieldType === 'object' || fieldType === 'array' || 
       (typeof localValue === 'object' && localValue !== null) ? (
        <Textarea
          id="custom-value"
          value={customValue}
          onChange={(e) => setCustomValue(e.target.value)}
          placeholder={`Enter ${fieldType} as JSON...`}
          className="font-mono text-sm min-h-[120px]"
        />
      ) : (
        <Input
          id="custom-value"
          type={fieldType === 'number' ? 'number' : fieldType === 'date' ? 'date' : 'text'}
          value={customValue}
          onChange={(e) => setCustomValue(e.target.value)}
          placeholder={`Enter custom ${fieldType}...`}
          className={fieldType !== 'string' ? 'font-mono' : ''}
        />
      )}

      {fieldType === 'boolean' && (
        <Select value={customValue} onValueChange={setCustomValue}>
          <SelectTrigger>
            <SelectValue placeholder="Select boolean value" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="true">True</SelectItem>
            <SelectItem value="false">False</SelectItem>
          </SelectContent>
        </Select>
      )}
    </div>
  );

  const renderSuggestions = () => (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Wand2 className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium">Smart Suggestions</span>
        <Badge variant="outline" className="text-xs">
          {suggestions.length} available
        </Badge>
      </div>

      {suggestions.length > 0 ? (
        <div className="space-y-2">
          {suggestions.map((suggestion, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.1 }}
              className="border rounded-lg p-3 hover:bg-muted/50 cursor-pointer"
              onClick={() => applySuggestion(suggestion.value)}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-xs">
                    {Math.round(suggestion.confidence)}% confidence
                  </Badge>
                  <span className="text-sm font-medium">{suggestion.label}</span>
                </div>
                <Button variant="ghost" size="sm" className="h-6 px-2">
                  Apply
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mb-2">
                {suggestion.reason}
              </p>
              <div className="bg-background/50 border rounded p-2 text-xs font-mono">
                {formatValue(suggestion.value)}
              </div>
            </motion.div>
          ))}
        </div>
      ) : (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            No smart suggestions available for this field type.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-warning" />
          <h3 className="text-lg font-semibold">Resolve Field Conflict</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          Field "{getFieldDisplayName()}" has conflicting values. Choose how to resolve this conflict.
        </p>
      </div>

      {/* Mode Selection */}
      <div className="flex items-center gap-2">
        <Button
          variant={mode === 'select' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setMode('select')}
        >
          Select Version
        </Button>
        <Button
          variant={mode === 'edit' ? 'default' : 'outline'}
          size="sm"
          onClick={() => {
            setMode('edit');
            setSelectedValue('custom');
          }}
        >
          <Edit3 className="h-4 w-4 mr-1" />
          Custom Edit
        </Button>
        {suggestions.length > 0 && (
          <Button
            variant={mode === 'suggest' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setMode('suggest')}
          >
            <Wand2 className="h-4 w-4 mr-1" />
            Suggestions
          </Button>
        )}
      </div>

      <Separator />

      {/* Content based on mode */}
      <AnimatePresence mode="wait">
        <motion.div
          key={mode}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
        >
          {mode === 'select' && renderValueComparison()}
          {mode === 'edit' && renderCustomEditor()}
          {mode === 'suggest' && renderSuggestions()}
        </motion.div>
      </AnimatePresence>

      {/* Error Display */}
      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Preview of Selected Value */}
      {selectedValue === 'custom' && customValue && (
        <div className="space-y-2">
          <Label className="text-sm font-medium">Preview</Label>
          <div className="bg-muted/50 border rounded-md p-3 text-sm">
            <pre className="whitespace-pre-wrap">
              {formatValue((() => {
                try {
                  return parseCustomValue(customValue);
                } catch {
                  return 'Invalid format';
                }
              })())}
            </pre>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between pt-4 border-t">
        <div className="text-sm text-muted-foreground">
          {selectedValue === 'local' && 'Using local value'}
          {selectedValue === 'remote' && 'Using remote value'}
          {selectedValue === 'custom' && 'Using custom value'}
        </div>
        
        <div className="flex items-center gap-2">
          {onCancel && (
            <Button variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button
            onClick={handleResolve}
            disabled={selectedValue === 'custom' && !customValue}
            className="bg-gradient-to-r from-primary to-secondary"
          >
            <Check className="h-4 w-4 mr-2" />
            Resolve Field
          </Button>
        </div>
      </div>
    </div>
  );
};