# Placement Server-Side Plan

## Problem

myK9Q scoring currently writes optimistically to the replicated entries cache, then also calls `submitScore()` for the online server write. `submitScore()` owns class completion checks and final placement recalculation, so the happy path can double-write the same entry and the retry path remains tied to client-side side effects.

## Solution

1. Make replicated entry scoring queue the server `entries` update through the shared mutation path.
2. Mark dirty replicated rows synced only after the mutation manager confirms upload.
3. Move class completion and placement recalculation into a Supabase trigger that runs when scoring fields change.
4. Stop the optimistic scoring hook from calling direct `submitScore()` for normal scoring saves.

## Testing

1. Add regression coverage that `ReplicatedEntriesTable.markAsScored()` queues the scoring update payload.
2. Add mutation-manager coverage that successful uploads clear dirty replicated rows.
3. Add hook coverage that optimistic scoring does not call `submitScore()` or side-channel `markAsSynced()`.
4. Run focused myK9Q scoring/replication tests and typecheck as time allows.
