/**
 * NotificationAnalytics Class
 *
 * Extracted from notificationService.ts
 * Manages notification delivery tracking and analytics computation.
 *
 * Features:
 * - Delivery record management with automatic pruning
 * - Analytics computation (delivery rate, click rate)
 * - Click and dismiss tracking
 * - Record filtering and querying
 */

/**
 * Notification delivery record
 */
export interface NotificationDeliveryRecord {
  /** Unique notification identifier */
  id: string;
  /** Notification type */
  type: string;
  /** Timestamp when notification was sent */
  sentAt: number;
  /** Whether notification was successfully delivered */
  delivered: boolean;
  /** Whether user clicked the notification */
  clicked: boolean;
  /** Whether user dismissed the notification */
  dismissed: boolean;
  /** Error message if delivery failed */
  error?: string;
  /** Optional license key association */
  licenseKey?: string;
}

/**
 * Computed analytics data
 */
export interface DeliveryAnalytics {
  /** Total notifications sent */
  total: number;
  /** Successfully delivered notifications */
  delivered: number;
  /** Failed delivery notifications */
  failed: number;
  /** Notifications clicked by user */
  clicked: number;
  /** Notifications dismissed by user */
  dismissed: number;
  /** Percentage of successful deliveries */
  deliveryRate: number;
  /** Percentage of delivered notifications that were clicked */
  clickRate: number;
}

/**
 * NotificationAnalytics manages delivery tracking and metrics
 *
 * @example
 * ```ts
 * const analytics = new NotificationAnalytics({ maxRecords: 100 });
 *
 * // Record delivery
 * analytics.recordDelivery({
 *   id: 'notif_123',
 *   type: 'your_turn',
 *   sentAt: Date.now(),
 *   delivered: true,
 *   clicked: false,
 *   dismissed: false
 * });
 *
 * // Track user interaction
 * analytics.markAsClicked('notif_123');
 *
 * // Get metrics
 * const stats = analytics.getAnalytics();
 * logger.log(`Delivery Rate: ${stats.deliveryRate}%`);
 * logger.log(`Click Rate: ${stats.clickRate}%`);
 * ```
 */
export class NotificationAnalytics {
  private records: NotificationDeliveryRecord[] = [];
  private maxRecords: number;

  /**
   * Create a new NotificationAnalytics instance
   *
   * @param options - Configuration options
   * @param options.maxRecords - Maximum number of records to keep (default: 100)
   */
  constructor(options: { maxRecords?: number } = {}) {
    this.maxRecords = options.maxRecords ?? 100;
  }

  /**
   * Record a notification delivery attempt
   *
   * Automatically prunes old records when limit is exceeded.
   *
   * @param record - Delivery record to store
   *
   * @example
   * ```ts
   * analytics.recordDelivery({
   *   id: 'notif_123',
   *   type: 'your_turn',
   *   sentAt: Date.now(),
   *   delivered: true,
   *   clicked: false,
   *   dismissed: false
   * });
   * ```
   */
  recordDelivery(record: NotificationDeliveryRecord): void {
    this.records.push(record);

    // Keep only last N records
    if (this.records.length > this.maxRecords) {
      this.records = this.records.slice(-this.maxRecords);
    }
  }

  /**
   * Mark a notification as clicked by the user
   *
   * @param notificationId - ID of the notification
   * @returns True if record was found and updated
   *
   * @example
   * ```ts
   * const updated = analytics.markAsClicked('notif_123');
   * if (updated) {
   *   logger.log('Click recorded');
   * }
   * ```
   */
  markAsClicked(notificationId: string): boolean {
    const record = this.records.find((r) => r.id === notificationId);
    if (record) {
      record.clicked = true;
      return true;
    }
    return false;
  }

  /**
   * Mark a notification as dismissed by the user
   *
   * @param notificationId - ID of the notification
   * @returns True if record was found and updated
   *
   * @example
   * ```ts
   * const updated = analytics.markAsDismissed('notif_123');
   * if (updated) {
   *   logger.log('Dismiss recorded');
   * }
   * ```
   */
  markAsDismissed(notificationId: string): boolean {
    const record = this.records.find((r) => r.id === notificationId);
    if (record) {
      record.dismissed = true;
      return true;
    }
    return false;
  }

  /**
   * Get computed analytics for all delivery records
   *
   * @returns Analytics object with delivery and engagement metrics
   *
   * @example
   * ```ts
   * const analytics = notificationAnalytics.getAnalytics();
   *
   * logger.log(`Total: ${analytics.total}`);
   * logger.log(`Delivered: ${analytics.delivered} (${analytics.deliveryRate}%)`);
   * logger.log(`Clicked: ${analytics.clicked} (${analytics.clickRate}%)`);
   * logger.log(`Dismissed: ${analytics.dismissed}`);
   * logger.log(`Failed: ${analytics.failed}`);
   * ```
   */
  getAnalytics(): DeliveryAnalytics {
    const total = this.records.length;
    const delivered = this.records.filter((r) => r.delivered).length;
    const failed = total - delivered;
    const clicked = this.records.filter((r) => r.clicked).length;
    const dismissed = this.records.filter((r) => r.dismissed).length;

    return {
      total,
      delivered,
      failed,
      clicked,
      dismissed,
      deliveryRate: total > 0 ? (delivered / total) * 100 : 0,
      clickRate: delivered > 0 ? (clicked / delivered) * 100 : 0,
    };
  }

  /**
   * Get all delivery records
   *
   * @returns Array of all delivery records
   *
   * @example
   * ```ts
   * const records = analytics.getAllRecords();
   * logger.log(`${records.length} notifications tracked`);
   * ```
   */
  getAllRecords(): NotificationDeliveryRecord[] {
    return [...this.records];
  }

  /**
   * Get records filtered by type
   *
   * @param type - Notification type to filter by
   * @returns Array of matching records
   *
   * @example
   * ```ts
   * const yourTurnRecords = analytics.getRecordsByType('your_turn');
   * logger.log(`${yourTurnRecords.length} "your turn" notifications`);
   * ```
   */
  getRecordsByType(type: string): NotificationDeliveryRecord[] {
    return this.records.filter((r) => r.type === type);
  }

  /**
   * Get records filtered by license key
   *
   * @param licenseKey - License key to filter by
   * @returns Array of matching records
   *
   * @example
   * ```ts
   * const userRecords = analytics.getRecordsByLicense('license_abc');
   * logger.log(`${userRecords.length} notifications for this license`);
   * ```
   */
  getRecordsByLicense(licenseKey: string): NotificationDeliveryRecord[] {
    return this.records.filter((r) => r.licenseKey === licenseKey);
  }

  /**
   * Get a specific record by ID
   *
   * @param notificationId - ID of the notification
   * @returns Record if found, undefined otherwise
   *
   * @example
   * ```ts
   * const record = analytics.getRecord('notif_123');
   * if (record) {
   *   logger.log(`Delivered: ${record.delivered}`);
   * }
   * ```
   */
  getRecord(notificationId: string): NotificationDeliveryRecord | undefined {
    return this.records.find((r) => r.id === notificationId);
  }

  /**
   * Clear all delivery records
   *
   * @example
   * ```ts
   * analytics.clearRecords();
   * logger.log('All analytics cleared');
   * ```
   */
  clearRecords(): void {
    this.records = [];
  }

  /**
   * Get count of records
   *
   * @returns Number of stored records
   *
   * @example
   * ```ts
   * const count = analytics.getRecordCount();
   * logger.log(`Tracking ${count} notifications`);
   * ```
   */
  getRecordCount(): number {
    return this.records.length;
  }
}
