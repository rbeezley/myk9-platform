/**
 * How long the offline session caches (cached roles, and the person pairing
 * that makes account reads possible) stay usable without an online refresh:
 * a show weekend plus travel margin. One constant, so the identity/permission
 * pair cannot drift apart (LESSONS offline-identity-pairing, MYK9-601).
 */
export const OFFLINE_SESSION_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
