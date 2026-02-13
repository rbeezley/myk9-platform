/**
 * DogDetailsMain - Re-export from modular sub-components
 *
 * This file was refactored from a 1,047-line monolithic component into
 * focused sub-components located in ./DogDetailsMain/ directory:
 *
 * - index.tsx         - Main orchestrator component
 * - HeroProfileCard   - Profile photo, name, badges
 * - DogInfoCards      - About & Physical Characteristics cards
 * - OwnerInfoCard     - Owner contact information
 * - DogSummaryCard    - Stats summary (registrations, health records)
 * - DogDetailsTabs    - Tab navigation (registrations, competitions, etc.)
 * - DogDialogs        - Edit, Delete, and Photo dialogs
 * - EditableValue     - Inline editable value display
 * - Skeletons         - Loading skeleton components
 * - utils.ts          - Helper functions (date formatting, validation)
 * - types.ts          - Shared TypeScript interfaces
 */
export { default } from './DogDetailsMain/index';
