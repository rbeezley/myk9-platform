import React, { useState, useEffect } from 'react';

/** Debug info collected from notification system checks */
interface NotificationDebugInfo {
  notificationSupport?: boolean;
  notificationPermission?: NotificationPermission;
  serviceWorkerSupport?: boolean;
  serviceWorkerReady?: boolean;
  serviceWorkerActive?: boolean;
  serviceWorkerError?: string;
  currentLicense?: string | null;
  notificationPrefs?: string | null;
}

export const NotificationDebugger: React.FC = () => {
  const [debugInfo, setDebugInfo] = useState<NotificationDebugInfo>({});
  const [testResults, setTestResults] = useState<string[]>([]);

  const checkNotificationStatus = async () => {
    const info: NotificationDebugInfo = {};

    // Check notification support
    info.notificationSupport = 'Notification' in window;
    info.notificationPermission = Notification.permission;

    // Check service worker support
    info.serviceWorkerSupport = 'serviceWorker' in navigator;

    if (info.serviceWorkerSupport) {
      try {
        const registration = await navigator.serviceWorker.ready;
        info.serviceWorkerReady = !!registration;
        info.serviceWorkerActive = !!registration.active;
      } catch (error) {
        info.serviceWorkerError = error instanceof Error ? error.message : String(error);
      }
    }

    // Check current license key
    info.currentLicense = localStorage.getItem('current_show_license');
    info.notificationPrefs = localStorage.getItem('notification_preferences');

    setDebugInfo(info);
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    checkNotificationStatus();
  }, []);

  const addTestResult = (message: string) => {
    setTestResults(prev => [...prev, `${new Date().toLocaleTimeString()}: ${message}`]);
  };

  const testBasicNotification = async () => {
    try {
      addTestResult('Testing basic notification...');

      if (!('Notification' in window)) {
        addTestResult('❌ Notification API not supported');
        return;
      }

      if (Notification.permission !== 'granted') {
        addTestResult('❌ Notification permission not granted');
        const permission = await Notification.requestPermission();
        addTestResult(`Permission result: ${permission}`);
        if (permission !== 'granted') return;
      }

const notification = new Notification('🧪 Debug Test', {
        body: 'This is a direct notification test'
      });

      notification.onclick = () => {
        addTestResult('✅ Notification clicked');
        notification.close();
      };

      addTestResult('✅ Basic notification created');
    } catch (error) {
      addTestResult(`❌ Basic notification error: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const testServiceWorker = async () => {
    try {
      addTestResult('Testing service worker...');

      if (!('serviceWorker' in navigator)) {
        addTestResult('❌ Service Worker not supported');
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      addTestResult('✅ Service worker ready');

      if (registration.active) {
        addTestResult('✅ Service worker active');

        // Test posting message to service worker
        registration.active.postMessage({
          type: 'DEBUG_TEST',
          data: { message: 'Hello from debug' }
        });
        addTestResult('✅ Message sent to service worker');
      } else {
        addTestResult('❌ Service worker not active');
      }
    } catch (error) {
      addTestResult(`❌ Service worker error: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const testPushManager = async () => {
    try {
      addTestResult('Testing push manager...');

      const registration = await navigator.serviceWorker.ready;

      if (!registration.pushManager) {
        addTestResult('❌ Push Manager not supported');
        return;
      }

      addTestResult('✅ Push Manager available');

      try {
        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true
        });
        addTestResult('✅ Push subscription created');
        addTestResult(`Endpoint: ${subscription.endpoint.substring(0, 50)}...`);
      } catch (subError) {
        addTestResult(`⚠️ Push subscription failed: ${subError instanceof Error ? subError.message : String(subError)}`);
        addTestResult('(This is expected in development without VAPID keys)');
      }
    } catch (error) {
      addTestResult(`❌ Push manager error: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  return (
    <div style={{
      background: 'var(--card)',
      padding: '20px',
      borderRadius: '8px',
      margin: '20px',
      border: '1px solid var(--border)'
    }}>
      <h3>🔍 Notification Debugger</h3>

      <div style={{ marginBottom: '20px' }}>
        <h4>System Status:</h4>
        <pre style={{ background: 'var(--muted)', padding: '10px', borderRadius: '4px' }}>
          {JSON.stringify(debugInfo, null, 2)}
        </pre>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <button onClick={testBasicNotification} style={{ marginRight: '10px' }}>
          Test Basic Notification
        </button>
        <button onClick={testServiceWorker} style={{ marginRight: '10px' }}>
          Test Service Worker
        </button>
        <button onClick={testPushManager}>
          Test Push Manager
        </button>
      </div>

      <div>
        <h4>Test Results:</h4>
        <div style={{
          background: 'var(--muted)',
          padding: '10px',
          borderRadius: '4px',
          height: '200px',
          overflow: 'auto',
          fontFamily: 'monospace',
          fontSize: '12px'
        }}>
          {testResults.map((result, index) => (
            <div key={index}>{result}</div>
          ))}
        </div>
        <button
          onClick={() => setTestResults([])}
          style={{ marginTop: '10px' }}
        >
          Clear Results
        </button>
      </div>
    </div>
  );
};