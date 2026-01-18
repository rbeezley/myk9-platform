import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { X, MoreHorizontal } from 'lucide-react';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import { BulkAction } from '@/utils/bulkActions';

interface BulkActionsBarProps {
  selectedCount: number;
  onClearSelection: () => void;
  actions: BulkAction[];
  entityName: string;
  className?: string;
}

export function BulkActionsBar({
  selectedCount,
  onClearSelection,
  actions,
  entityName,
  className,
}: BulkActionsBarProps) {
  if (selectedCount === 0) return null;

  const primaryActions = actions.slice(0, 3);
  const secondaryActions = actions.slice(3);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -50 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -50 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className={`
          fixed top-20 left-1/2 transform -translate-x-1/2 z-50 
          bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 
          rounded-lg shadow-lg px-4 py-3 flex items-center space-x-4
          ${className}
        `}
      >
        {/* Selection info */}
        <div className="flex items-center space-x-2">
          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
            {selectedCount} {entityName}{selectedCount === 1 ? '' : 's'} selected
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearSelection}
            className="h-6 w-6 p-0"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Divider */}
        <div className="h-6 w-px bg-gray-200 dark:bg-gray-700" />

        {/* Primary actions */}
        <div className="flex items-center space-x-2">
          {primaryActions.map((action) => (
            <Button
              key={action.id}
              variant={action.variant || 'secondary'}
              size="sm"
              onClick={action.onClick}
              disabled={action.disabled}
              className="h-8"
            >
              {action.icon}
              <span className="ml-1 hidden sm:inline">{action.label}</span>
            </Button>
          ))}

          {/* More actions dropdown */}
          {secondaryActions.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" size="sm" className="h-8">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {secondaryActions.map((action) => (
                  <DropdownMenuItem
                    key={action.id}
                    onClick={action.onClick}
                    {...(action.disabled !== undefined && { disabled: action.disabled })}
                    className="flex items-center"
                  >
                    {action.icon}
                    <span className="ml-2">{action.label}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

// Bulk action utilities moved to separate file to avoid Fast Refresh issues

// Checkbox component for table headers
interface BulkSelectCheckboxProps {
  checked: boolean;
  indeterminate?: boolean;
  onCheckedChange: (checked: boolean) => void;
  'aria-label'?: string;
}

export function BulkSelectCheckbox({
  checked,
  indeterminate,
  onCheckedChange,
  'aria-label': ariaLabel,
}: BulkSelectCheckboxProps) {
  return (
    <input
      type="checkbox"
      checked={checked}
      ref={(el) => {
        if (el) el.indeterminate = indeterminate ?? false;
      }}
      onChange={(e) => onCheckedChange(e.target.checked)}
      aria-label={ariaLabel}
      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700"
    />
  );
}

// Row checkbox component
interface BulkSelectRowProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  'aria-label'?: string;
}

export function BulkSelectRow({
  checked,
  onCheckedChange,
  'aria-label': ariaLabel,
}: BulkSelectRowProps) {
  return (
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onCheckedChange(e.target.checked)}
      aria-label={ariaLabel}
      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700"
    />
  );
}