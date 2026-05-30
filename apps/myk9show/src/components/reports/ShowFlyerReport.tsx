import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import type { ReportProps } from '@/lib/reports/types';
import { generatePasscodesFromShowId, getExhibitorLoginUrl } from '@/utils/passcodes';

// ─── Page 1: QR code + passcode ───────────────────────────────────────────

interface FlyerPage1Props {
  showName: string;
  clubName?: string | undefined;
  showDates?: string | undefined;
  exhibitorCode: string;
  loginUrl: string;
}

function FlyerPage1({ showName, clubName, showDates, exhibitorCode, loginUrl }: FlyerPage1Props) {
  const metaParts = [clubName, showDates].filter(Boolean);

  return (
    <div className="flyer-page">
      <div className="flyer-brand">
        <div className="flyer-brand-name">myK9Show</div>
        <div className="flyer-brand-tagline">Powered by myK9Show</div>
      </div>

      <h1 className="flyer-show-title">{showName}</h1>
      {metaParts.length > 0 && <p className="flyer-show-meta">{metaParts.join(' · ')}</p>}

      <div className="flyer-qr-section">
        <div className="flyer-qr-block">
          <QRCodeSVG value={loginUrl} size={160} />
          <div className="flyer-qr-label">Scan to log in</div>
        </div>

        <div className="flyer-passcode-block">
          <div className="flyer-passcode-label">Exhibitor Passcode</div>
          <div className="flyer-passcode-value">{exhibitorCode}</div>
          <div className="flyer-passcode-hint">
            Scan the QR code or visit <strong>myk9show.com/at-show</strong> and enter this passcode
            to open the show on any device.
          </div>
          <div className="flyer-passcode-url">myk9show.com/at-show</div>
        </div>
      </div>

      <hr className="flyer-divider" />

      <div className="flyer-footer-note">
        Questions? Ask the trial secretary. &mdash; myK9Show &middot; myk9show.com
      </div>
    </div>
  );
}

// ─── Page 2: Getting-started guide ────────────────────────────────────────

function FlyerPage2() {
  return (
    <div className="flyer-page">
      <div className="flyer-brand">
        <div className="flyer-brand-name">myK9Show</div>
      </div>

      <h2 className="flyer-guide-heading">Getting Started at the Show</h2>
      <p className="flyer-guide-subheading">
        The free ringside experience for exhibitors — check in, track your scores, and stay in the
        loop.
      </p>

      <div className="flyer-guide-section">
        <div className="flyer-guide-section-title">What you can do</div>
        <ul className="flyer-guide-list">
          <li>View your run order and armband number</li>
          <li>Check yourself in at the gate</li>
          <li>See your scores and results as they&apos;re posted</li>
          <li>Track Q counts and title progress across shows</li>
          <li>View the class schedule and judge assignments</li>
        </ul>
      </div>

      <div className="flyer-guide-section">
        <div className="flyer-guide-section-title">How to get in</div>
        <ol className="flyer-guide-steps">
          <li>
            <span>
              Open <strong>myk9show.com/at-show</strong> on your phone or tablet (no download
              required)
            </span>
          </li>
          <li>
            <span>
              Enter the <strong>Exhibitor Passcode</strong> shown on page 1
            </span>
          </li>
          <li>
            <span>Find your dog&apos;s name in the roster and tap to check in</span>
          </li>
          <li>
            <span>Scores and results update automatically as classes run</span>
          </li>
        </ol>
      </div>

      <div className="flyer-guide-section">
        <div className="flyer-guide-section-title">Tips</div>
        <ul className="flyer-guide-list">
          <li>Works on any smartphone, tablet, or laptop — no app store required</li>
          <li>Add it to your home screen for quick access throughout the day</li>
          <li>The passcode is unique to this show — keep it handy</li>
        </ul>
      </div>

      <div className="flyer-footer-note">myK9Show &middot; myk9show.com</div>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────

export const ShowFlyerReport: React.FC<ReportProps> = ({
  showId,
  showName,
  clubName,
  showDates,
}) => {
  if (!showId) {
    return (
      <div className="report-page">
        <p style={{ color: '#888', textAlign: 'center', paddingTop: '2in' }}>
          Show ID is required to generate the flyer.
        </p>
      </div>
    );
  }

  const passcodes = generatePasscodesFromShowId(showId);
  if (!passcodes) {
    return (
      <div className="report-page">
        <p style={{ color: '#888', textAlign: 'center', paddingTop: '2in' }}>
          Unable to generate passcode for this show.
        </p>
      </div>
    );
  }

  const loginUrl = getExhibitorLoginUrl(showId);

  return (
    <>
      <FlyerPage1
        showName={showName}
        clubName={clubName ?? undefined}
        showDates={showDates ?? undefined}
        exhibitorCode={passcodes.exhibitor}
        loginUrl={loginUrl}
      />
      <FlyerPage2 />
    </>
  );
};
