import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Trophy, Users, Award, Shield,
  ChevronRight, Timer, Bell, Settings, Zap, UserCheck,
  BookOpen, Video, ExternalLink, ArrowRight, Check, DollarSign, Menu, X,
  RefreshCw, WifiOff, Smartphone, BarChart3, Volume2, ClipboardList, Download, Calendar, HelpCircle
} from 'lucide-react';
import { FAQSection } from '../../components/chatbot/FAQSection';
import './Landing.css';

export function Landing() {
  const navigate = useNavigate();
  const [isVisible] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const handleGetStarted = () => {
    navigate('/login');
  };

  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setIsMobileMenuOpen(false);
    }
  };

  return (
    <div className="landing-page">
      {/* Sticky Navigation */}
      <nav className="landing-nav">
        <div className="nav-container">
          <div className="nav-logo" onClick={() => scrollToSection('hero')}>
            <img src="/myK9Q-teal-96.png" alt="myK9Q" className="nav-logo-img" />
            <span className="nav-brand">myK9Q</span>
          </div>

          {/* Desktop Navigation */}
          <div className="nav-links">
            <button onClick={() => scrollToSection('features')} className="nav-link">Features</button>
            <button onClick={() => scrollToSection('capabilities')} className="nav-link">Capabilities</button>
            <button onClick={() => scrollToSection('pricing')} className="nav-link">Pricing</button>
            <button onClick={() => scrollToSection('resources')} className="nav-link">Resources</button>
            <button onClick={() => scrollToSection('faq')} className="nav-link">FAQ</button>
          </div>

          <div className="nav-actions">
            <button onClick={handleGetStarted} className="nav-cta">
              <span>Get Started</span>
              <ChevronRight className="nav-cta-icon" />
            </button>
            <button
              className="nav-mobile-toggle"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              aria-label="Toggle menu"
            >
              {isMobileMenuOpen ? <X /> : <Menu />}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {isMobileMenuOpen && (
          <div className="nav-mobile-menu">
            <button onClick={() => scrollToSection('features')} className="nav-mobile-link">Features</button>
            <button onClick={() => scrollToSection('capabilities')} className="nav-mobile-link">Capabilities</button>
            <button onClick={() => scrollToSection('pricing')} className="nav-mobile-link">Pricing</button>
            <button onClick={() => scrollToSection('resources')} className="nav-mobile-link">Resources</button>
            <button onClick={() => scrollToSection('faq')} className="nav-mobile-link">FAQ</button>
            <button onClick={handleGetStarted} className="nav-mobile-cta">
              Get Started
            </button>
          </div>
        )}
      </nav>

      {/* Hero Section with Diagonal Energy */}
      <section id="hero" className="hero-section">
        <div className="hero-background">
          <div className="hero-diagonal"></div>
          <div className="hero-grid"></div>
        </div>

        <div className="hero-container">
          <div className="hero-layout">
            {/* Left Side - Content with Kinetic Typography */}
            <div className={`hero-content ${isVisible ? 'visible' : ''}`}>
              <div className="hero-logo-section">
                <div className="logo-frame">
                  <img
                    src="/myK9Q-teal-192.png"
                    alt="myK9Q"
                    className="hero-logo"
                  />
                </div>
                <h1 className="hero-brand">myK9Q</h1>
              </div>

              {/* Kinetic Typography - Queue to Qualify */}
              <div className="hero-kinetic">
                <div className="kinetic-line">
                  <span className="kinetic-queue">Queue</span>
                  <div className="kinetic-arrow">
                    <ArrowRight className="arrow-icon" />
                  </div>
                  <span className="kinetic-qualify">Qualify</span>
                </div>
                <div className="kinetic-underline"></div>
              </div>

              <p className="hero-tagline">
                Precision scoring at ring side.<br />
                Rebuilt from the ground up with state-of-the-art technology.
              </p>

              <div className="hero-features">
                <div className="hero-feature">
                  <RefreshCw className="hero-feature-icon" />
                  <span>Real-time Sync</span>
                </div>
                <div className="hero-feature">
                  <WifiOff className="hero-feature-icon" />
                  <span>Offline-first</span>
                </div>
                <div className="hero-feature">
                  <Smartphone className="hero-feature-icon" />
                  <span>Multi-platform</span>
                </div>
                <div className="hero-feature">
                  <Bell className="hero-feature-icon" />
                  <span>Push Notifications</span>
                </div>
              </div>

              <div className="hero-actions">
                <button onClick={handleGetStarted} className="btn-primary">
                  <span>Get Started</span>
                  <ChevronRight className="btn-icon" />
                </button>
              </div>

              <div className="hero-features-compact">
                <div className="feature-compact">
                  <UserCheck className="feature-icon-compact" />
                  <span>Self Check-in</span>
                </div>
                <div className="feature-compact">
                  <Zap className="feature-icon-compact" />
                  <span>Auto Calculate Placements</span>
                </div>
                <div className="feature-compact">
                  <BarChart3 className="feature-icon-compact" />
                  <span>Stats Dashboard</span>
                </div>
              </div>
            </div>

            {/* Right Side - Phone Mockup with Depth */}
            <div className={`hero-visual ${isVisible ? 'visible' : ''}`}>
              <div className="phone-frame">
                <div className="phone-screen">
                  <img
                    src="/home-page-screenshot.png"
                    alt="myK9Q App"
                    className="phone-screenshot"
                  />
                </div>
                <div className="phone-reflection"></div>
              </div>
              <div className="visual-accent"></div>
            </div>
          </div>
        </div>
      </section>

      {/* Roles Section - Asymmetric Grid */}
      <section id="features" className="roles-section">
        <div className="container">
          <div className="section-header">
            <h2 className="section-title">Built for every role</h2>
            <div className="title-accent"></div>
          </div>

          <div className="roles-grid">
            <div className="role-card role-large">
              <div className="role-number">01</div>
              <div className="role-icon-wrapper">
                <Award className="role-icon" />
              </div>
              <h3 className="role-title">Judges</h3>
              <ul className="role-features">
                <li>Multi-timer precision system</li>
                <li>Digital scoresheets (AKC/UKC)</li>
                <li>Quick fault marking</li>
                <li>Auto placement calculation</li>
              </ul>
            </div>

            <div className="role-card">
              <div className="role-number">02</div>
              <div className="role-icon-wrapper">
                <Users className="role-icon" />
              </div>
              <h3 className="role-title">Exhibitors</h3>
              <ul className="role-features">
                <li>Real-time results</li>
                <li>Push notifications</li>
                <li>Performance tracking</li>
                <li>Self check-in</li>
              </ul>
            </div>

            <div className="role-card">
              <div className="role-number">03</div>
              <div className="role-icon-wrapper">
                <Settings className="role-icon" />
              </div>
              <h3 className="role-title">Secretaries</h3>
              <ul className="role-features">
                <li>Complete show management</li>
                <li>Auto synchronization</li>
                <li>Instant exports</li>
                <li>Access control</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Capabilities - Icon Grid */}
      <section id="capabilities" className="capabilities-section">
        <div className="container">
          <div className="section-header">
            <h2 className="section-title">Enterprise-grade reliability</h2>
            <div className="title-accent"></div>
          </div>

          <div className="capabilities-grid">
            <div className="capability-card">
              <Timer className="capability-icon" />
              <h3 className="capability-title">Multi-Timer</h3>
              <p className="capability-desc">Precision timing with concurrent timers.</p>
            </div>

            <div className="capability-card">
              <Trophy className="capability-icon" />
              <h3 className="capability-title">AKC & UKC</h3>
              <p className="capability-desc">All major organization formats supported.</p>
            </div>

            <div className="capability-card">
              <Volume2 className="capability-icon" />
              <h3 className="capability-title">Voice Announcements</h3>
              <p className="capability-desc">Automated 30-second time limit warnings.</p>
            </div>

            <div className="capability-card">
              <ClipboardList className="capability-icon" />
              <h3 className="capability-title">Digital Scoresheets</h3>
              <p className="capability-desc">Complete scoring on any device.</p>
            </div>

            <div className="capability-card">
              <Download className="capability-icon" />
              <h3 className="capability-title">Direct Export</h3>
              <p className="capability-desc">Download results directly to secretary software.</p>
            </div>

            <div className="capability-card">
              <Shield className="capability-icon" />
              <h3 className="capability-title">Secure</h3>
              <p className="capability-desc">Role-based permissions and authentication.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="pricing-section">
        <div className="container">
          <div className="section-header">
            <h2 className="section-title">Simple, transparent pricing</h2>
            <div className="title-accent"></div>
          </div>

          <div className="pricing-grid">
            {/* Exhibitor Card - Free */}
            <div className="pricing-card pricing-card-free">
              <div className="pricing-badge">Most Popular</div>
              <div className="pricing-icon-wrapper">
                <Users className="pricing-icon" />
              </div>
              <h3 className="pricing-title">Exhibitors</h3>
              <div className="pricing-price">
                <span className="price-amount">Free</span>
              </div>
              <p className="pricing-desc">
                Complete access to all exhibitor features at no cost
              </p>
              <ul className="pricing-features">
                <li>
                  <Check className="feature-check" />
                  <span>Real-time results & notifications</span>
                </li>
                <li>
                  <Check className="feature-check" />
                  <span>Self check-in</span>
                </li>
                <li>
                  <Check className="feature-check" />
                  <span>Performance tracking</span>
                </li>
                <li>
                  <Check className="feature-check" />
                  <span>Offline access</span>
                </li>
              </ul>
              <button onClick={handleGetStarted} className="pricing-button pricing-button-free">
                <span>Get Started Free</span>
                <ChevronRight className="btn-icon" />
              </button>
            </div>

            {/* Club Card - $65 per show */}
            <div className="pricing-card pricing-card-club">
              <div className="pricing-icon-wrapper">
                <Shield className="pricing-icon" />
              </div>
              <h3 className="pricing-title">Clubs</h3>
              <div className="pricing-price">
                <span className="price-currency">$</span>
                <span className="price-amount">65</span>
                <span className="price-period">per show</span>
              </div>
              <p className="pricing-desc">
                Professional show management with complete control
              </p>
              <p className="pricing-note">
                Requires mySWT or myNWT trial secretary software to upload entries
              </p>
              <ul className="pricing-features">
                <li>
                  <Check className="feature-check" />
                  <span>Unlimited judges & stewards</span>
                </li>
                <li>
                  <Check className="feature-check" />
                  <span>Real-time synchronization</span>
                </li>
                <li>
                  <Check className="feature-check" />
                  <span>Auto exports & reports</span>
                </li>
              </ul>
              <a
                href="https://myk9t.com/product/myk9q-1-show/"
                target="_blank"
                rel="noopener noreferrer"
                className="pricing-button pricing-button-club"
              >
                <DollarSign className="btn-icon" />
                <span>Buy License Key</span>
                <ExternalLink className="btn-icon" />
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Resources Section */}
      <section id="resources" className="resources-section">
        <div className="container">
          <div className="section-header">
            <h2 className="section-title">Learn myK9Q</h2>
            <div className="title-accent"></div>
          </div>

          <div className="resources-grid">
            <div className="resource-card resource-card-coming-soon">
              <div className="resource-icon-frame">
                <BookOpen className="resource-icon" />
              </div>
              <div className="resource-content">
                <h3 className="resource-title">User Guide</h3>
                <p className="resource-desc">
                  Complete documentation and tutorials
                </p>
              </div>
              <span className="coming-soon-badge">Coming Soon</span>
            </div>

            <div className="resource-card resource-card-coming-soon">
              <div className="resource-icon-frame">
                <Video className="resource-icon" />
              </div>
              <div className="resource-content">
                <h3 className="resource-title">Video Tutorials</h3>
                <p className="resource-desc">
                  Step-by-step explainer videos
                </p>
              </div>
              <span className="coming-soon-badge">Coming Soon</span>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section id="faq" className="faq-landing-section">
        <div className="container">
          <div className="section-header">
            <h2 className="section-title">Frequently Asked Questions</h2>
            <div className="title-accent"></div>
          </div>

          <div className="faq-landing-content">
            <FAQSection />
          </div>

          <div className="faq-landing-footer">
            <HelpCircle className="faq-footer-icon" />
            <p>Can't find what you're looking for? Log in and ask our AI assistant (AskQ) for help.</p>
          </div>
        </div>
      </section>

      {/* Find Events Section */}
      <section id="events" className="events-section">
        <div className="container">
          <div className="section-header">
            <h2 className="section-title">Find Events</h2>
            <div className="title-accent"></div>
          </div>

          <div className="events-grid">
            <a
              href="https://www.apps.akc.org/apps/event_calendar/"
              target="_blank"
              rel="noopener noreferrer"
              className="event-card"
            >
              <div className="event-icon-frame">
                <Calendar className="event-icon" />
              </div>
              <div className="event-content">
                <h3 className="event-title">AKC Event Calendar</h3>
                <p className="event-desc">
                  Find AKC scent work trials near you
                </p>
              </div>
              <ExternalLink className="event-arrow" />
            </a>

            <a
              href="https://www.ukcdogs.com/nosework-events"
              target="_blank"
              rel="noopener noreferrer"
              className="event-card"
            >
              <div className="event-icon-frame">
                <Calendar className="event-icon" />
              </div>
              <div className="event-content">
                <h3 className="event-title">UKC Nosework Events</h3>
                <p className="event-desc">
                  Browse UKC nosework trials
                </p>
              </div>
              <ExternalLink className="event-arrow" />
            </a>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="cta-section">
        <div className="cta-container">
          <div className="cta-content">
            <h2 className="cta-title">Ready to transform your scoring?</h2>
            <p className="cta-subtitle">
              Experience faster, more accurate event scoring with the next-generation platform.
            </p>
            <button onClick={handleGetStarted} className="btn-cta">
              <span>Get Started Now</span>
              <ChevronRight className="btn-icon" />
            </button>
          </div>
          <div className="cta-decoration"></div>
        </div>
      </section>

      {/* Footer */}
      <footer className="landing-footer">
        <div className="container">
          <div className="footer-content">
            <div className="footer-brand">
              <img src="/myK9Q-teal-96.png" alt="myK9Q" className="footer-logo" />
              <span className="footer-title">myK9Q</span>
            </div>
            <p className="footer-copyright">
              © 2025 myK9Q. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
