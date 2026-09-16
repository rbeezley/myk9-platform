import React, { useMemo } from 'react';
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

function buildSelectColumn(selection: DogsTableSelection): DisplayColumnDef<Dog, unknown> {
  return {
    id: '_select',
    // Both cells' checkbox is wrapped at a fixed `w-10` (matching
    // STICKY_LEFT_LEAD_WIDTH_CLASS exactly) so the column's own min-content
    // and max-content agree at 40px — see the width doc on
    // STICKY_LEFT_LEAD_WIDTH_CLASS in `data-table/types.ts`.
    header: () => (
      <span className="flex w-10 items-center justify-center">
        <Checkbox
          // Asymmetric on purpose, header only: a uniform -inset-3.5 (like the
          // row checkbox below) grows the 16px control to 44x44, but the
          // header row is only h-10 (40px) tall, so the vertical half
          // overhangs ~2px into row 1 and can steal its first click.
          // -inset-x-3.5 (14px) keeps the 44px-wide horizontal overhang
          // (unchanged — it's what lets the tap target reach into the Name
          // cell); -inset-y-3 (12px) gives a 40px-tall target that exactly
          // fills the header row's own height, so nothing spills into row 1.
          className="relative before:absolute before:-inset-x-3.5 before:-inset-y-3 before:content-['']"
          checked={selection.isAllSelected}
          indeterminate={selection.isPartiallySelected}
          onCheckedChange={() => selection.toggleAll()}
          aria-label="Select all dogs"
        />
      </span>
    ),
    cell: ({ row }) => (
      <span
        className="flex w-10 items-center justify-center"
        onClick={e => e.stopPropagation()}
        role="presentation"
      >
        <Checkbox
          className="relative before:absolute before:-inset-3.5 before:content-['']"
          checked={selection.isSelected(row.original)}
          onCheckedChange={() => selection.toggleItem(row.original)}
          aria-label={`Select ${getDogDisplayName(row.original)}`}
        />
      </span>
    ),
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
}

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

  const allColumns = useMemo(() => {
    const cols = buildColumns(Boolean(selection));
    // Dropped from the column model, not hidden with CSS: unlike the
    // responsive hide, this is not about width. The column carries nothing on
    // this roster, so it should not be in the Columns menu and should not be
    // in the CSV either.
    const visible = showOwner ? cols : cols.filter(col => col.id !== OWNER_COLUMN_ID);
    return selection ? [buildSelectColumn(selection), ...visible] : visible;
  }, [selection, showOwner]);

  return (
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
  );
};

export default DogsTableView;
