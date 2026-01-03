/**
 * Firebase Configuration for FCM Push Notifications
 * Handles Firebase app initialization and messaging setup
 */

import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getMessaging, Messaging } from 'firebase/messaging';

// Firebase configuration interface
interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  measurementId?: string;
}

// Firebase configuration from environment variables
const firebaseConfig: FirebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || undefined,
};

// Validate required configuration
const requiredEnvVars = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID'
];

const missingEnvVars = requiredEnvVars.filter(envVar => !import.meta.env[envVar]);
if (missingEnvVars.length > 0) {
  console.warn('Missing Firebase environment variables:', missingEnvVars);
}

// Initialize Firebase app (singleton pattern)
let firebaseApp: FirebaseApp;
let messaging: Messaging | null = null;

/**
 * Get or initialize Firebase app
 */
export function getFirebaseApp(): FirebaseApp {
  if (!firebaseApp) {
    // Check if Firebase app is already initialized
    const existingApps = getApps();
    if (existingApps.length > 0) {
      firebaseApp = existingApps[0];
    } else {
      firebaseApp = initializeApp(firebaseConfig);
    }
  }
  return firebaseApp;
}

/**
 * Get Firebase messaging instance
 * Returns null if not supported or not available
 */
export function getFirebaseMessaging(): Messaging | null {
  try {
    // Check for browser support
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      console.warn('FCM: Service Worker not supported');
      return null;
    }

    if (!('Notification' in window)) {
      console.warn('FCM: Notifications not supported');
      return null;
    }

    if (!messaging) {
      const app = getFirebaseApp();
      messaging = getMessaging(app);
    }

    return messaging;
  } catch (error) {
    console.error('FCM: Failed to initialize messaging:', error);
    return null;
  }
}

/**
 * Check if FCM is properly configured
 */
export function isFCMConfigured(): boolean {
  return missingEnvVars.length === 0;
}

/**
 * Get FCM configuration status for debugging
 */
export function getFCMConfigStatus() {
  return {
    configured: isFCMConfigured(),
    missingEnvVars,
    hasServiceWorker: typeof window !== 'undefined' && 'serviceWorker' in navigator,
    hasNotifications: typeof window !== 'undefined' && 'Notification' in window,
    projectId: firebaseConfig.projectId,
  };
}

// Export Firebase config for use in service worker
export { firebaseConfig };