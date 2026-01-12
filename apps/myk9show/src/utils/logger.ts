/**
 * Logger utility re-export
 *
 * This re-exports the centralized LoggingService for backward compatibility.
 * All new code should import directly from '@/services/LoggingService'.
 */

export { logger } from '@/services/LoggingService';
