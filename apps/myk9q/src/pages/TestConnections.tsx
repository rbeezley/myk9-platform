import React, { useState } from 'react';
import { testDatabaseConnections } from '../utils/testDatabaseConnections';

export const TestConnections: React.FC = () => {
  const [testing, setTesting] = useState(false);
  const [results, setResults] = useState<string>('');

  const runTest = async () => {
    setTesting(true);
    setResults('Running tests... Check the browser console for details.');

    const success = await testDatabaseConnections();

    if (success) {
      setResults('✅ All database connections successful! Check console for details.');
    } else {
      setResults('⚠️ Some tests failed. Check the browser console for details.');
    }

    setTesting(false);
  };

  return (
    <div style={{ padding: '2rem', fontFamily: 'monospace' }}>
      <h1>🔧 Phase 1.3: Database Connection Test</h1>
      <p>This page tests connections to both the new and legacy databases.</p>

      <button
        onClick={runTest}
        disabled={testing}
        style={{
          padding: '0.5rem 1rem',
          fontSize: '1rem',
          backgroundColor: '#6366f1',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: testing ? 'not-allowed' : 'pointer',
          opacity: testing ? 0.5 : 1
        }}
      >
        {testing ? 'Testing...' : 'Run Connection Test'}
      </button>

      {results && (
        <div style={{
          marginTop: '1rem',
          padding: '1rem',
          backgroundColor: '#f3f4f6',
          borderRadius: '4px'
        }}>
          {results}
        </div>
      )}

      <div style={{ marginTop: '2rem', color: '#6b7280' }}>
        <p>💡 Open the browser console (F12) to see detailed test results.</p>
        <p>📝 This is a temporary test page for migration Phase 1.3</p>
        <p>🗑️ This page can be deleted after migration is complete.</p>
      </div>
    </div>
  );
};