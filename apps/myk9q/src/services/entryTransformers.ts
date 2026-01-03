/**
 * Entry Data Transformers
 *
 * Helper functions for transforming entry data.
 */

/**
 * Convert time string (MM:SS.ss or SS.ss) to decimal seconds
 */
export function convertTimeToSeconds(timeString: string): number {
  if (!timeString || timeString.trim() === '') return 0;

  // Handle different time formats
  if (timeString.includes(':')) {
    // Format: MM:SS.ss or M:SS.ss
    const parts = timeString.split(':');
    if (parts.length === 2) {
      const minutes = parseInt(parts[0]) || 0;
      const seconds = parseFloat(parts[1]) || 0;
      return minutes * 60 + seconds;
    }
  } else {
    // Format: SS.ss (just seconds)
    return parseFloat(timeString) || 0;
  }

  return 0;
}
