/**
 * Migration Test Component
 *
 * This component provides a comprehensive test interface for the dual-database
 * migration functionality. It allows testing of both V3 and legacy database
 * detection and routing during the transition period.
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  detectDatabaseWithValidation,
  getMigrationStatus
} from '../../services/databaseDetectionService';
import { authenticatePasscode } from '../../services/authService';
import { PasscodeInput } from '../../components/PasscodeInput/PasscodeInput';
import { logger } from '@/utils/logger';
import { cn } from '@/lib/utils';

/** Tailwind styles for MigrationTest page */
const styles = {
  container: cn(
    "max-w-4xl mx-auto min-h-screen",
    "px-4 py-6 sm:px-8 sm:py-10",
    "bg-[var(--background-subtle)]"
  ),
  header: "text-center mb-12",
  headerTitle: cn(
    "text-3xl sm:text-4xl font-bold",
    "text-[var(--foreground)] mb-4"
  ),
  headerText: "text-lg text-[var(--token-text-tertiary)]",
  section: cn(
    "bg-white rounded-2xl shadow-sm",
    "p-6 sm:p-8 mb-8",
    "border border-[var(--border)]"
  ),
  sectionTitle: cn(
    "text-2xl font-semibold text-[var(--foreground)]",
    "mb-6"
  ),
  statusGrid: cn(
    "grid gap-4",
    "grid-cols-1 sm:grid-cols-[repeat(auto-fit,minmax(250px,1fr))]"
  ),
  statusItem: cn(
    "flex flex-col p-4",
    "bg-[var(--background-subtle)] rounded-lg",
    "border-2 border-[var(--border)]",
    "transition-all duration-300"
  ),
  statusItemEnabled: "border-[var(--token-success)] bg-[var(--status-qualified-bg)]",
  statusItemDisabled: "border-[var(--token-error)] bg-[var(--status-not-qualified-bg)]",
  statusLabel: cn(
    "text-sm text-[var(--token-text-tertiary)]",
    "font-medium mb-2"
  ),
  statusValue: "text-base font-semibold text-[var(--foreground)]",
  flutterUrl: "text-sm text-[var(--primary)] break-all",
  passcodeContainer: cn(
    "flex flex-col items-center gap-6",
    "mb-6 p-4 sm:p-6",
    "bg-[var(--muted)] rounded-2xl",
    "border-2 border-[var(--border)]"
  ),
  testBtn: cn(
    "px-6 py-3 text-base font-semibold",
    "border-none rounded-lg cursor-pointer",
    "transition-all duration-300",
    "disabled:opacity-50 disabled:cursor-not-allowed"
  ),
  testBtnPrimary: cn(
    "bg-indigo-500 text-white",
    "hover:bg-[var(--primary)] hover:-translate-y-px",
    "hover:shadow-lg hover:shadow-indigo-500/25"
  ),
  testBtnSecondary: cn(
    "bg-[var(--token-success)] text-white",
    "hover:bg-[var(--token-success-contrast)] hover:-translate-y-px",
    "hover:shadow-lg hover:shadow-emerald-500/25"
  ),
  testBtnClear: cn(
    "bg-[var(--status-pulled)] text-white",
    "hover:bg-red-600 hover:-translate-y-px",
    "hover:shadow-lg hover:shadow-red-500/25"
  ),
  quickTestBtns: "flex gap-4 flex-wrap",
  testInfo: cn(
    "bg-sky-50 border border-sky-200 rounded-lg p-4",
    "dark:bg-sky-950/50 dark:border-sky-800"
  ),
  testInfoTitle: cn(
    "text-base font-semibold text-[var(--primary)]",
    "mb-3"
  ),
  testInfoList: cn(
    "m-0 pl-6 text-[var(--primary)]",
    "[&_li]:mb-2 [&_li]:text-sm"
  ),
  resultsList: "flex flex-col gap-4",
  resultItem: cn(
    "p-4 rounded-lg border-2",
    "transition-all duration-300"
  ),
  resultItemSuccess: "bg-[var(--status-qualified-bg)] border-[var(--token-success)]",
  resultItemFailure: "bg-[var(--status-not-qualified-bg)] border-[var(--token-error)]",
  resultItemV3: "border-l-[6px] border-l-[var(--primary)]",
  resultItemLegacy: "border-l-[6px] border-l-[var(--status-conflict)]",
  resultHeader: cn(
    "flex flex-col sm:flex-row gap-4",
    "items-start sm:items-center",
    "flex-wrap mb-3"
  ),
  resultPasscode: cn(
    "text-xl font-bold font-mono",
    "text-[var(--foreground)]"
  ),
  resultDatabase: cn(
    "px-3 py-1 rounded text-sm font-semibold"
  ),
  resultDbV3: "bg-violet-100 text-[var(--primary)] dark:bg-violet-900/50",
  resultDbLegacy: "bg-amber-100 text-[var(--token-warning-contrast)] dark:bg-amber-900/50",
  resultDbUnknown: "bg-[var(--input)] text-[var(--token-text-tertiary)]",
  resultStatus: cn(
    "text-sm font-semibold",
    "sm:ml-auto"
  ),
  resultStatusSuccess: "text-[var(--token-success)]",
  resultStatusFailure: "text-[var(--token-error)]",
  resultMessage: cn(
    "text-[var(--muted-foreground)] mb-3",
    "text-[15px]"
  ),
  resultRedirect: cn(
    "bg-[var(--input)] p-3 rounded text-sm mb-3",
    "[&_a]:text-[var(--primary)] [&_a]:no-underline [&_a]:font-medium",
    "[&_a:hover]:underline"
  ),
  resultTimestamp: "text-xs text-[var(--token-text-muted)]",
  navSection: cn(
    "flex flex-col sm:flex-row justify-center gap-4",
    "mt-8"
  ),
  navBtn: cn(
    "px-6 py-3 text-base font-semibold",
    "w-full sm:w-auto",
    "border-2 border-[var(--border)] rounded-lg",
    "bg-white text-[var(--token-text-tertiary)]",
    "cursor-pointer transition-all duration-300",
    "hover:bg-[var(--muted)] hover:-translate-y-px"
  ),
  navBtnPrimary: cn(
    "bg-indigo-500 text-white border-[var(--primary)]",
    "hover:bg-[var(--primary)] hover:border-indigo-600",
    "hover:shadow-lg hover:shadow-indigo-500/25"
  ),
};

