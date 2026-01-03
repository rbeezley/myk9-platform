/**
 * ShowDetails Sub-components
 *
 * Extracted from ShowDetails.tsx to reduce complexity.
 * Only exports React components (utilities are in showDetailsUtils.ts).
 */

import { ReactNode } from 'react';
import {
  Calendar,
  MapPin,
  Mail,
  Phone,
  Globe,
  Building2,
  User,
  FileText,
  ArrowLeft,
  RefreshCw,
  CloudSun
} from 'lucide-react';
import { HamburgerMenu, CompactOfflineIndicator } from '@/components/ui';
import type { Show } from '@/services/replication';
import {
  type ContactInfo,
  formatDateRange,
  formatPhoneNumber,
  getGoogleMapsUrl,
  getWeatherUrl,
  getFullSiteAddress,
  hasContactInfo
} from './showDetailsUtils';


// ============================================================================
// Types
// ============================================================================

export interface ShowDetailsHeaderProps {
  subtitle?: string;
  isRefreshing?: boolean;
  onRefresh?: () => void;
  showRefreshButton?: boolean;
  /** Long press handlers for hard refresh */
  refreshLongPressHandlers?: {
    onMouseDown: (e: React.MouseEvent) => void;
    onMouseUp: (e: React.MouseEvent) => void;
    onMouseLeave: (e: React.MouseEvent) => void;
    onTouchStart: (e: React.TouchEvent) => void;
    onTouchEnd: (e: React.TouchEvent) => void;
  };
}

// ============================================================================
// Components
// ============================================================================

/**
 * Page header for ShowDetails
 */
export function ShowDetailsHeader({
  subtitle,
  isRefreshing,
  onRefresh,
  showRefreshButton = false,
  refreshLongPressHandlers
}: ShowDetailsHeaderProps) {
  return (
    <header className="page-header show-details-header">
      <div className="header-left">
        <HamburgerMenu currentPage="show" />
        <CompactOfflineIndicator />
      </div>

      <div className="header-center">
        <h1>
          <Building2 className="title-icon" />
          Show Details
        </h1>
        {subtitle && <p className="header-subtitle">{subtitle}</p>}
      </div>

      <div className="header-right">
        {showRefreshButton && onRefresh && (
          <button
            className="header-action-button"
            onClick={onRefresh}
            disabled={isRefreshing}
            title="Refresh (long press for full reload)"
            aria-label="Refresh (long press for full reload)"
            {...refreshLongPressHandlers}
          >
            <RefreshCw size={20} className={isRefreshing ? 'spinning' : ''} />
          </button>
        )}
      </div>
    </header>
  );
}

/**
 * Loading state
 */
export function ShowDetailsLoading() {
  return (
    <div className="show-details-container">
      <ShowDetailsHeader />
      <div className="show-details-loading">
        <RefreshCw className="spinning" size={24} />
        <span>Loading show information...</span>
      </div>
    </div>
  );
}

/**
 * Error state
 */
export function ShowDetailsError({
  error,
  onBack
}: {
  error: string | null;
  onBack: () => void;
}) {
  return (
    <div className="show-details-container">
      <ShowDetailsHeader />
      <div className="show-details-error">
        <p>{error || 'Show not found'}</p>
        <button className="show-details-back-btn" onClick={onBack}>
          <ArrowLeft size={16} />
          Back to Home
        </button>
      </div>
    </div>
  );
}

/**
 * Contact card (Secretary or Chairman)
 */
export function ContactCard({
  title,
  icon,
  contact
}: {
  title: string;
  icon: ReactNode;
  contact: ContactInfo;
}) {
  if (!hasContactInfo(contact)) return null;

  return (
    <section className="show-details-card">
      <h2 className="show-details-card-title">
        {icon}
        {title}
      </h2>

      <div className="show-details-list">
        {contact.name && (
          <div className="show-detail-row">
            <User size={16} className="detail-icon" />
            <span className="detail-text">{contact.name}</span>
          </div>
        )}

        {contact.email && (
          <a
            href={`mailto:${contact.email}`}
            className="show-detail-row show-detail-link"
          >
            <Mail size={16} className="detail-icon" />
            <span className="detail-text">{contact.email}</span>
          </a>
        )}

        {contact.phone && (
          <a
            href={`tel:${contact.phone.replace(/\D/g, '')}`}
            className="show-detail-row show-detail-link"
          >
            <Phone size={16} className="detail-icon" />
            <span className="detail-text">{formatPhoneNumber(contact.phone)}</span>
          </a>
        )}
      </div>
    </section>
  );
}

/**
 * Event details card
 */
