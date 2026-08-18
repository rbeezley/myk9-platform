import { Button } from '@/components/ui/button';
import { Columns3 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
} from '@/components/ui/dropdown-menu';
import { useDataTableContext } from './data-table-toolbar';

/**
 * This was hand-rolled: `useState` plus `absolute top-full`, which pins the
 * popup below its trigger unconditionally. On a table whose toolbar sits low in
 * a short viewport, the list rendered off the bottom of the screen with no way
 * to reach the columns near the end of it — the same defect measured on
 * /club-admin/members, where 553px of a menu fell below the fold.
 *
 * DropdownMenu portals to the body, flips on collision, and bounds itself to
 * --available-height. It also replaces ~30 lines of click-outside listener,
 * focus-on-open effect, and Escape handler with the primitive's own behaviour,
 * and upgrades the rows from `<label tabIndex={0}>` inside a `role="menu"` —
 * which promised a keyboard contract it did not implement — to real
 * `role="menuitemcheckbox"` items.
 */
export function DataTableColumnToggle() {
  const table = useDataTableContext<unknown>();
  const toggleableColumns = table.getAllColumns().filter(col => col.getCanHide());

  return (
    <div className="ml-auto">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 text-xs" aria-label="Toggle columns">
            <Columns3 className="h-3.5 w-3.5 mr-1" />
            Columns
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" aria-label="Toggle column visibility" className="w-48">
          {toggleableColumns.map(column => (
            <DropdownMenuCheckboxItem
              key={column.id}
              checked={column.getIsVisible()}
              onCheckedChange={() => column.toggleVisibility()}
              // Keep the menu open so several columns can be toggled in one
              // pass — the hand-rolled version behaved this way and losing it
              // would make hiding four columns a four-trip job.
              closeOnClick={false}
              className="min-h-11"
            >
              {typeof column.columnDef.header === 'string' ? column.columnDef.header : column.id}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
