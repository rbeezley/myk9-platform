/**
 * OfflineFallback Component
 *
 * Displayed when user navigates to a route that hasn't been cached
 * and they're offline.
 */

import { WifiOff, RefreshCw, Home } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getVisitedRoutes } from '@/utils/offlineRouter';
import './shared-ui.css';

interface OfflineFallbackProps {
  /**
   * The route path that couldn't be loaded
   */
  path?: string;

  /**
   * Optional message to display
   */
  message?: string;
}

export function OfflineFallback({ path, message }: OfflineFallbackProps) {
  const navigate = useNavigate();
  const visitedRoutes = getVisitedRoutes();

  const handleRetry = () => {
    window.location.reload();
  };

  const handleGoHome = () => {
    navigate('/');
  };

  return (
    <div className="offline-fallback">
      <div className="offline-fallback-content">
        <div className="offline-fallback-icon">
          <WifiOff size={64}  style={{ width: '64px', height: '64px', flexShrink: 0 }} />
        </div>

        <h1>You're Offline</h1>

        <p className="offline-fallback-message">
          {message || (
            <>
              {path && (
                <>
                  The page <strong>{path}</strong> hasn't been cached yet.
                </>
              )}
              {!path && 'This page is not available offline.'}
            </>
          )}
        </p>

        <div className="offline-fallback-actions">
          <button className="offline-fallback-btn offline-fallback-btn-primary" onClick={handleRetry}>
            <RefreshCw size={20}  style={{ width: '20px', height: '20px', flexShrink: 0 }} />
            Retry
          </button>
          <button className="offline-fallback-btn offline-fallback-btn-secondary" onClick={handleGoHome}>
            <Home size={20}  style={{ width: '20px', height: '20px', flexShrink: 0 }} />
            Go Home
          </button>
        </div>

        {visitedRoutes.length > 0 && (
          <div className="offline-fallback-available">
            <h3>Available Pages</h3>
            <p>These pages are cached and available offline:</p>
            <ul>
              {visitedRoutes.slice(0, 5).map((route) => (
                <li key={route}>
                  <a href={route} onClick={(e) => {
                    e.preventDefault();
                    navigate(route);
                  }}>
                    {route}
                  </a>
                </li>
              ))}
              {visitedRoutes.length > 5 && (
                <li className="offline-fallback-more">
                  +{visitedRoutes.length - 5} more
                </li>
              )}
            </ul>
          </div>
        )}

        <div className="offline-fallback-tip">
          <strong>Tip:</strong> When online, visit pages you'll need offline to cache them automatically.
        </div>
      </div>
    </div>
  );
}