interface TestResult {
  passcode: string;
  database: 'v3' | 'legacy' | 'unknown';
  success: boolean;
  message: string;
  timestamp: Date;
  redirectUrl?: string;
}

export function MigrationTest() {
  const navigate = useNavigate();
  const [testPasscode, setTestPasscode] = useState(['', '', '', '', '']);
  const [isLoading, setIsLoading] = useState(false);
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [migrationStatus, setMigrationStatus] = useState(getMigrationStatus());

  useEffect(() => {
    // Refresh migration status
    setMigrationStatus(getMigrationStatus());
  }, []);

  const handleTestPasscode = async (passcodeString?: string) => {
    const fullPasscode = passcodeString || testPasscode.join('');

    if (!fullPasscode || fullPasscode.length !== 5) {
      alert('Please enter a 5-character passcode');
      return;
    }

    setIsLoading(true);

    try {
      // Test database detection
const detectionResult = await detectDatabaseWithValidation(fullPasscode);

      // Create test result
      const result: TestResult = {
        passcode: fullPasscode,
        database: detectionResult.database,
        success: !!detectionResult.showData,
        message: detectionResult.message || 'Detection completed',
        timestamp: new Date(),
        redirectUrl: detectionResult.redirectUrl
      };

      // Add to results
      setTestResults(prev => [result, ...prev]);

      // Clear input
      setTestPasscode(['', '', '', '', '']);

      // Show result
} catch (error) {
      logger.error('Test error:', error);

      const result: TestResult = {
        passcode: fullPasscode,
        database: 'unknown',
        success: false,
        message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date()
      };

      setTestResults(prev => [result, ...prev]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleTestV3Direct = async () => {
    const testPasscodeV3 = 'aa260'; // Default test passcode for V3

    setIsLoading(true);

    try {
      const showData = await authenticatePasscode(testPasscodeV3);

      const result: TestResult = {
        passcode: testPasscodeV3,
        database: 'v3',
        success: !!showData,
        message: showData
          ? `V3 Authentication successful: ${showData.showName}`
          : 'V3 Authentication failed',
        timestamp: new Date()
      };

      setTestResults(prev => [result, ...prev]);

    } catch (error) {
      logger.error('V3 test error:', error);

      const result: TestResult = {
        passcode: testPasscodeV3,
        database: 'v3',
        success: false,
        message: `V3 Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date()
      };

      setTestResults(prev => [result, ...prev]);
    } finally {
      setIsLoading(false);
    }
  };

  const clearResults = () => {
    setTestResults([]);
  };

  const goToLogin = () => {
    navigate('/login');
  };

  const goBack = () => {
    navigate('/');
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.headerTitle}>🔄 Migration Test Dashboard</h1>
        <p className={styles.headerText}>Test dual-database detection during the migration period</p>
      </div>

      {/* Migration Status */}
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Migration Configuration Status</h2>
        <div className={styles.statusGrid}>
          <div className={cn(styles.statusItem, migrationStatus.enabled ? styles.statusItemEnabled : styles.statusItemDisabled)}>
            <span className={styles.statusLabel}>Migration Mode</span>
            <span className={styles.statusValue}>{migrationStatus.enabled ? '✅ Enabled' : '❌ Disabled'}</span>
          </div>
          <div className={cn(styles.statusItem, migrationStatus.v3Configured ? styles.statusItemEnabled : styles.statusItemDisabled)}>
            <span className={styles.statusLabel}>V3 Database</span>
            <span className={styles.statusValue}>{migrationStatus.v3Configured ? '✅ Configured' : '❌ Not Configured'}</span>
          </div>
          <div className={cn(styles.statusItem, migrationStatus.legacyConfigured ? styles.statusItemEnabled : styles.statusItemDisabled)}>
            <span className={styles.statusLabel}>Legacy Database</span>
            <span className={styles.statusValue}>{migrationStatus.legacyConfigured ? '✅ Configured' : '❌ Not Configured'}</span>
          </div>
          <div className={styles.statusItem}>
            <span className={styles.statusLabel}>Flutter App URL</span>
            <span className={cn(styles.statusValue, styles.flutterUrl)}>{migrationStatus.flutterUrl}</span>
          </div>
        </div>
      </div>

      {/* Test Controls */}
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Passcode Testing</h2>

        <div>
          <div className={styles.passcodeContainer}>
            <PasscodeInput
              value={testPasscode}
              onChange={setTestPasscode}
              onComplete={handleTestPasscode}
              disabled={isLoading}
              autoFocus={true}
            />
            <button
              onClick={() => handleTestPasscode()}
              disabled={isLoading || testPasscode.some(d => d === '')}
              className={cn(styles.testBtn, styles.testBtnPrimary)}
            >
              {isLoading ? 'Testing...' : 'Test Detection'}
            </button>
          </div>

          <div className={styles.quickTestBtns}>
            <button
              onClick={handleTestV3Direct}
              disabled={isLoading}
              className={cn(styles.testBtn, styles.testBtnSecondary)}
            >
              Test V3 Direct (aa260)
            </button>
            <button
              onClick={clearResults}
              disabled={testResults.length === 0}
              className={cn(styles.testBtn, styles.testBtnClear)}
            >
              Clear Results
            </button>
          </div>
        </div>

        {/* Test Instructions */}
        <div className={cn(styles.testInfo, "mt-6")}>
          <h3 className={styles.testInfoTitle}>How it works:</h3>
          <ul className={styles.testInfoList}>
            <li>Enter a passcode to test which database it belongs to</li>
            <li>If found in legacy database, it will show redirect URL to Flutter app</li>
            <li>If found in V3 database, it will authenticate normally</li>
            <li>Invalid passcodes will show an error message</li>
          </ul>
        </div>
      </div>

      {/* Test Results */}
      {testResults.length > 0 && (
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Test Results</h2>
          <div className={styles.resultsList}>
            {testResults.map((result) => (
              <div
                key={`${result.passcode}-${result.timestamp.getTime()}`}
                className={cn(
                  styles.resultItem,
                  result.success ? styles.resultItemSuccess : styles.resultItemFailure,
                  result.database === 'v3' && styles.resultItemV3,
                  result.database === 'legacy' && styles.resultItemLegacy
                )}
              >
                <div className={styles.resultHeader}>
                  <span className={styles.resultPasscode}>{result.passcode}</span>
                  <span className={cn(
                    styles.resultDatabase,
                    result.database === 'v3' && styles.resultDbV3,
                    result.database === 'legacy' && styles.resultDbLegacy,
                    result.database === 'unknown' && styles.resultDbUnknown
                  )}>
                    {result.database === 'v3' && '🆕 V3 Database'}
                    {result.database === 'legacy' && '🔄 Legacy Database'}
                    {result.database === 'unknown' && '❓ Unknown'}
                  </span>
                  <span className={cn(
                    styles.resultStatus,
                    result.success ? styles.resultStatusSuccess : styles.resultStatusFailure
                  )}>
                    {result.success ? '✅ Success' : '❌ Failed'}
                  </span>
                </div>
                <div className={styles.resultMessage}>{result.message}</div>
                {result.redirectUrl && (
                  <div className={styles.resultRedirect}>
                    Redirect URL: <a href={result.redirectUrl} target="_blank" rel="noopener noreferrer">
                      {result.redirectUrl}
                    </a>
                  </div>
                )}
                <div className={styles.resultTimestamp}>
                  {result.timestamp.toLocaleTimeString()}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className={styles.navSection}>
        <button onClick={goBack} className={styles.navBtn}>
          ← Back to Home
        </button>
        <button onClick={goToLogin} className={cn(styles.navBtn, styles.navBtnPrimary)}>
          Go to Login →
        </button>
      </div>
    </div>
  );
}