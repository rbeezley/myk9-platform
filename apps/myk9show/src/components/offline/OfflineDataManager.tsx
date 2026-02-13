/**
 * Re-export barrel for OfflineDataManager
 *
 * The implementation has been decomposed into sub-components under
 * ./OfflineDataManager/ for maintainability. This file preserves the
 * original import path so that existing consumers continue to work.
 */

export { OfflineDataManager } from './OfflineDataManager/index';
export type { StorageQuota, BackupInfo, ExportOptions } from './OfflineDataManager/types';
