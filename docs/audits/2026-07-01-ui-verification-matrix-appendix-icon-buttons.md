# Appendix: Unlabeled Icon-Only Buttons (A1 sweep list)

> **Status:** Active

Companion to [2026-07-01-ui-verification-matrix.md](2026-07-01-ui-verification-matrix.md) finding **A1**.
Generated 2026-07-01 by an AST sweep (TypeScript compiler) of `apps/myk9show/src/**/*.tsx`:
`<Button>`/`<button>` elements whose children are icon-only (no text, no string-literal expression, no sr-only span, no alt) and whose tag has no `aria-label`/`aria-labelledby`/`title` (prop-spread buttons conservatively excluded).

**Totals: 153 unlabeled of 270 icon-only buttons, 95 files.** House convention to apply: the entries-table pattern (`aria-label={`Actions for ${dog.callName}`}`). Line numbers drift with edits — re-run the sweep or use the icon+context to relocate.

| File | Lines |
| --- | --- |
| `src/components/admin/users/UserFilters.tsx` | 308, 322, 336, 350, 364 |
| `src/components/secretary/ResultsGrid.tsx` | 553, 561, 573, 583, 593 |
| `src/components/sync/SyncProgressIndicator.tsx` | 289, 333, 343, 353, 365 |
| `src/components/common/OptimisticFeedback.tsx` | 125, 170, 176, 233 |
| `src/components/offline/StorageQuotaMonitor.tsx` | 290, 448, 465, 482 |
| `src/components/templates/secretary/ClassSelectionGrid.tsx` | 208, 215, 312, 398 |
| `src/components/alerts/AlertRuleManager.tsx` | 359, 369, 622 |
| `src/components/common/AdvancedSearch.tsx` | 222, 330, 391 |
| `src/components/common/RecentSearches.tsx` | 106, 157, 185 |
| `src/components/common/search/PaginatedSearchResults.tsx` | 292, 344, 379 |
| `src/components/offline/OfflineDataManager/BackupPanel.tsx` | 139, 149, 169 |
| `src/components/optimistic/ProgressOverlay.tsx` | 151, 165, 214 |
| `src/components/shows/RegistrationWorkflow/InfiniteDogSelectionStep.tsx` | 256, 264, 587 |
| `src/components/templates/admin/ClassDefinitionTable.tsx` | 80, 83, 161 |
| `src/components/admin/users/CreateUserDialog.tsx` | 391, 510 |
| `src/components/alerts/AlertNotificationCenter.tsx` | 137, 223 |
| `src/components/base/BulkActionsBar.tsx` | 52, 80 |
| `src/components/base/EntitySidebar.tsx` | 111, 141 |
| `src/components/common/PaginationPerformanceMonitor.tsx` | 178, 221 |
| `src/components/common/SearchPerformanceMonitor.tsx` | 97, 105 |
| `src/components/common/UnifiedSidebar.tsx` | 441, 524 |
| `src/components/entries/EntrySyncStatusBar.tsx` | 218, 228 |
| `src/components/entries/management/EntryListCard.tsx` | 246, 342 |
| `src/components/judges/JudgeScoringInterface.tsx` | 341, 344 |
| `src/components/panels/edit/AddDogPanel/RegistrationTab.tsx` | 73, 76 |
| `src/components/scoring/PlacementRecalculationAlert.tsx` | 445, 464 |
| `src/components/sync/ConflictNotificationCenter.tsx` | 287, 375 |
| `src/components/sync/FieldConflictResolver.tsx` | 171, 203 |
| `src/components/sync/overview/SyncNotificationCenter.tsx` | 215, 296 |
| `src/components/templates/admin/FieldBuilder.tsx` | 231, 238 |
| `src/components/templates/admin/RuleBuilder.tsx` | 253, 260 |
| `src/components/templates/secretary/FieldOverrideForm.tsx` | 346, 472 |
| `src/components/templates/secretary/PersonnelManager.tsx` | 394, 401 |
| `src/pages/secretary/ClassManagementPage.tsx` | 399, 405 |
| `src/pages/TrialDetailsPage.tsx` | 215, 227 |
| `src/components/admin/permissions/AuditLogViewer.tsx` | 512 |
| `src/components/admin/permissions/PermissionInheritanceView.tsx` | 156 |
| `src/components/admin/users/BulkActionsBar.tsx` | 106 |
| `src/components/admin/users/UserDetailsDialog.tsx` | 551 |
| `src/components/alerts/AlertDashboard.tsx` | 497 |
| `src/components/alerts/AlertToast.tsx` | 183 |
| `src/components/clubs/ClubDetails/PastShowsTab.tsx` | 63 |
| `src/components/clubs/ClubDetails/UpcomingShowsTab.tsx` | 82 |
| `src/components/clubs/members/MemberList.tsx` | 113 |
| `src/components/common/virtual/VirtualScrollList.tsx` | 316 |
| `src/components/conflict/ConflictNotifications.tsx` | 300 |
| `src/components/dogs/DogDetails/HealthRecords/AddHealthItemDialog.tsx` | 534 |
| `src/components/dogs/DogDetails/HealthRecords/HealthTimeline.tsx` | 395 |
| `src/components/dogs/DogDetails/TrainingJournal/EnhancedTrainingJournal.tsx` | 356 |
| `src/components/dogs/LazyDogCard.tsx` | 304 |
| `src/components/entries/management/EnrollmentCard.tsx` | 185 |
| `src/components/exhibitor/ClassCheckIn.tsx` | 245 |
| `src/components/exhibitor/LiveResults.tsx` | 210 |
| `src/components/exhibitor/RingMonitor.tsx` | 75 |
| `src/components/judges/AvailabilityFormFields.tsx` | 141 |
| `src/components/judges/JudgeCheckInInterface.tsx` | 506 |
| `src/components/landing/FAQ.tsx` | 76 |
| `src/components/layout/sidebar/RoleSidebar.tsx` | 58 |
| `src/components/optimistic/RollbackNotification.tsx` | 94 |
| `src/components/optimistic/SuccessConfirmation.tsx` | 92 |
| `src/components/optimistic/UndoToast.tsx` | 82 |
| `src/components/panels/edit/ClubEditPanel/PremiumTemplatesTab.tsx` | 156 |
| `src/components/panels/edit/JudgeQualificationPanel.tsx` | 459 |
| `src/components/panels/entities/JudgeCreationPanel/CertificationsSection.tsx` | 70 |
| `src/components/panels/entities/JudgeCreationPanel/QualificationsSection.tsx` | 75 |
| `src/components/preferences/SecuritySettings.tsx` | 45 |
| `src/components/preferences/SyncStatusIndicator.tsx` | 194 |
| `src/components/scoring/JudgeSyncDashboard.tsx` | 256 |
| `src/components/scoring/LiveScoreUpdates.tsx` | 369 |
| `src/components/scoring/MultiAreaScoresheet.tsx` | 419 |
| `src/components/scoring/OptimisticScoreEntry.tsx` | 220 |
| `src/components/scoring/ScoringConflictHandler.tsx` | 449 |
| `src/components/secretary/PromoCodesSection.tsx` | 179 |
| `src/components/secretary/SecretaryClassDashboard.tsx` | 358 |
| `src/components/shows/browse/ShowBulkActionsBar.tsx` | 222 |
| `src/components/shows/RegistrationWorkflow/DogSearchInterface.tsx` | 358 |
| `src/components/shows/RegistrationWorkflow/DraftManager.tsx` | 209 |
| `src/components/shows/ShowDetails/TrialsList.tsx` | 63 |
| `src/components/stewards/GateStewardInterfaceComponents.tsx` | 128 |
| `src/components/subscription/SubscriptionManager.tsx` | 325 |
| `src/components/sync/ShowSyncDashboard.tsx` | 162 |
| `src/components/templates/admin/TemplateList.tsx` | 150 |
| `src/components/templates/DynamicSearchTimeLimits.tsx` | 141 |
| `src/components/ui/date-range-picker.tsx` | 207 |
| `src/components/ui/DelightfulToast.tsx` | 144 |
| `src/components/ui/simple-time-fields.tsx` | 263 |
| `src/components/users/DogCard.tsx` | 48 |
| `src/components/users/UserEnhancedSidebar.tsx` | 223 |
| `src/features/pipeline/components/ChecklistItem.tsx` | 76 |
| `src/pages/admin/permissions/CloneRolePage.tsx` | 291 |
| `src/pages/admin/permissions/CreateRolePage.tsx` | 279 |
| `src/pages/admin/permissions/RoleListPage.tsx` | 179 |
| `src/pages/admin/TemplateManagementPage.tsx` | 472 |
| `src/pages/ClassDetailsPage/index.tsx` | 233 |
| `src/pages/MyEntriesPage/modules/MyEntryCard.tsx` | 321 |
