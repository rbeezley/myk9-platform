import React, { useState, useEffect } from 'react';
import { testDatabaseConnection } from '../services/authService';
import { supabase } from '../lib/supabase';
import { generatePasscodesFromLicenseKey } from '../utils/auth';

/** Show data from database for display in test panel */
interface ShowTestData {
  id: number;
  show_name: string;
  club_name: string;
  start_date: string;
  license_key: string;
}

export const DatabaseTest: React.FC = () => {
  const [connectionStatus, setConnectionStatus] = useState<'testing' | 'connected' | 'failed'>('testing');
  const [showData, setShowData] = useState<ShowTestData[]>([]);
  const [samplePasscodes, setSamplePasscodes] = useState<string[]>([]);
  const [debugInfo, setDebugInfo] = useState<string>('');
  const [error, setError] = useState<string>('');

  const testConnection = async () => {
    try {
      setConnectionStatus('testing');
      setError('');
      
      // Debug environment variables
      const url = import.meta.env.VITE_SUPABASE_URL;
      const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
      
      setDebugInfo(`URL: ${url ? 'Set' : 'Missing'}, Key: ${key ? 'Set' : 'Missing'}`);
      
      if (!url || !key) {
        setConnectionStatus('failed');
        setError('Missing environment variables');
        return;
      }
      
      // Test basic connection
      const isConnected = await testDatabaseConnection();
      
      if (!isConnected) {
        setConnectionStatus('failed');
        setError('Failed to connect to database');
        return;
      }

      // Fetch sample show data
      const { data: shows, error: showError } = await supabase
        .from('shows')
        .select('*')
        .limit(5);

      if (showError) {
        setError(`Error fetching shows: ${showError.message}`);
        setConnectionStatus('failed');
        return;
      }

      setShowData((shows || []) as ShowTestData[]);
      
      // Generate sample passcodes from the first show
      if (shows && shows.length > 0) {
        const firstShow = shows[0];
        const passcodes = generatePasscodesFromLicenseKey(firstShow.license_key);
        if (passcodes) {
          setSamplePasscodes([
            `Admin: ${passcodes.admin}`,
            `Judge: ${passcodes.judge}`,
            `Steward: ${passcodes.steward}`,
            `Exhibitor: ${passcodes.exhibitor}`
          ]);
        }
      }
      
      setConnectionStatus('connected');
    } catch (err) {
      setConnectionStatus('failed');
      setError(`Connection error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    testConnection();
  }, []);

  return (
    <div style={{ 
      padding: '1rem', 
      margin: '1rem', 
      border: '1px solid #ccc', 
      borderRadius: '8px',
      backgroundColor: '#f9f9f9'
    }}>
      <h3>Database Connection Test</h3>
      
      {connectionStatus === 'testing' && (
        <p style={{ color: 'blue' }}>🔄 Testing connection...</p>
      )}
      
      {connectionStatus === 'connected' && (
        <div>
          <p style={{ color: 'green' }}>✅ Database connected successfully!</p>
          <p>Found {showData.length} show(s) in shows table</p>
          
          {showData.length > 0 && (
            <div style={{ marginTop: '1rem' }}>
              <h4>Sample Shows:</h4>
              {showData.slice(0, 2).map((show, _index) => (
                <div key={show.id} style={{ 
                  backgroundColor: '#e8f4f8', 
                  padding: '0.5rem', 
                  margin: '0.5rem 0', 
                  borderRadius: '4px',
                  fontSize: '0.9rem'
                }}>
                  <div><strong>Show:</strong> {show.show_name}</div>
                  <div><strong>Club:</strong> {show.club_name}</div>
                  <div><strong>Date:</strong> {show.start_date}</div>
                  <div><strong>License:</strong> {show.license_key}</div>
                </div>
              ))}
            </div>
          )}

          {samplePasscodes.length > 0 && (
            <div style={{ 
              marginTop: '1rem', 
              backgroundColor: '#e8f8e8', 
              padding: '0.75rem', 
              borderRadius: '4px' 
            }}>
              <h4>Sample Passcodes (from first show):</h4>
              {samplePasscodes.map((passcode, index) => (
                <div key={index} style={{ 
                  fontFamily: 'monospace', 
                  fontSize: '0.9rem',
                  color: '#2d5d2d'
                }}>
                  {passcode}
                </div>
              ))}
              <p style={{ fontSize: '0.8rem', color: '#666', marginTop: '0.5rem' }}>
                ⬆️ Try logging in with one of these passcodes!
              </p>
            </div>
          )}

          {showData.length === 0 && (
            <div style={{ 
              backgroundColor: '#fff3cd', 
              padding: '0.75rem', 
              borderRadius: '4px', 
              marginTop: '1rem',
              color: '#856404'
            }}>
              <strong>No Show Data Found</strong>
              <p style={{ marginTop: '0.5rem', fontSize: '0.9rem' }}>
                The database connection is working, but there are no shows in the shows table. 
                You need to add some test data to be able to login.
              </p>
            </div>
          )}
        </div>
      )}
      
      {connectionStatus === 'failed' && (
        <div>
          <p style={{ color: 'red' }}>❌ Database connection failed</p>
          <p>Check your .env file and Supabase credentials</p>
          <p style={{ fontSize: '0.8rem', color: '#666' }}>Debug: {debugInfo}</p>
          {error && (
            <p style={{ fontSize: '0.9rem', color: '#d63384', marginTop: '0.5rem' }}>
              Error: {error}
            </p>
          )}
        </div>
      )}
      
      <button 
        onClick={testConnection}
        style={{ 
          marginTop: '1rem',
          padding: '0.5rem 1rem',
          backgroundColor: '#007bff',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer'
        }}
      >
        Refresh Test
      </button>
    </div>
  );
};