export function EventDetailsCard({ show }: { show: Show }) {
  return (
    <section className="show-details-card">
      <h2 className="show-details-card-title">
        <Calendar />
        Event Details
      </h2>

      <div className="show-details-grid">
        <div className="show-detail-inline">
          <span className="detail-label">Club:</span>
          <span className="detail-value">{show.club_name}</span>
        </div>

        {show.website && (
          <a
            href={show.website.startsWith('http') ? show.website : `https://${show.website}`}
            target="_blank"
            rel="noopener noreferrer"
            className="show-detail-row show-detail-link"
          >
            <Globe size={16} className="detail-icon" />
            <span className="detail-text">Club Website</span>
          </a>
        )}

        <div className="show-detail-inline">
          <span className="detail-label">Event:</span>
          <span className="detail-value">{show.show_name}</span>
        </div>

        <div className="show-detail-inline">
          <span className="detail-label">Organization:</span>
          <span className="detail-value">{show.organization}</span>
        </div>

        <div className="show-detail-inline">
          <span className="detail-label">Dates:</span>
          <span className="detail-value">{formatDateRange(show.start_date, show.end_date)}</span>
        </div>

        {show.show_status && (
          <div className="show-detail-inline">
            <span className="detail-label">Status:</span>
            <span className={`detail-value status-badge status-${show.show_status.toLowerCase().replace(/\s+/g, '-')}`}>
              {show.show_status}
            </span>
          </div>
        )}

        {show.event_url && (
          <a
            href={show.event_url.startsWith('http') ? show.event_url : `https://${show.event_url}`}
            target="_blank"
            rel="noopener noreferrer"
            className="show-detail-row show-detail-link event-details-link"
          >
            <Globe size={16} className="detail-icon" />
            <span className="detail-text">Event Website</span>
          </a>
        )}
      </div>
    </section>
  );
}

/**
 * Location card
 */
export function LocationCard({ show }: { show: Show }) {
  const fullSiteAddress = getFullSiteAddress(show);
  const hasLocationInfo = fullSiteAddress || show.location || show.site_name;

  if (!hasLocationInfo) return null;

  return (
    <section className="show-details-card">
      <h2 className="show-details-card-title">
        <MapPin />
        Location
      </h2>

      <div className="show-details-list">
        {show.site_name && (
          <div className="show-detail-row">
            <Building2 size={16} className="detail-icon" />
            <span className="detail-text">{show.site_name}</span>
          </div>
        )}

        {fullSiteAddress && (
          <a
            href={getGoogleMapsUrl(fullSiteAddress)}
            target="_blank"
            rel="noopener noreferrer"
            className="show-detail-row show-detail-link"
          >
            <MapPin size={16} className="detail-icon" />
            <span className="detail-text">{fullSiteAddress}</span>
          </a>
        )}

        {/* Legacy location field as fallback */}
        {!fullSiteAddress && show.location && (
          <a
            href={getGoogleMapsUrl(show.location)}
            target="_blank"
            rel="noopener noreferrer"
            className="show-detail-row show-detail-link"
          >
            <MapPin size={16} className="detail-icon" />
            <span className="detail-text">{show.location}</span>
          </a>
        )}

        {/* Weather link */}
        {(fullSiteAddress || show.location) && (
          <a
            href={getWeatherUrl(show)}
            target="_blank"
            rel="noopener noreferrer"
            className="show-detail-row show-detail-link"
          >
            <CloudSun size={16} className="detail-icon" />
            <span className="detail-text">Check Weather</span>
          </a>
        )}
      </div>
    </section>
  );
}

/**
 * Notes card
 */
export function NotesCard({ notes }: { notes?: string | null }) {
  if (!notes || !notes.trim()) return null;

  return (
    <section className="show-details-card">
      <h2 className="show-details-card-title">
        <FileText />
        Notes
      </h2>
      <p className="show-notes">{notes.trim()}</p>
    </section>
  );
}

/**
 * Upcoming Shows card - shows other myK9Q events + external links
 */
export function UpcomingShowsCard({
  shows,
  currentLicenseKey
}: {
  shows: Show[];
  currentLicenseKey?: string;
  organization?: string; // Kept for API compatibility but not used
}) {
  // Filter to upcoming shows (start_date > today), excluding current show
  const today = new Date().toISOString().split('T')[0];
  const upcomingShows = shows
    .filter(show =>
      show.start_date >= today &&
      show.license_key !== currentLicenseKey
    )
    .sort((a, b) => a.start_date.localeCompare(b.start_date))
    .slice(0, 5); // Limit to 5 shows

  return (
    <section className="show-details-card">
      <h2 className="show-details-card-title">
        <Calendar />
        Find Events
      </h2>

      <div className="show-details-list">
        {/* myK9Q Upcoming Shows */}
        {upcomingShows.length > 0 && (
          <>
            <div className="upcoming-shows-header">Upcoming in myK9Q</div>
            {upcomingShows.map(show => (
              <div key={show.license_key} className="upcoming-show-item">
                <div className="upcoming-show-info">
                  <span className="upcoming-show-name">{show.show_name}</span>
                  <span className="upcoming-show-details">
                    {show.club_name} • {formatDateRange(show.start_date, show.end_date)}
                  </span>
                </div>
              </div>
            ))}
          </>
        )}

        {/* External Links - Always show both */}
        <div className="upcoming-shows-header">Find More Events</div>

        <a
          href="https://www.apps.akc.org/apps/event_calendar/"
          target="_blank"
          rel="noopener noreferrer"
          className="show-detail-row show-detail-link"
        >
          <Globe size={16} className="detail-icon" />
          <span className="detail-text">AKC Event Calendar</span>
        </a>

        <a
          href="https://www.ukcdogs.com/nosework-events"
          target="_blank"
          rel="noopener noreferrer"
          className="show-detail-row show-detail-link"
        >
          <Globe size={16} className="detail-icon" />
          <span className="detail-text">UKC Nosework Events</span>
        </a>
      </div>
    </section>
  );
}
