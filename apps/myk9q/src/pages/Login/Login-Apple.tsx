import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { authenticatePasscode } from '../../services/authService';
import { logger } from '@/utils/logger';
import '../../styles/apple-design-system.css';

export const Login: React.FC = () => {
  const [passcode, setPasscode] = useState(['', '', '', '', '']);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const navigate = useNavigate();
  const { login } = useAuth();
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('theme');
    return saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches);
  });

  // Theme effect
  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.setAttribute('data-theme', 'dark');
      localStorage.setItem('theme', 'dark');
    } else {
      root.removeAttribute('data-theme');
      localStorage.setItem('theme', 'light');
    }
  }, [darkMode]);

  const toggleTheme = () => {
    setDarkMode(!darkMode);
  };

  // Focus first input on mount
  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  const handleInputChange = (index: number, value: string) => {
    // Only allow single character
    if (value.length > 1) {
      value = value.slice(-1);
    }

    const newPasscode = [...passcode];
    newPasscode[index] = value.toUpperCase();
    setPasscode(newPasscode);

    // Auto-advance to next input
    if (value && index < 4) {
      inputRefs.current[index + 1]?.focus();
    }

    // Clear error when typing
    if (error) {
      setError('');
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    // Handle backspace
    if (e.key === 'Backspace' && !passcode[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }

    // Handle arrow keys
    if (e.key === 'ArrowLeft' && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
    if (e.key === 'ArrowRight' && index < 4) {
      inputRefs.current[index + 1]?.focus();
    }

    // Handle Enter to submit
    if (e.key === 'Enter') {
      handleSubmit();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedText = e.clipboardData.getData('text').toUpperCase().slice(0, 5);
    const newPasscode = [...passcode];
    
    for (let i = 0; i < pastedText.length && i < 5; i++) {
      newPasscode[i] = pastedText[i];
    }
    
    setPasscode(newPasscode);
    
    // Focus last filled input or last input if all filled
    const lastFilledIndex = Math.min(pastedText.length - 1, 4);
    inputRefs.current[lastFilledIndex]?.focus();
  };

  const handleSubmit = async () => {
    const fullPasscode = passcode.join('');
    
    if (fullPasscode.length !== 5) {
      setError('Please enter all 5 characters');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      // Authenticate passcode against Supabase database
      const showData = await authenticatePasscode(fullPasscode);
      
      if (!showData) {
        throw new Error('Invalid passcode');
      }

      // Login successful
      login(fullPasscode, showData);
      navigate('/home');
    } catch (err) {
      logger.error('Login error:', err);
      setError('Invalid passcode. Please check and try again.');
      
      // Clear passcode and focus first input
      setPasscode(['', '', '', '', '']);
      inputRefs.current[0]?.focus();
    } finally {
      setIsLoading(false);
    }
  };

  const isPasscodeComplete = passcode.every(char => char !== '');

  return (
    <div className="apple-page-container">
      {/* Theme Toggle */}
      <button className="apple-theme-toggle" onClick={toggleTheme} title="Toggle theme">
        {darkMode ? '☀️' : '🌙'}
      </button>

      {/* Main Content */}
      <div style={{ 
        display: 'flex', 
        flexDirection: 'column', 
        alignItems: 'center', 
        justifyContent: 'center', 
        minHeight: '100vh',
        padding: '2rem'
      }}>
        {/* Logo and Branding */}
        <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
          <div style={{
            width: '5rem',
            height: '5rem',
            background: 'var(--brand-gradient)',
            borderRadius: '1.25rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 1.5rem auto',
            boxShadow: '0 8px 24px rgba(0, 122, 255, 0.3)'
          }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="white">
              <path d="M12 2C13.1 2 14 2.9 14 4C14 5.1 13.1 6 12 6C10.9 6 10 5.1 10 4C10 2.9 10.9 2 12 2ZM21 9V7L15 1L13.5 2.5L16.17 5.17L10.58 10.76C10.21 11.13 10 11.62 10 12.14V16H8V22H16V16H14V12.14L18.83 7.31L21 9Z"/>
            </svg>
          </div>
          
          <h1 className="apple-text-title" style={{ margin: '0 0 0.5rem 0' }}>
            myK9Show
          </h1>
          <p className="apple-text-body" style={{ margin: 0, color: 'var(--muted-foreground)' }}>
            Dog Show Scoring Application
          </p>
        </div>

        {/* Login Card */}
        <div className="apple-card" style={{ width: '100%', maxWidth: '400px' }}>
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <h2 className="apple-text-heading" style={{ margin: '0 0 0.5rem 0' }}>
              Enter Show Code
            </h2>
            <p className="apple-text-caption" style={{ margin: 0 }}>
              Enter your 5-character access code
            </p>
          </div>

          {/* Passcode Input Grid */}
          <div style={{ 
            display: 'flex', 
            gap: '0.75rem', 
            justifyContent: 'center',
            marginBottom: '1.5rem'
          }}>
            {passcode.map((char, index) => (
              <input
                key={index}
                ref={el => { inputRefs.current[index] = el; }}
                type="text"
                value={char}
                onChange={e => handleInputChange(index, e.target.value)}
                onKeyDown={e => handleKeyDown(index, e)}
                onPaste={index === 0 ? handlePaste : undefined}
                maxLength={1}
                style={{
                  width: '3rem',
                  height: '3.5rem',
                  textAlign: 'center',
                  fontSize: '1.5rem',
                  fontWeight: '600',
                  fontFamily: 'var(--font-family)',
                  background: 'var(--input)',
                  border: `2px solid ${char ? 'var(--primary)' : 'var(--border)'}`,
                  borderRadius: '0.75rem',
                  color: 'var(--foreground)',
                  outline: 'none',
                  transition: 'all 0.2s var(--apple-ease)',
                  textTransform: 'uppercase'
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = 'var(--primary)';
                  e.target.style.boxShadow = '0 0 0 3px rgba(0, 122, 255, 0.1)';
                }}
                onBlur={(e) => {
                  if (!char) {
                    e.target.style.borderColor = 'var(--border)';
                  }
                  e.target.style.boxShadow = 'none';
                }}
              />
            ))}
          </div>

          {/* Error Message */}
          {error && (
            <div style={{ 
              backgroundColor: 'rgba(255, 59, 48, 0.1)',
              border: '1px solid rgba(255, 59, 48, 0.2)',
              borderRadius: '0.75rem',
              padding: '0.75rem',
              marginBottom: '1.5rem',
              textAlign: 'center'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--token-error)">
                  <path d="M12 2L22 20H2L12 2ZM12 17C11.4 17 11 16.6 11 16S11.4 15 12 15 13 15.4 13 16 12.6 17 12 17ZM11 14V10H13V14H11Z"/>
                </svg>
                <span style={{ color: 'var(--token-error)', fontSize: '0.875rem', fontWeight: '500' }}>
                  {error}
                </span>
              </div>
            </div>
          )}

          {/* Submit Button */}
          <button
            className="apple-button-primary"
            onClick={handleSubmit}
            disabled={!isPasscodeComplete || isLoading}
            style={{ 
              width: '100%',
              marginBottom: '1rem',
              opacity: (!isPasscodeComplete || isLoading) ? 0.5 : 1,
              cursor: (!isPasscodeComplete || isLoading) ? 'not-allowed' : 'pointer'
            }}
          >
            {isLoading ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                <div style={{
                  width: '1rem',
                  height: '1rem',
                  border: '2px solid rgba(255, 255, 255, 0.3)',
                  borderTop: '2px solid white',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite'
                }} />
                Verifying...
              </div>
            ) : (
              'Access Show'
            )}
          </button>

          {/* Help Text */}
          <div style={{ textAlign: 'center' }}>
            <p className="apple-text-caption" style={{ margin: '0 0 0.5rem 0' }}>
              Access code provided by show organizer
            </p>
            <p className="apple-text-caption" style={{ margin: 0 }}>
              Need help? Contact your show secretary
            </p>
          </div>
        </div>

        {/* Footer */}
        <div style={{ textAlign: 'center', marginTop: '3rem' }}>
          <p className="apple-text-caption" style={{ margin: 0 }}>
            © 2024 myK9Show. All rights reserved.
          </p>
        </div>
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};