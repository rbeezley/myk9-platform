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
import './MigrationTest.css';

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
    <div className="migration-test-container">
      <div className="migration-test-header">
        <h1>🔄 Migration Test Dashboard</h1>
        <p>Test dual-database detection during the migration period</p>
      </div>

      {/* Migration Status */}
      <div className="status-section">
        <h2>Migration Configuration Status</h2>
        <div className="status-grid">
          <div className={`status-item ${migrationStatus.enabled ? 'enabled' : 'disabled'}`}>
            <span className="status-label">Migration Mode</span>
            <span className="status-value">{migrationStatus.enabled ? '✅ Enabled' : '❌ Disabled'}</span>
          </div>
          <div className={`status-item ${migrationStatus.v3Configured ? 'enabled' : 'disabled'}`}>
            <span className="status-label">V3 Database</span>
            <span className="status-value">{migrationStatus.v3Configured ? '✅ Configured' : '❌ Not Configured'}</span>
          </div>
          <div className={`status-item ${migrationStatus.legacyConfigured ? 'enabled' : 'disabled'}`}>
            <span className="status-label">Legacy Database</span>
            <span className="status-value">{migrationStatus.legacyConfigured ? '✅ Configured' : '❌ Not Configured'}</span>
          </div>
          <div className="status-item">
            <span className="status-label">Flutter App URL</span>
            <span className="status-value flutter-url">{migrationStatus.flutterUrl}</span>
          </div>
        </div>
      </div>

      {/* Test Controls */}
      <div className="test-section">
        <h2>Passcode Testing</h2>

        <div className="test-controls">
          <div className="passcode-test-container">
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
              className="test-button primary"
            >
              {isLoading ? 'Testing...' : 'Test Detection'}
            </button>
          </div>

          <div className="quick-test-buttons">
            <button
              onClick={handleTestV3Direct}
              disabled={isLoading}
              className="test-button secondary"
            >
              Test V3 Direct (aa260)
            </button>
            <button
              onClick={clearResults}
              disabled={testResults.length === 0}
              className="test-button clear"
            >
              Clear Results
            </button>
          </div>
        </div>

        {/* Test Instructions */}
        <div className="test-info">
          <h3>How it works:</h3>
          <ul>
            <li>Enter a passcode to test which database it belongs to</li>
            <li>If found in legacy database, it will show redirect URL to Flutter app</li>
            <li>If found in V3 database, it will authenticate normally</li>
            <li>Invalid passcodes will show an error message</li>
          </ul>
        </div>
      </div>

      {/* Test Results */}
      {testResults.length > 0 && (
        <div className="results-section">
          <h2>Test Results</h2>
          <div className="results-list">
            {testResults.map((result) => (
              <div
                key={`${result.passcode}-${result.timestamp.getTime()}`}
                className={`result-item ${result.success ? 'success' : 'failure'} ${result.database}`}
              >
                <div className="result-header">
                  <span className="result-passcode">{result.passcode}</span>
                  <span className={`result-database ${result.database}`}>
                    {result.database === 'v3' && '🆕 V3 Database'}
                    {result.database === 'legacy' && '🔄 Legacy Database'}
                    {result.database === 'unknown' && '❓ Unknown'}
                  </span>
                  <span className={`result-status ${result.success ? 'success' : 'failure'}`}>
                    {result.success ? '✅ Success' : '❌ Failed'}
                  </span>
                </div>
                <div className="result-message">{result.message}</div>
                {result.redirectUrl && (
                  <div className="result-redirect">
                    Redirect URL: <a href={result.redirectUrl} target="_blank" rel="noopener noreferrer">
                      {result.redirectUrl}
                    </a>
                  </div>
                )}
                <div className="result-timestamp">
                  {result.timestamp.toLocaleTimeString()}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="navigation-section">
        <button onClick={goBack} className="nav-button">
          ← Back to Home
        </button>
        <button onClick={goToLogin} className="nav-button primary">
          Go to Login →
        </button>
      </div>
    </div>
  );
}