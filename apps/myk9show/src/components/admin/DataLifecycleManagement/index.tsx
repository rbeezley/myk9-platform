/**
 * Deleted Items admin page.
 *
 * This keeps the real soft-delete restore workflow and removes the old local
 * archive/scheduler/cleanup shell that looked operational but was browser-local.
 */

import { DeletedEntitiesTab } from './DeletedEntitiesTab';

export function DataLifecycleManagement() {
  return (
    <div className="min-h-screen pt-8 pb-8 px-6 max-w-[90rem] mx-auto">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Deleted Items</h1>
          <p className="text-muted-foreground">
            Restore soft-deleted records or permanently delete records that should not be
            recovered.
          </p>
        </div>

        <DeletedEntitiesTab />
      </div>
    </div>
  );
}
