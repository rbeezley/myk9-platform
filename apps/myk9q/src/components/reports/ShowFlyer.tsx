import React from 'react';
import { QRCodeSVG } from 'qrcode.react';

export interface ShowFlyerProps {
  showName: string;
  exhibitorPasscode: string;
  loginUrl: string;
  clubName?: string;
  showDates?: string;
  secretaryName?: string;
  chairmanName?: string;
}

export const ShowFlyer: React.FC<ShowFlyerProps> = ({
  showName,
  exhibitorPasscode,
  loginUrl,
  clubName,
  showDates,
  secretaryName,
  chairmanName,
}) => {
  return (
    <div className="print-report show-flyer">
      {/* Page 1 — Show entry point */}
      <div className="flyer-page flyer-page-1">
        <div className="flyer-branding">
          <img src="/myK9Q-teal-192.png" alt="myK9Q Logo" className="flyer-logo" />
          <h1 className="flyer-brand-name">myK9Q</h1>
          <div className="flyer-tagline">
            <span className="flyer-tagline-word">Queue</span>
            <span className="flyer-arrow">&rarr;</span>
            <span className="flyer-tagline-word">Qualify</span>
          </div>
        </div>

        <h2 className="flyer-show-name">{showName}</h2>
        {(clubName || showDates) && (
          <div className="flyer-show-details">
            {clubName && <p className="flyer-club-name">{clubName}</p>}
            {showDates && <p className="flyer-show-dates">{showDates}</p>}
          </div>
        )}

        <div className="flyer-qr-section">
          <p className="flyer-qr-instruction">Scan to access your show</p>
          <QRCodeSVG value={loginUrl} size={280} level="M" marginSize={4} />
        </div>

        <div className="flyer-passcode-section">
          <p className="flyer-passcode-label">Exhibitor Pass Code</p>
          <div className="flyer-passcode-value">{exhibitorPasscode}</div>
          <p className="flyer-passcode-hint">
            Or visit <strong>myk9q.com</strong> and enter this code
          </p>
        </div>
      </div>

      {/* Page 2 — Getting Started Guide */}
      <div className="flyer-page flyer-page-2">
        <div className="flyer-branding-small">
          <img src="/myK9Q-teal-192.png" alt="myK9Q Logo" className="flyer-logo-sm" />
          <span className="flyer-brand-name-sm">myK9Q</span>
          <span className="flyer-tagline-sm">Getting Started Guide</span>
          <span className="flyer-header-show">{showName}</span>
        </div>

        <div className="guide-features">
          <h3>What You Can Do</h3>
          <div className="guide-feature-grid">
            <div className="guide-feature-item">
              <span className="guide-feature-icon">&#x2705;</span>
              <div>
                <strong>Self Check-in</strong>
                <p>Check in from your phone</p>
              </div>
            </div>
            <div className="guide-feature-item">
              <span className="guide-feature-icon">&#x1F514;</span>
              <div>
                <strong>Push Notifications</strong>
                <p>Get notified when your class is ready</p>
              </div>
            </div>
            <div className="guide-feature-item">
              <span className="guide-feature-icon">&#x2764;&#xFE0F;</span>
              <div>
                <strong>Favorite Dogs</strong>
                <p>Follow your dogs across all classes</p>
              </div>
            </div>
            <div className="guide-feature-item">
              <span className="guide-feature-icon">&#x2764;&#xFE0F;</span>
              <div>
                <strong>Favorite Classes</strong>
                <p>Track the classes you care about</p>
              </div>
            </div>
            <div className="guide-feature-item">
              <span className="guide-feature-icon">&#x1F4CA;</span>
              <div>
                <strong>Results &amp; Placements</strong>
                <p>View scores and placements when available</p>
              </div>
            </div>
            <div className="guide-feature-item">
              <span className="guide-feature-icon">&#x1F4F1;</span>
              <div>
                <strong>Offline Access</strong>
                <p>Works without WiFi once loaded</p>
              </div>
            </div>
          </div>
        </div>

        <div className="guide-section">
          <h3>For Exhibitors</h3>
          <ol className="guide-steps">
            <li>
              Scan the QR code or visit <strong>myk9q.com</strong>
            </li>
            <li>
              Enter the exhibitor pass code: <strong>{exhibitorPasscode}</strong>
            </li>
            <li>Enable push notifications when prompted</li>
            <li>Tap the heart on your dogs to add them to Favorites</li>
          </ol>
        </div>

        <div className="guide-section">
          <h3>For Judges &amp; Timers</h3>
          <ol className="guide-steps">
            <li>Get your personal pass code from the Trial Secretary</li>
            <li>
              Visit <strong>myk9q.com</strong> and enter your code
            </li>
            <li>Tap the heart on your assigned classes to add to Favorites</li>
            <li>Enable or disable audible time warnings in Settings</li>
          </ol>
        </div>

        <div className="guide-footer">
          <QRCodeSVG value={loginUrl} size={240} level="M" marginSize={3} />
          <p className="guide-footer-url">www.myk9q.com</p>
          {secretaryName || chairmanName ? (
            <div className="guide-contact">
              <p className="guide-contact-heading">Questions? Contact:</p>
              {secretaryName && (
                <p className="guide-contact-line">
                  <span className="guide-contact-role">Trial Secretary:</span> {secretaryName}
                </p>
              )}
              {chairmanName && (
                <p className="guide-contact-line">
                  <span className="guide-contact-role">Trial Chairman:</span> {chairmanName}
                </p>
              )}
            </div>
          ) : (
            <p className="guide-contact-heading">Questions? Ask the Trial Secretary for help.</p>
          )}
        </div>
      </div>
    </div>
  );
};
