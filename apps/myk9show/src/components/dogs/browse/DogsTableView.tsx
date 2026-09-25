import React, { createContext, useContext, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { type ColumnDef, type DisplayColumnDef } from '@tanstack/react-table';
import { getDogDisplayName, getDogBreedLabel, type Dog, type DogStatus } from '@/types/dog-types';
import { DataTable, type DataTableColumnMeta } from '@/components/ui/data-table';

/** Minimal selection surface (a subset of `useBulkSelection`) for the select column —
 * mirrors `EntriesTableSelection` (design.md decision D2: DataTable opt-in bridged
 * to the shared selection hook rather than DataTable's own uncontrolled selection
 * state, so the bulk bar contract is identical across surfaces). */
export interface DogsTableSelection {
  isSelected: (dog: Dog) => boolean;
  toggleItem: (dog: Dog) => void;
  isAllSelected: boolean;
  isPartiallySelected: boolean;
  toggleAll: () => void;
}

interface DogsTableViewProps {
  dogs: Dog[];
  /** When provided, renders a leading checkbox select column wired to this selection. */
  selection?: DogsTableSelection | undefined;
  /**
   * Whether the Owner column earns its width on this surface. False when the
   * roster is scoped to dogs the viewer owns, where the column is their own
   * name on every row — the same rule the card view applies (MYK9-219), and it
   * has to be applied here too because the roles that roster covers (judge,
   * steward, chairman) land on the TABLE by default, not on cards.
   */
  showOwner?: boolean;
}

/**
 * The live selection for the select column's checkboxes. The column itself is
 * defined once at module level and reads the selection from here, so its
 * header and cell functions keep their identity across renders: rebuilding
 * them whenever the page re-rendered (`useBulkSelection` returns a new object
 * each time) made TanStack's `flexRender` see a new component type and
 * remount every checkbox, dropping keyboard focus and briefly detaching the
 * header checkbox mid-measurement in Playwright Regression (MYK9-751).
 */
const DogsTableSelectionContext = createContext<DogsTableSelection | null>(null);

function SelectAllDogsCheckbox() {
  const selection = useContext(DogsTableSelectionContext);
  if (!selection) return null;
  return (
    <span className="flex items-center justify-center">
      <Checkbox
        // Asymmetric on purpose, header only: a uniform -inset-3.5 (like the
        // row checkbox below) grows the 16px control to 44x44, but the
        // header row is only h-10 (40px) tall, so the vertical half
        // overhangs ~2px into row 1 and can steal its first click.
        // The horizontal span is the shared x=0..44 described on SELECT_COLUMN;
        // -inset-y-3 (12px) gives a 40px-tall target that exactly
        // fills the header row's own height, so nothing spills into row 1
        // — but that 40px arithmetic depends on staying wrapped in the
        // `<span>` above: TableHead's `[&>[role=checkbox]]:translate-y-[2px]`
        // is a direct-child selector that only matches a checkbox that IS
        // the `<th>`'s child, so it silently stops applying once the
        // checkbox is wrapped. Unwrap this span and that 2px shift comes
        // back, which would put `-inset-y-3`'s 40px-tall target 2px low —
        // right back to overhanging into row 1.
        className="relative before:absolute before:-left-3 before:-right-4 before:-inset-y-3 before:content-['']"
        checked={selection.isAllSelected}
        indeterminate={selection.isPartiallySelected}
        onCheckedChange={() => selection.toggleAll()}
        aria-label="Select all dogs"
      />
    </span>
  );
}

function SelectDogCheckbox({ dog }: { dog: Dog }) {
  const selection = useContext(DogsTableSelectionContext);
  if (!selection) return null;
  return (
    <span
      className="flex items-center justify-center"
      onClick={e => e.stopPropagation()}
      role="presentation"
    >
      <Checkbox
        className="relative before:absolute before:-left-3 before:-right-4 before:-inset-y-3.5 before:content-['']"
        checked={selection.isSelected(dog)}
        onCheckedChange={() => selection.toggleItem(dog)}
        aria-label={`Select ${getDogDisplayName(dog)}`}
      />
    </span>
  );
}

const SELECT_COLUMN: DisplayColumnDef<Dog, unknown> = {
  id: '_select',
  // The 40px cell width is guaranteed entirely by `min-w-10 max-w-10` on
  // the TH/TD itself (STICKY_LEFT_LEAD_WIDTH_CLASS in `data-table/types.ts`),
  // which also zeroes the cell's side padding, so this wrapper's
  // `flex items-center justify-center` centres the checkbox in the full
  // 40px (MYK9-751; `dogs-table-pinned-select.spec.ts` measures both).
  //
  // Tap target: the 16px checkbox sits at x=12..28, and the pseudo-element
  // spans x=0..44 (`-left-3`, `-right-4`): a full 44px wide, nothing lost to
  // the scroll wrapper's clip at x=0, and 4px into the Name cell, where the
  // lead column's higher z-index keeps it on top.
  header: () => <SelectAllDogsCheckbox />,
  cell: ({ row }) => <SelectDogCheckbox dog={row.original} />,
  enableSorting: false,
  enableHiding: false,
  meta: {
    interactive: true,
    exportDisabled: true,
    // MYK9-592: forces this column to STICKY_LEFT_LEAD_WIDTH_CLASS and pins it
    // at left-0 above the Name column, which pins right after it instead of
    // at left-0 itself (see `stickyLeft: { afterLead: true }` below) — the
    // two now sit side by side under horizontal scroll instead of Name
    // sliding on top of the checkbox, and the checkbox's enlarged tap-target
    // pseudo-element can overhang into the Name cell without being occluded.
    stickyLeftLead: true,
  } satisfies DataTableColumnMeta,
};

function getStatusBadge(status: DogStatus | undefined) {
  switch (status) {
    case 'retired':
      return (
        <Badge variant="secondary" className="text-xs bg-warning/10 text-warning ">
          Retired
        </Badge>
      );
    case 'deceased':
      // Tokens, not raw gray — see the note in DogsGridView's STATUS_BADGES.
      return (
        <Badge variant="secondary" className="text-xs bg-muted text-muted-foreground">
          Deceased
        </Badge>
      );
    default:
      return (
        <Badge variant="secondary" className="text-xs bg-success/10 text-success ">
          Active
        </Badge>
      );
  }
}

function getSexBadge(sex: string | undefined) {
  if (!sex) return null;
  const label = sex.charAt(0).toUpperCase() + sex.slice(1);
  return (
    <Badge
      variant="secondary"
      className={`text-xs ${sex === 'male' ? 'bg-info/10 text-info ' : 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300'}`}
    >
      {label}
    </Badge>
  );
}

const OWNER_COLUMN_ID = 'owner';

/**
 * Name is always the identity column pinned left (MYK9-222): at tablet width
 * the six columns overflow their wrapper, so reaching Status means scrolling
 * right, and an unpinned Name column takes the row's identity with it,
 * leaving the reader looking at a status badge with no idea whose it is.
 *
 * Its pin position depends on whether the select column is also rendered
 * (MYK9-592): with no select column Name is the leftmost column and pins at
 * `left-0` as normal; with one, Name has to pin AFTER it (`afterLead`) or the
 * two would overlap under scroll.
 */
function buildColumns(hasLeadColumn: boolean): ColumnDef<Dog>[] {
  return [
    {
      id: 'name',
      accessorFn: dog => getDogDisplayName(dog),
      header: 'Name',
      meta: {
        stickyLeft: hasLeadColumn ? { afterLead: true } : true,
        exportHeader: 'Name',
        exportValue: (dog: unknown) => getDogDisplayName(dog as Dog),
      } satisfies DataTableColumnMeta,
      cell: ({ row }) => {
        const dog = row.original;
        return (
          <div className="flex items-center gap-2.5">
            {dog.imageUrl ? (
              <img
                src={dog.imageUrl}
                alt={dog.callName || dog.name}
                className="w-8 h-8 rounded-full object-cover flex-shrink-0"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold flex-shrink-0">
                {(getDogDisplayName(dog) || '?').charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <div className="font-medium truncate">{getDogDisplayName(dog)}</div>
              {dog.callName && dog.name && dog.callName !== dog.name && (
                <div className="text-xs text-muted-foreground truncate">{dog.name}</div>
              )}
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: 'breed',
      header: 'Breed',
      // Breed and Sex both appear on the card view, so dropping them costs the
      // reader nothing and buys back the width that was pushing Owner and Status
      // off-screen (MYK9-222).
      //
      // `lg` (1024px), NOT `md`. `md` is `min-width: 768px`, so it fires on no
      // tablet at all — iPad portrait is exactly 768, iPad Air 820, iPad Pro 11"
      // 834, Surface 912 — and the measurement in MYK9-222 was taken at 768. `md`
      // would only have dropped these on phones, where an exhibitor gets cards
      // anyway. A test pins the breakpoint against those device widths.
      meta: {
        responsiveHide: 'lg',
        exportHeader: 'Breed',
        exportValue: (dog: unknown) => (dog as Dog).breed || '',
      } satisfies DataTableColumnMeta,
      cell: ({ row }) => (
        <span className="text-muted-foreground truncate">{getDogBreedLabel(row.original)}</span>
      ),
    },
    {
      accessorKey: 'sex',
      header: 'Sex',
      meta: {
        responsiveHide: 'lg',
        exportHeader: 'Sex',
        exportValue: (dog: unknown) => (dog as Dog).sex || '',
      } satisfies DataTableColumnMeta,
      cell: ({ row }) => getSexBadge(row.original.sex),
    },
    {
      id: OWNER_COLUMN_ID,
      accessorFn: dog => dog.ownerName || '',
      header: 'Owner',
      meta: { exportHeader: 'Owner', exportValue: (dog: unknown) => (dog as Dog).ownerName || '' },
      cell: ({ row }) => (
        <span className="text-muted-foreground truncate">{row.original.ownerName || '—'}</span>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      meta: {
        exportHeader: 'Status',
        exportValue: (dog: unknown) => (dog as Dog).status || 'active',
      },
      cell: ({ row }) => getStatusBadge(row.original.status),
    },
  ];
}

export const DogsTableView: React.FC<DogsTableViewProps> = ({
  dogs,
  selection,
  showOwner = true,
}) => {
  const navigate = useNavigate();

  const hasSelection = Boolean(selection);
  const allColumns = useMemo(() => {
    const cols = buildColumns(hasSelection);
    // Dropped from the column model, not hidden with CSS: unlike the
    // responsive hide, this is not about width. The column carries nothing on
    // this roster, so it should not be in the Columns menu and should not be
    // in the CSV either.
    const visible = showOwner ? cols : cols.filter(col => col.id !== OWNER_COLUMN_ID);
    return hasSelection ? [SELECT_COLUMN, ...visible] : visible;
  }, [hasSelection, showOwner]);

  return (
    <DogsTableSelectionContext.Provider value={selection ?? null}>
      <DataTable
        tableId="dogsBrowse"
        // The remaining columns can still overflow on a narrow viewport, so the
        // scroll region needs a name and a tab stop to be reachable at all
        // without a pointer.
        scrollAreaLabel="Dogs table"
        columns={allColumns}
        data={dogs}
        // Page-level ListControls owns search; table keeps only its Columns control.
        showSearch={false}
        onRowClick={dog => navigate(`/dogs/${dog.id}`)}
        getRowId={dog => dog.id}
      />
    </DogsTableSelectionContext.Provider>
  );
};

export default DogsTableView;
